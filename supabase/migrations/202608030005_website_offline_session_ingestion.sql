-- Accept domain-only samples for their original active or recently-ended session.
-- Session policy, time bounds, acknowledgement and offline retention are enforced server-side.

create or replace function public.activity_ingest_website_samples(
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
  hostname text;
  browser text;
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
    raise exception 'Invalid website sample batch';
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
  if policy.require_acknowledgement and not exists (
    select 1
    from public.monitoring_policy_acknowledgements acknowledgement
    where acknowledgement.employee_id = auth.uid()
      and acknowledgement.policy_id = policy.id
      and acknowledgement.policy_version = policy.policy_version
  ) then
    raise exception 'Monitoring policy acknowledgement required';
  end if;

  for sample in select value from jsonb_array_elements(p_samples)
  loop
    rejection_reason := null;
    local_sample_id := null;
    begin
      if jsonb_typeof(sample) <> 'object'
         or sample::text ~* '"(url|path|query|title|text|content|password|token|coordinates|employeeId|employee_id|deviceId|device_id)"[[:space:]]*:' then
        rejection_reason := 'FORBIDDEN_FIELD';
      end if;

      local_sample_id := btrim(coalesce(sample->>'localSampleId', ''));
      if rejection_reason is null and (
        char_length(local_sample_id) not between 1 and 120
        or local_sample_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'
      ) then rejection_reason := 'INVALID_LOCAL_SAMPLE_ID'; end if;

      captured_at := (sample->>'capturedAt')::timestamptz;
      hostname := lower(btrim(coalesce(sample->>'domain', '')));
      browser := lower(btrim(coalesce(sample->>'browserName', '')));
      duration := coalesce((sample->>'durationSeconds')::integer, 60);

      if rejection_reason is null and (
        hostname !~ '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'
        or char_length(hostname) > 253
        or char_length(browser) not between 1 and 40
        or browser !~ '^[a-z0-9._-]+$'
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

    insert into public.website_activity_samples(
      local_sample_id, employee_id, tracking_session_id, captured_at,
      domain, browser_name, duration_seconds
    ) values (
      local_sample_id, auth.uid(), tracking_session.id, captured_at,
      hostname, browser, duration
    )
    on conflict on constraint website_activity_samples_employee_id_local_sample_id_key do nothing;
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

revoke all on function public.activity_ingest_website_samples(uuid,jsonb) from public;
grant execute on function public.activity_ingest_website_samples(uuid,jsonb) to authenticated;

notify pgrst, 'reload schema';
