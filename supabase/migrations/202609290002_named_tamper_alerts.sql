-- Put the employee name and device name into agent tamper/offline alerts, so a
-- monitor sees exactly who and which device, not just "a company-managed device".
-- Replaces the detector and the client report function with name-aware messages.
-- Behaviour is otherwise unchanged.

create or replace function public.activity_detect_agent_tamper()
returns integer language plpgsql security definer set search_path = public as $$
declare
  affected integer := 0;
  item record;
  gap_threshold constant interval := interval '2 minutes';
begin
  -- Open a gap event for each expected-online device gone stale.
  for item in
    select d.*, coalesce(p.full_name, 'An employee') as employee_name
    from public.employee_devices d
    left join public.profiles p on p.id = d.employee_id
    where d.status = 'active'
      and d.last_seen_at is not null
      and d.last_seen_at < now() - gap_threshold
      and (
        d.agent_mode = 'corporate'
        or exists (select 1 from public.tracking_sessions ts where ts.device_id = d.id and ts.status = 'active')
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
      jsonb_build_object('agentMode', item.agent_mode, 'lastSeenAt', item.last_seen_at,
                         'deviceName', item.device_name, 'thresholdMinutes', 2),
      item.last_seen_at
    );

    perform public.activity_notify_monitors(
      item.employee_id, 'agent_offline',
      item.employee_name || ' - agent offline',
      'No heartbeat for over two minutes from ' || item.employee_name
        || ' on device "' || coalesce(item.device_name, 'their device')
        || '". It may have been uninstalled, stopped, powered off, or taken offline.',
      'employee_device', item.id
    );
    affected := affected + 1;
  end loop;

  -- Resolve gap events whose device is reporting again.
  for item in
    select e.id as event_id, e.employee_id, e.device_id, d.device_name,
           coalesce(p.full_name, 'An employee') as employee_name
    from public.agent_tamper_events e
    join public.employee_devices d on d.id = e.device_id
    left join public.profiles p on p.id = e.employee_id
    where e.event_type = 'heartbeat_gap'
      and e.resolved_at is null
      and d.last_seen_at is not null
      and d.last_seen_at >= now() - gap_threshold
    for update of e
  loop
    update public.agent_tamper_events set resolved_at = now() where id = item.event_id;
    perform public.activity_notify_monitors(
      item.employee_id, 'agent_recovered',
      item.employee_name || ' - agent back online',
      'The agent for ' || item.employee_name
        || ' on device "' || coalesce(item.device_name, 'their device')
        || '" is reporting again.',
      'employee_device', item.device_id
    );
    affected := affected + 1;
  end loop;

  return affected;
end $$;
revoke all on function public.activity_detect_agent_tamper() from public, authenticated;

create or replace function public.activity_report_agent_event(
  p_device_id uuid,
  p_event_type text,
  p_detail jsonb default '{}'::jsonb
) returns public.agent_tamper_events
language plpgsql security definer set search_path = public as $$
declare
  device public.employee_devices;
  event public.agent_tamper_events;
  emp_name text;
  who text;
  title text;
  body text;
begin
  if p_event_type not in ('signout_blocked','quit_blocked','uninstall_attempt','agent_stopped') then
    raise exception 'Unsupported agent event type';
  end if;

  select * into device from public.employee_devices
  where id = p_device_id and employee_id = auth.uid();
  if not found then raise exception 'Device not found for current user'; end if;

  select coalesce(full_name, 'An employee') into emp_name from public.profiles where id = auth.uid();
  who := emp_name || ' on device "' || coalesce(device.device_name, 'unknown') || '"';

  insert into public.agent_tamper_events(employee_id, device_id, event_type, severity, detail, last_seen_before_at)
  values (
    auth.uid(), device.id, p_event_type,
    case when p_event_type = 'uninstall_attempt' then 'high' else 'medium' end,
    coalesce(p_detail, '{}'::jsonb), device.last_seen_at
  )
  returning * into event;

  title := case p_event_type
    when 'signout_blocked'   then emp_name || ' - sign-out attempt'
    when 'quit_blocked'      then emp_name || ' - quit attempt'
    when 'uninstall_attempt' then emp_name || ' - uninstall attempt'
    when 'agent_stopped'     then emp_name || ' - agent stopped'
  end;
  body := case p_event_type
    when 'uninstall_attempt' then who || ': the FieldFlow agent is being uninstalled on this company-managed device.'
    when 'agent_stopped'     then who || ': the FieldFlow agent stopped while tracking was expected.'
    when 'signout_blocked'   then who || ': attempted to sign out on this company-managed device (blocked).'
    when 'quit_blocked'      then who || ': attempted to quit the agent on this company-managed device (blocked).'
  end;

  perform public.activity_notify_monitors(auth.uid(), p_event_type, title, body, 'agent_tamper_event', event.id);
  return event;
end $$;
revoke all on function public.activity_report_agent_event(uuid,text,jsonb) from public;
grant execute on function public.activity_report_agent_event(uuid,text,jsonb) to authenticated;
