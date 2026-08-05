-- Coding context (which IDE, which project) tracking. Additive only: existing
-- monitoring_policies rows default to collect_coding_project_names = false, so no
-- existing employee starts reporting this until an admin explicitly opts in.
-- The agent parses IDE window titles on-device and only ever sends a short, sanitized
-- project label -- raw window titles, file names and paths are never accepted here.

alter table public.monitoring_policies
  add column collect_coding_project_names boolean not null default false;

create table public.coding_activity_samples (
  id uuid primary key default gen_random_uuid(),
  local_sample_id text not null,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  tracking_session_id uuid not null references public.tracking_sessions(id) on delete cascade,
  captured_at timestamptz not null,
  ide_name text not null check (ide_name in ('vscode','cursor','intellij','eclipse')),
  project_name text not null check (char_length(project_name) between 1 and 160),
  duration_seconds integer not null check (duration_seconds between 1 and 300),
  created_at timestamptz not null default now(),
  unique(employee_id, local_sample_id)
);
create index coding_activity_employee_time_idx
  on public.coding_activity_samples(employee_id, captured_at desc);

alter table public.coding_activity_samples enable row level security;
create policy coding_activity_read on public.coding_activity_samples for select to authenticated using (
  employee_id = auth.uid() or public.has_permission('activity.view_all') or public.is_owner(auth.uid())
  or (public.has_permission('activity.view_team') and public.is_team_supervisor_for(employee_id))
);
revoke insert, update, delete on public.coding_activity_samples from authenticated;
grant select on public.coding_activity_samples to authenticated;

-- Extend activity_activate_policy again with collect_coding_project_names.
drop function if exists public.activity_activate_policy(
  boolean, integer, integer, integer, integer, integer, boolean, boolean, integer, boolean, text[]
);

create or replace function public.activity_activate_policy(
  p_tracking_enabled boolean,
  p_idle_threshold_seconds integer,
  p_sample_interval_seconds integer,
  p_upload_interval_seconds integer,
  p_offline_sync_limit_seconds integer,
  p_heartbeat_interval_seconds integer,
  p_collect_application_names boolean,
  p_require_acknowledgement boolean,
  p_retention_days integer,
  p_website_blocking_enabled boolean default false,
  p_blocked_domains text[] default '{}',
  p_collect_coding_project_names boolean default false
)
returns public.monitoring_policies
language plpgsql
security definer
set search_path = public
as $$
declare
  next_version integer;
  created_policy public.monitoring_policies;
  normalized_domains text[];
begin
  if not (
    public.has_permission('activity.policies.manage')
    or public.is_owner(auth.uid())
  ) then raise exception 'Monitoring policy administration required'; end if;
  if p_idle_threshold_seconds not between 30 and 86400
     or p_sample_interval_seconds not between 10 and 3600
     or p_upload_interval_seconds not between 30 and 86400
     or p_offline_sync_limit_seconds not between 0 and 2592000
     or p_heartbeat_interval_seconds not between 15 and 3600
     or p_retention_days not between 1 and 3650 then
    raise exception 'Invalid monitoring policy settings';
  end if;

  select array_agg(distinct lower(btrim(domain)))
  into normalized_domains
  from unnest(coalesce(p_blocked_domains, '{}')) as domain
  where btrim(domain) <> '';
  normalized_domains := coalesce(normalized_domains, '{}');
  if array_length(normalized_domains, 1) > 50 then
    raise exception 'A monitoring policy cannot list more than 50 blocked domains';
  end if;
  if exists (
    select 1 from unnest(normalized_domains) as domain
    where char_length(domain) > 253
       or domain !~ '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'
  ) then raise exception 'Invalid blocked domain'; end if;

  perform pg_advisory_xact_lock(hashtext('fieldflow.monitoring_policy'));
  select coalesce(max(policy_version),0)+1 into next_version
  from public.monitoring_policies;
  update public.monitoring_policies set is_active=false where is_active;
  insert into public.monitoring_policies(
    policy_version, is_active, tracking_enabled, idle_threshold_seconds,
    sample_interval_seconds, upload_interval_seconds,
    offline_sync_limit_seconds, heartbeat_interval_seconds,
    collect_application_names, require_acknowledgement, retention_days,
    website_blocking_enabled, blocked_domains, collect_coding_project_names,
    created_by
  ) values (
    next_version, true, p_tracking_enabled, p_idle_threshold_seconds,
    p_sample_interval_seconds, p_upload_interval_seconds,
    p_offline_sync_limit_seconds, p_heartbeat_interval_seconds,
    p_collect_application_names, p_require_acknowledgement, p_retention_days,
    p_website_blocking_enabled, normalized_domains, p_collect_coding_project_names,
    auth.uid()
  )
  returning * into created_policy;
  perform public.activity_write_audit_log(
    null, 'policy.activated', 'monitoring_policy', created_policy.id,
    jsonb_build_object(
      'policyVersion', created_policy.policy_version,
      'trackingEnabled', created_policy.tracking_enabled,
      'websiteBlockingEnabled', created_policy.website_blocking_enabled,
      'collectCodingProjectNames', created_policy.collect_coding_project_names
    )
  );
  return created_policy;
end
$$;

revoke all on function public.activity_activate_policy(
  boolean, integer, integer, integer, integer, integer, boolean, boolean, integer, boolean, text[], boolean
) from public;
grant execute on function public.activity_activate_policy(
  boolean, integer, integer, integer, integer, integer, boolean, boolean, integer, boolean, text[], boolean
) to authenticated;

-- Ingest RPC, modeled on the hardened activity_ingest_website_samples
-- (202608030005_website_offline_session_ingestion.sql): per-sample rejection reasons,
-- session-bounds checks, forbidden-field guard. ideName/projectName are the ONLY
-- string fields accepted -- there is no path for a raw window title, file name or
-- file path to reach this function.
create or replace function public.activity_ingest_coding_samples(
  p_tracking_session_id uuid,
  p_samples jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  tracking_session public.tracking_sessions;
  policy public.monitoring_policies;
  sample jsonb;
  local_sample_id text;
  captured_at timestamptz;
  ide_name text;
  project_name text;
  duration integer;
  rejection_reason text;
  inserted_count integer;
  accepted_count integer := 0;
  duplicate_count integer := 0;
  rejected jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or not public.has_permission('activity.view_self') then
    raise exception 'Activity self access required';
  end if;
  if jsonb_typeof(p_samples) <> 'array'
     or jsonb_array_length(p_samples) not between 1 and 100 then
    raise exception 'Invalid coding sample batch';
  end if;

  select item.* into tracking_session
  from public.tracking_sessions item
  where item.id = p_tracking_session_id
    and item.employee_id = auth.uid();
  if not found then raise exception 'Tracking session not found'; end if;
  if tracking_session.status = 'cancelled' then raise exception 'Tracking session is cancelled'; end if;
  if tracking_session.status not in ('active','ended') then raise exception 'Tracking session is unavailable'; end if;

  select item.* into policy
  from public.monitoring_policies item
  where item.id = tracking_session.monitoring_policy_id
    and item.policy_version = tracking_session.monitoring_policy_version;
  if not found then raise exception 'Session monitoring policy not found'; end if;
  if not policy.tracking_enabled then raise exception 'Activity tracking is disabled'; end if;
  if not policy.collect_coding_project_names then raise exception 'Coding activity collection is disabled'; end if;

  for sample in select value from jsonb_array_elements(p_samples)
  loop
    rejection_reason := null;
    local_sample_id := null;
    begin
      if jsonb_typeof(sample) <> 'object'
         or sample::text ~* '"(url|path|query|title|text|content|password|token|coordinates|employeeId|employee_id|deviceId|device_id|windowTitle|window_title|filePath|file_path|fileName|file_name)"[[:space:]]*:' then
        rejection_reason := 'FORBIDDEN_FIELD';
      end if;

      local_sample_id := btrim(coalesce(sample->>'localSampleId', ''));
      if rejection_reason is null and (
        char_length(local_sample_id) not between 1 and 120
        or local_sample_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'
      ) then rejection_reason := 'INVALID_LOCAL_SAMPLE_ID'; end if;

      captured_at := (sample->>'capturedAt')::timestamptz;
      ide_name := lower(btrim(coalesce(sample->>'ideName', '')));
      project_name := btrim(coalesce(sample->>'projectName', ''));
      duration := coalesce((sample->>'durationSeconds')::integer, 60);

      if rejection_reason is null and (
        ide_name not in ('vscode','cursor','intellij','eclipse')
        or char_length(project_name) not between 1 and 160
        or duration not between 1 and 300
      ) then rejection_reason := 'INVALID_SAMPLE_VALUE'; end if;
      if rejection_reason is null and captured_at > now() + interval '5 minutes' then
        rejection_reason := 'FUTURE_TIMESTAMP';
      elsif rejection_reason is null and captured_at < tracking_session.started_at then
        rejection_reason := 'BEFORE_SESSION_START';
      elsif rejection_reason is null
            and tracking_session.ended_at is not null
            and captured_at > tracking_session.ended_at then
        rejection_reason := 'AFTER_SESSION_END';
      elsif rejection_reason is null
            and captured_at < now() - make_interval(secs => policy.offline_sync_limit_seconds) then
        rejection_reason := 'OFFLINE_SYNC_EXPIRED';
      end if;
    exception when others then
      rejection_reason := 'INVALID_SAMPLE_VALUE';
    end;

    if rejection_reason is not null then
      rejected := rejected || jsonb_build_array(jsonb_build_object(
        'localSampleId', nullif(local_sample_id, ''),
        'reason', rejection_reason
      ));
      continue;
    end if;

    insert into public.coding_activity_samples(
      local_sample_id, employee_id, tracking_session_id, captured_at,
      ide_name, project_name, duration_seconds
    ) values (
      local_sample_id, auth.uid(), tracking_session.id, captured_at,
      ide_name, project_name, duration
    )
    on conflict on constraint coding_activity_samples_employee_id_local_sample_id_key do nothing;
    get diagnostics inserted_count = row_count;
    if inserted_count = 1 then
      accepted_count := accepted_count + 1;
    else
      duplicate_count := duplicate_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'acceptedCount', accepted_count,
    'duplicateCount', duplicate_count,
    'rejectedCount', jsonb_array_length(rejected),
    'rejected', rejected,
    'serverTime', now()
  );
end
$$;

revoke all on function public.activity_ingest_coding_samples(uuid,jsonb) from public;
grant execute on function public.activity_ingest_coding_samples(uuid,jsonb) to authenticated;

notify pgrst, 'reload schema';
