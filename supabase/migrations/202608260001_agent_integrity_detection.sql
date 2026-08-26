-- Agent integrity evidence and server-side anomaly detection.
-- This is intentionally an evidence system, not a claim that a locally owned
-- computer is impossible to modify. Client reports are correlated with server
-- timestamps and retained for authorized operational review.

create table public.agent_integrity_reports (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  device_id uuid not null references public.employee_devices(id) on delete cascade,
  tracking_session_id uuid references public.tracking_sessions(id) on delete set null,
  client_observed_at timestamptz not null,
  executable_sha256 text not null check (executable_sha256 ~ '^[A-Fa-f0-9]{64}$'),
  received_at timestamptz not null default now(),
  constraint agent_integrity_report_time_valid check (
    client_observed_at between received_at - interval '30 days' and received_at + interval '30 days'
  )
);

comment on table public.agent_integrity_reports is
  'Append-only agent executable digest evidence. It contains no file path, file content, token, raw hardware identifier, screenshot, or typed content.';

create table public.activity_integrity_events (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  device_id uuid references public.employee_devices(id) on delete set null,
  tracking_session_id uuid references public.tracking_sessions(id) on delete set null,
  event_type text not null check (event_type in ('clock_skew', 'agent_binary_changed')),
  severity text not null check (severity in ('low', 'medium', 'high')),
  risk_score smallint not null check (risk_score between 0 and 100),
  evidence jsonb not null default '{}'::jsonb check (
    jsonb_typeof(evidence) = 'object' and pg_column_size(evidence) <= 4096
  ),
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 500),
  constraint integrity_resolution_consistent check (
    (resolved_at is null and resolved_by is null and resolution_note is null)
    or (resolved_at is not null and resolved_by is not null)
  )
);

comment on table public.activity_integrity_events is
  'Server-generated integrity anomalies. These are review signals and must not be treated as conclusive evidence of misconduct.';

create index agent_integrity_reports_device_received_idx
  on public.agent_integrity_reports (device_id, received_at desc);
create index activity_integrity_events_open_idx
  on public.activity_integrity_events (detected_at desc)
  where resolved_at is null;
create index activity_integrity_events_employee_idx
  on public.activity_integrity_events (employee_id, detected_at desc);

alter table public.agent_integrity_reports enable row level security;
alter table public.activity_integrity_events enable row level security;

create policy agent_integrity_reports_read
on public.agent_integrity_reports for select to authenticated
using (
  public.has_permission('activity.view_all')
  or public.is_owner(auth.uid())
  or (public.has_permission('activity.view_team') and public.is_team_supervisor_for(employee_id))
);

create policy activity_integrity_events_read
on public.activity_integrity_events for select to authenticated
using (
  public.has_permission('activity.view_all')
  or public.is_owner(auth.uid())
  or (public.has_permission('activity.view_team') and public.is_team_supervisor_for(employee_id))
);

revoke all on public.agent_integrity_reports, public.activity_integrity_events from anon, authenticated;
grant select on public.agent_integrity_reports, public.activity_integrity_events to authenticated;

create or replace function public.activity_record_integrity_report(
  p_device_id uuid,
  p_tracking_session_id uuid,
  p_client_observed_at timestamptz,
  p_executable_sha256 text
)
returns public.agent_integrity_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  device public.employee_devices;
  report public.agent_integrity_reports;
  prior public.agent_integrity_reports;
  skew_seconds integer;
begin
  if not public.has_permission('activity.view_self') then raise exception 'Activity self access required'; end if;
  if p_executable_sha256 !~ '^[A-Fa-f0-9]{64}$' then raise exception 'Invalid executable digest'; end if;
  if p_client_observed_at not between now() - interval '30 days' and now() + interval '30 days' then
    raise exception 'Invalid integrity report timestamp';
  end if;
  select item.* into device from public.employee_devices item
  where item.id = p_device_id and item.employee_id = auth.uid();
  if not found or device.status = 'revoked' then raise exception 'Device not found or revoked'; end if;
  if p_tracking_session_id is not null and not exists (
    select 1 from public.tracking_sessions session
    where session.id = p_tracking_session_id and session.device_id = p_device_id
      and session.employee_id = auth.uid()
  ) then raise exception 'Tracking session does not match device'; end if;

  select item.* into prior from public.agent_integrity_reports item
  where item.device_id = p_device_id
  order by item.received_at desc
  limit 1;

  insert into public.agent_integrity_reports (
    employee_id, device_id, tracking_session_id, client_observed_at, executable_sha256
  ) values (
    auth.uid(), p_device_id, p_tracking_session_id, p_client_observed_at, lower(p_executable_sha256)
  ) returning * into report;

  skew_seconds := abs(extract(epoch from (report.received_at - report.client_observed_at))::integer);
  if skew_seconds > 300 and not exists (
    select 1 from public.activity_integrity_events event
    where event.device_id = p_device_id and event.event_type = 'clock_skew'
      and event.detected_at > now() - interval '24 hours' and event.resolved_at is null
  ) then
    insert into public.activity_integrity_events (
      employee_id, device_id, tracking_session_id, event_type, severity, risk_score, evidence
    ) values (
      auth.uid(), p_device_id, p_tracking_session_id, 'clock_skew',
      case when skew_seconds > 3600 then 'high' else 'medium' end,
      case when skew_seconds > 3600 then 75 else 45 end,
      jsonb_build_object('clockSkewSeconds', skew_seconds, 'evidenceSource', 'server_time_comparison')
    );
  end if;

  if prior.id is not null and prior.executable_sha256 <> report.executable_sha256 and not exists (
    select 1 from public.activity_integrity_events event
    where event.device_id = p_device_id and event.event_type = 'agent_binary_changed'
      and event.detected_at > now() - interval '24 hours' and event.resolved_at is null
  ) then
    insert into public.activity_integrity_events (
      employee_id, device_id, tracking_session_id, event_type, severity, risk_score, evidence
    ) values (
      auth.uid(), p_device_id, p_tracking_session_id, 'agent_binary_changed', 'medium', 55,
      jsonb_build_object('evidenceSource', 'successive_agent_digest_comparison')
    );
  end if;
  return report;
end
$$;

revoke all on function public.activity_record_integrity_report(uuid, uuid, timestamptz, text) from public;
grant execute on function public.activity_record_integrity_report(uuid, uuid, timestamptz, text) to authenticated;

notify pgrst, 'reload schema';
