-- Agent tamper alerting.
--
-- Purpose: give monitoring administrators and supervising managers an immediate,
-- auditable signal when a company-managed FieldFlow agent stops reporting during
-- expected work — because it was uninstalled, its process was ended, the device
-- was powered off or taken offline — or when an employee attempts an action that
-- corporate mode blocks (local sign-out, quit, or an OS uninstall).
--
-- This is intentionally a DETECTION-and-NOTIFICATION system, not a concealment or
-- anti-removal system. It never hides the agent, prevents an authorised person
-- from removing it, or acts covertly. It records that something happened and
-- tells the responsible people. It complements, and does not replace, the
-- existing consent, policy-acknowledgement, and visible-agent model.

-- 1. Durable operational record of tamper/gap events. Unlike
--    activity_integrity_events, resolution here can be performed by the system
--    (an automatic heartbeat recovery), so resolved_at carries no resolver.
create table if not exists public.agent_tamper_events (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  device_id uuid references public.employee_devices(id) on delete set null,
  tracking_session_id uuid references public.tracking_sessions(id) on delete set null,
  event_type text not null check (event_type in (
    'heartbeat_gap',        -- expected-online agent stopped reporting (uninstall/kill/power-off/offline)
    'signout_blocked',      -- employee attempted local sign-out on a managed device
    'quit_blocked',         -- employee attempted to quit the agent on a managed device
    'uninstall_attempt',    -- agent observed an OS uninstall / removal in progress
    'agent_stopped'         -- agent is shutting down while tracking was expected
  )),
  severity text not null default 'high' check (severity in ('low', 'medium', 'high')),
  detail jsonb not null default '{}'::jsonb check (
    jsonb_typeof(detail) = 'object' and pg_column_size(detail) <= 4096
  ),
  detected_at timestamptz not null default now(),
  last_seen_before_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists agent_tamper_events_open_idx
  on public.agent_tamper_events (detected_at desc)
  where resolved_at is null;
create index if not exists agent_tamper_events_device_idx
  on public.agent_tamper_events (device_id, detected_at desc);
create index if not exists agent_tamper_events_employee_idx
  on public.agent_tamper_events (employee_id, detected_at desc);

comment on table public.agent_tamper_events is
  'Server- and agent-reported signals that a managed FieldFlow agent stopped reporting or that a blocked local action was attempted. Review signals, not conclusive proof of misconduct.';

alter table public.agent_tamper_events enable row level security;

-- Monitors (owners, workforce/policy administrators) and the employee''s
-- supervisors may read tamper events in their scope.
create policy agent_tamper_events_read
on public.agent_tamper_events for select to authenticated
using (
  public.is_owner(auth.uid())
  or public.has_permission('activity.view_all')
  or public.has_permission('activity.policies.manage')
  or exists (
    select 1 from public.team_members tm
    join public.teams t on t.id = tm.team_id
    where tm.user_id = agent_tamper_events.employee_id
      and t.supervisor_id = auth.uid()
  )
);
-- No client insert/update/delete: rows are written only by SECURITY DEFINER
-- functions below.

-- 2. Recipient-fanned alerts surfaced in the existing notification feed.
--    Mirrors web_access_alerts so the notifications API can merge it with one
--    added query and the notification bell shows tamper alerts immediately.
create table if not exists public.agent_tamper_alerts (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  employee_id uuid references public.profiles(id) on delete set null,
  alert_type text not null check (alert_type in (
    'agent_offline', 'agent_recovered', 'signout_blocked', 'quit_blocked',
    'uninstall_attempt', 'agent_stopped'
  )),
  title text not null check (char_length(title) between 1 and 200),
  body text not null check (char_length(body) between 1 and 500),
  entity_type text not null check (entity_type in ('employee_device', 'tracking_session', 'agent_tamper_event')),
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists agent_tamper_alerts_recipient_idx
  on public.agent_tamper_alerts (recipient_id, created_at desc);
create index if not exists agent_tamper_alerts_unread_idx
  on public.agent_tamper_alerts (recipient_id, created_at desc)
  where read_at is null;

alter table public.agent_tamper_alerts enable row level security;

create policy agent_tamper_alerts_read
on public.agent_tamper_alerts for select to authenticated
using (recipient_id = auth.uid());
create policy agent_tamper_alerts_mark_read
on public.agent_tamper_alerts for update to authenticated
using (recipient_id = auth.uid())
with check (recipient_id = auth.uid());

-- 3. Fan-out helper: notify every in-scope monitor for an employee.
--    Mirrors web_access_notify_managers.
create or replace function public.activity_notify_monitors(
  p_employee_id uuid,
  p_alert_type text,
  p_title text,
  p_body text,
  p_entity_type text,
  p_entity_id uuid
) returns integer language plpgsql security definer set search_path = public as $$
declare inserted_count integer;
begin
  with recipients as (
    select distinct t.supervisor_id user_id
      from public.team_members tm
      join public.teams t on t.id = tm.team_id
      where tm.user_id = p_employee_id and t.supervisor_id is not null
    union
    select p.id
      from public.profiles p
      where p.active and p.approval_status::text = 'approved'
        and (public.is_owner(p.id) or public.has_permission_as(p.id, 'activity.policies.manage')
             or public.has_permission_as(p.id, 'activity.view_all'))
  )
  insert into public.agent_tamper_alerts(recipient_id, employee_id, alert_type, title, body, entity_type, entity_id)
  select user_id, p_employee_id, p_alert_type, p_title, p_body, p_entity_type, p_entity_id
  from recipients
  where user_id is not null and user_id <> p_employee_id;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end $$;
revoke all on function public.activity_notify_monitors(uuid,text,text,text,text,uuid) from public, authenticated;

-- 4. Client-callable report: the agent reports a blocked local action or an
--    observed removal. Authenticated as the employee; ownership is enforced.
create or replace function public.activity_report_agent_event(
  p_device_id uuid,
  p_event_type text,
  p_detail jsonb default '{}'::jsonb
) returns public.agent_tamper_events
language plpgsql security definer set search_path = public as $$
declare
  device public.employee_devices;
  event public.agent_tamper_events;
  alert_type text;
  title text;
  body text;
begin
  if p_event_type not in ('signout_blocked','quit_blocked','uninstall_attempt','agent_stopped') then
    raise exception 'Unsupported agent event type';
  end if;

  select * into device from public.employee_devices
  where id = p_device_id and employee_id = auth.uid();
  if not found then raise exception 'Device not found for current user'; end if;

  insert into public.agent_tamper_events(employee_id, device_id, event_type, severity, detail, last_seen_before_at)
  values (
    auth.uid(), device.id, p_event_type,
    case when p_event_type = 'uninstall_attempt' then 'high' else 'medium' end,
    coalesce(p_detail, '{}'::jsonb), device.last_seen_at
  )
  returning * into event;

  alert_type := p_event_type;
  title := case p_event_type
    when 'signout_blocked'   then 'Managed agent sign-out attempt'
    when 'quit_blocked'      then 'Managed agent quit attempt'
    when 'uninstall_attempt' then 'Managed agent uninstall attempt'
    when 'agent_stopped'     then 'Managed agent stopped'
  end;
  body := case p_event_type
    when 'uninstall_attempt' then 'An uninstall of the FieldFlow agent was detected on a company-managed device.'
    when 'agent_stopped'     then 'The FieldFlow agent stopped on a company-managed device while tracking was expected.'
    else 'An employee attempted an action that is managed by your organisation on a company-managed device.'
  end;

  perform public.activity_notify_monitors(auth.uid(), alert_type, title, body, 'agent_tamper_event', event.id);
  return event;
end $$;
revoke all on function public.activity_report_agent_event(uuid,text,jsonb) from public;
grant execute on function public.activity_report_agent_event(uuid,text,jsonb) to authenticated;

comment on function public.activity_report_agent_event(uuid,text,jsonb) is
  'Lets the signed-in employee''s agent report a locally blocked action or an observed removal. Ownership is enforced; monitors are notified.';

-- 5. Server-only detector: open heartbeat-gap events for expected-online agents
--    that have gone quiet, and resolve them when reporting resumes.
--    "Expected online" = an active, company-managed (corporate) device, or any
--    device with an open tracking session. Threshold mirrors the extension
--    detector (5 minutes) to tolerate brief network blips at the 60s heartbeat.
create or replace function public.activity_detect_agent_tamper()
returns integer language plpgsql security definer set search_path = public as $$
declare
  affected integer := 0;
  item record;
  new_event public.agent_tamper_events;
  -- Tight detection: 2 minutes = 2 missed 60s heartbeats. Short enough to catch
  -- a stopped/uninstalled agent quickly, long enough to ride out a brief network
  -- blip and avoid false "offline" alerts.
  gap_threshold constant interval := interval '2 minutes';
begin
  -- Open a gap event for each expected-online device gone stale that does not
  -- already have an unresolved gap event.
  for item in
    select d.*
    from public.employee_devices d
    where d.status = 'active'
      and d.last_seen_at is not null
      and d.last_seen_at < now() - gap_threshold
      and (
        d.agent_mode = 'corporate'
        or exists (
          select 1 from public.tracking_sessions ts
          where ts.device_id = d.id and ts.status = 'active'
        )
      )
      and not exists (
        select 1 from public.agent_tamper_events e
        where e.device_id = d.id and e.event_type = 'heartbeat_gap' and e.resolved_at is null
      )
    for update of d
  loop
    insert into public.agent_tamper_events(
      employee_id, device_id, tracking_session_id, event_type, severity, detail, last_seen_before_at
    )
    values (
      item.employee_id, item.id,
      (select ts.id from public.tracking_sessions ts where ts.device_id = item.id and ts.status = 'active' limit 1),
      'heartbeat_gap', 'high',
      jsonb_build_object('agentMode', item.agent_mode, 'lastSeenAt', item.last_seen_at, 'thresholdMinutes', 2),
      item.last_seen_at
    )
    returning * into new_event;

    perform public.activity_notify_monitors(
      item.employee_id, 'agent_offline', 'Managed agent offline',
      'No heartbeat has been received from a company-managed device for over two minutes. It may have been uninstalled, stopped, powered off, or taken offline.',
      'employee_device', item.id
    );
    affected := affected + 1;
  end loop;

  -- Resolve open gap events whose device is reporting again, and notify recovery.
  for item in
    select e.*, d.last_seen_at as device_last_seen
    from public.agent_tamper_events e
    join public.employee_devices d on d.id = e.device_id
    where e.event_type = 'heartbeat_gap'
      and e.resolved_at is null
      and d.last_seen_at is not null
      and d.last_seen_at >= now() - gap_threshold
    for update of e
  loop
    update public.agent_tamper_events set resolved_at = now() where id = item.id;
    perform public.activity_notify_monitors(
      item.employee_id, 'agent_recovered', 'Managed agent back online',
      'A previously offline company-managed device is reporting again.',
      'employee_device', item.device_id
    );
    affected := affected + 1;
  end loop;

  return affected;
end $$;
revoke all on function public.activity_detect_agent_tamper() from public, authenticated;

comment on function public.activity_detect_agent_tamper() is
  'Server-only maintenance function. Opens and resolves agent heartbeat-gap tamper events and notifies monitors. Executed by Supabase Cron.';

-- 6. Run the detector every minute alongside the existing stale-session cron.
select cron.schedule(
  'fieldflow-detect-agent-tamper',
  '* * * * *',
  $cron$select public.activity_detect_agent_tamper();$cron$
);
