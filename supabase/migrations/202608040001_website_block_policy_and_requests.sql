-- Website blocking policy fields + employee request / manager approval workflow.
-- Additive only: existing monitoring_policies rows get safe defaults (blocking stays off
-- until an admin opts in), no existing table or column is altered or dropped.

alter table public.monitoring_policies
  add column website_blocking_enabled boolean not null default false,
  add column blocked_domains text[] not null default '{}';

create table public.website_block_override_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  domain text not null check (char_length(domain) between 1 and 253 and domain = lower(domain) and domain !~ '[/?:#@]'),
  reason text not null check (char_length(reason) between 1 and 500),
  status text not null default 'Pending' check (status in ('Pending','Approved','Rejected','Expired')),
  requested_minutes integer not null default 30 check (requested_minutes between 5 and 480),
  granted_minutes integer check (granted_minutes between 5 and 480),
  override_ends_at timestamptz,
  reviewer_comment text check (char_length(reviewer_comment) <= 500),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index website_block_override_requests_employee_idx
  on public.website_block_override_requests(employee_id, created_at desc);
create index website_block_override_requests_active_idx
  on public.website_block_override_requests(employee_id, status, override_ends_at);

alter table public.website_block_override_requests enable row level security;

create policy website_block_override_requests_select on public.website_block_override_requests
  for select to authenticated using (
    employee_id = auth.uid()
    or public.has_permission('activity.policies.manage')
    or public.is_owner(auth.uid())
  );

create policy website_block_override_requests_insert on public.website_block_override_requests
  for insert to authenticated with check (
    employee_id = auth.uid() and public.has_permission('activity.view_self')
  );

revoke update, delete on public.website_block_override_requests from authenticated;
grant select, insert on public.website_block_override_requests to authenticated;

-- Extend activity_activate_policy with the two new blocking fields. Signature changes
-- require dropping the old overload first so PostgREST does not end up with two
-- ambiguous versions of the same RPC name.
drop function if exists public.activity_activate_policy(
  boolean, integer, integer, integer, integer, integer, boolean, boolean, integer
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
  p_blocked_domains text[] default '{}'
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
    website_blocking_enabled, blocked_domains,
    created_by
  ) values (
    next_version, true, p_tracking_enabled, p_idle_threshold_seconds,
    p_sample_interval_seconds, p_upload_interval_seconds,
    p_offline_sync_limit_seconds, p_heartbeat_interval_seconds,
    p_collect_application_names, p_require_acknowledgement, p_retention_days,
    p_website_blocking_enabled, normalized_domains,
    auth.uid()
  )
  returning * into created_policy;
  perform public.activity_write_audit_log(
    null, 'policy.activated', 'monitoring_policy', created_policy.id,
    jsonb_build_object(
      'policyVersion', created_policy.policy_version,
      'trackingEnabled', created_policy.tracking_enabled,
      'websiteBlockingEnabled', created_policy.website_blocking_enabled
    )
  );
  return created_policy;
end
$$;

revoke all on function public.activity_activate_policy(
  boolean, integer, integer, integer, integer, integer, boolean, boolean, integer, boolean, text[]
) from public;
grant execute on function public.activity_activate_policy(
  boolean, integer, integer, integer, integer, integer, boolean, boolean, integer, boolean, text[]
) to authenticated;

-- Manager/admin decision on a pending override request. Re-checks status so a request
-- can only be resolved once, matching the review_leave_request precedent.
create or replace function public.activity_review_blocklist_override(
  p_request_id uuid,
  p_decision text,
  p_granted_minutes integer,
  p_comment text
)
returns public.website_block_override_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  request public.website_block_override_requests;
begin
  if not (
    public.has_permission('activity.policies.manage')
    or public.is_owner(auth.uid())
  ) then raise exception 'Monitoring policy administration required'; end if;
  if p_decision not in ('Approved','Rejected') then raise exception 'Invalid decision'; end if;
  if p_decision = 'Approved' and (p_granted_minutes is null or p_granted_minutes not between 5 and 480) then
    raise exception 'grantedMinutes must be between 5 and 480 when approving';
  end if;

  select item.* into request from public.website_block_override_requests item
  where item.id = p_request_id for update;
  if not found then raise exception 'Override request not found'; end if;
  if request.status <> 'Pending' then raise exception 'This request has already been reviewed'; end if;

  update public.website_block_override_requests set
    status = p_decision,
    granted_minutes = case when p_decision = 'Approved' then p_granted_minutes else null end,
    override_ends_at = case when p_decision = 'Approved' then now() + make_interval(mins => p_granted_minutes) else null end,
    reviewer_comment = nullif(btrim(coalesce(p_comment, '')), ''),
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = request.id
  returning * into request;

  perform public.activity_write_audit_log(
    request.employee_id, 'blocklist_override.' || lower(p_decision), 'website_block_override_request', request.id,
    jsonb_build_object('domain', request.domain, 'grantedMinutes', request.granted_minutes)
  );
  return request;
end
$$;

revoke all on function public.activity_review_blocklist_override(uuid, text, integer, text) from public;
grant execute on function public.activity_review_blocklist_override(uuid, text, integer, text) to authenticated;

notify pgrst, 'reload schema';
