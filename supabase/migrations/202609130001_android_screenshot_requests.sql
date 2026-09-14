-- Requests never grant Android screen-capture permission or start monitoring.
begin;

create table public.activity_screenshot_requests (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.employee_devices(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  tracking_session_id uuid not null references public.tracking_sessions(id) on delete cascade,
  requested_by uuid not null references public.profiles(id),
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  status text not null default 'pending' check (status in ('pending','captured','declined','failed','expired')),
  completed_at timestamptz,
  screenshot_id uuid references public.activity_screenshots(id) on delete set null
);
create unique index activity_screenshot_requests_one_pending
  on public.activity_screenshot_requests(device_id) where status = 'pending';
create index activity_screenshot_requests_device_recent
  on public.activity_screenshot_requests(device_id, requested_at desc);
create index activity_screenshot_requests_employee
  on public.activity_screenshot_requests(employee_id, status, expires_at);
alter table public.activity_screenshot_requests enable row level security;
revoke all on public.activity_screenshot_requests from anon, authenticated;
grant select on public.activity_screenshot_requests to authenticated;
create policy activity_screenshot_requests_read on public.activity_screenshot_requests
for select to authenticated using (
  employee_id = auth.uid()
  or public.is_owner(auth.uid())
  or public.has_permission('activity.view_all')
  or (public.has_permission('activity.view_team') and public.is_team_supervisor_for(employee_id))
);

create function public.activity_request_screenshot(p_device_id uuid)
returns public.activity_screenshot_requests
language plpgsql security definer set search_path = public
as $$
declare
  device public.employee_devices;
  current_session public.tracking_sessions;
  policy public.monitoring_policies;
  result public.activity_screenshot_requests;
begin
  if auth.uid() is null or not coalesce((public.is_owner(auth.uid()) or public.has_permission('activity.policies.manage')), false) then
    raise exception 'Screenshot request administration required';
  end if;
  select * into device from public.employee_devices where id = p_device_id for update;
  if not found then raise exception 'Device not found'; end if;
  if not coalesce((public.is_owner(auth.uid()) or public.has_permission('activity.view_all')
    or (public.has_permission('activity.view_team') and public.is_team_supervisor_for(device.employee_id))), false) then
    raise exception 'Screenshot request employee out of scope';
  end if;
  if device.status <> 'active' then raise exception 'Device is not active'; end if;
  if coalesce(device.operating_system_version, '') not like 'Android %' then
    raise exception 'Screenshot requests require an Android device';
  end if;
  select * into current_session from public.tracking_sessions
    where device_id = device.id and employee_id = device.employee_id and status = 'active' and ended_at is null;
  if not found then raise exception 'Screenshot request requires active tracking'; end if;
  select * into policy from public.monitoring_policies where is_active;
  if not found or not policy.tracking_enabled or not policy.collect_screenshots
    or policy.id <> current_session.monitoring_policy_id
    or not public.activity_device_screenshots_enabled(device.id, device.employee_id) then
    raise exception 'Screenshot request disabled by policy';
  end if;
  update public.activity_screenshot_requests set status = 'expired', completed_at = now()
    where device_id = device.id and status = 'pending'
      and (expires_at <= now() or tracking_session_id <> current_session.id);
  select * into result from public.activity_screenshot_requests where device_id = device.id and status = 'pending';
  if found then return result; end if;
  if exists (select 1 from public.activity_screenshot_requests where device_id = device.id and requested_at > now() - interval '30 seconds') then
    raise exception 'Screenshot request cooldown';
  end if;
  insert into public.activity_screenshot_requests(device_id, employee_id, tracking_session_id, requested_by)
    values (device.id, device.employee_id, current_session.id, auth.uid()) returning * into result;
  perform public.activity_write_audit_log(device.employee_id, 'screenshot.requested', 'activity_screenshot_request', result.id,
    jsonb_build_object('deviceId', device.id, 'expiresAt', result.expires_at));
  return result;
end $$;

create function public.activity_finish_screenshot_request(p_request_id uuid, p_status text, p_screenshot_id uuid default null)
returns public.activity_screenshot_requests
language plpgsql security definer set search_path = public
as $$
declare
  result public.activity_screenshot_requests;
  shot public.activity_screenshots;
begin
  if auth.uid() is null or not coalesce(public.has_permission('activity.view_self'), false) then raise exception 'Activity self access required'; end if;
  if p_status is null or p_status not in ('captured','declined','failed') then raise exception 'Invalid screenshot request outcome'; end if;
  select * into result from public.activity_screenshot_requests
    where id = p_request_id and employee_id = auth.uid() for update;
  if not found then raise exception 'Screenshot request not found'; end if;
  if result.status <> 'pending' then return result; end if;
  if result.expires_at <= now() then
    update public.activity_screenshot_requests set status = 'expired', completed_at = now() where id = result.id returning * into result;
    return result;
  end if;
  if p_status = 'captured' then
    select * into shot from public.activity_screenshots where id = p_screenshot_id
      and employee_id = auth.uid() and device_id = result.device_id and tracking_session_id = result.tracking_session_id
      and captured_at >= result.requested_at and captured_at <= result.expires_at;
    if not found then raise exception 'Screenshot does not match request'; end if;
    if not exists (select 1 from storage.objects where bucket_id = 'activity-screenshots' and name = shot.storage_path) then
      raise exception 'Requested screenshot upload is incomplete';
    end if;
  elsif p_screenshot_id is not null then raise exception 'Unexpected screenshot id';
  end if;
  update public.activity_screenshot_requests set status = p_status, completed_at = now(), screenshot_id = p_screenshot_id
    where id = result.id returning * into result;
  perform public.activity_write_audit_log(result.employee_id, 'screenshot.request.' || p_status, 'activity_screenshot_request', result.id,
    jsonb_build_object('deviceId', result.device_id, 'screenshotId', p_screenshot_id));
  return result;
end $$;

revoke all on function public.activity_request_screenshot(uuid) from public, anon;
revoke all on function public.activity_finish_screenshot_request(uuid,text,uuid) from public, anon;
grant execute on function public.activity_request_screenshot(uuid) to authenticated;
grant execute on function public.activity_finish_screenshot_request(uuid,text,uuid) to authenticated;
comment on table public.activity_screenshot_requests is 'Audited, expiring requests for a screenshot during employee-approved Android screen sharing. Requests cannot grant capture consent.';
notify pgrst, 'reload schema';
commit;
