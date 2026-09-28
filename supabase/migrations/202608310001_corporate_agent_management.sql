-- Explicit, auditable management controls for company-managed FieldFlow agents.
-- Corporate mode is intentionally visible to employees and administrators. It
-- prevents accidental local shutdown/sign-out but does not conceal installation.

alter table public.employee_devices
  add column if not exists agent_mode text not null default 'standard'
    check (agent_mode in ('standard', 'corporate')),
  add column if not exists employee_sign_out_allowed boolean not null default true,
  add column if not exists employee_quit_allowed boolean not null default true,
  add column if not exists auto_start_tracking boolean not null default false,
  add column if not exists recovery_enabled boolean not null default true,
  add column if not exists managed_at timestamptz,
  add column if not exists managed_by uuid references public.profiles(id) on delete set null;

create index if not exists employee_devices_agent_mode_idx
  on public.employee_devices (agent_mode, status, last_seen_at desc);

create or replace function public.activity_set_device_management(
  p_device_id uuid,
  p_agent_mode text
)
returns public.employee_devices
language plpgsql
security definer
set search_path = public
as $$
declare
  device public.employee_devices;
begin
  if not (public.has_permission('activity.policies.manage') or public.is_owner(auth.uid())) then
    raise exception 'Device management requires monitoring administration';
  end if;
  if p_agent_mode not in ('standard', 'corporate') then
    raise exception 'Invalid agent mode';
  end if;

  select item.* into device
  from public.employee_devices item
  where item.id = p_device_id
  for update;
  if not found then raise exception 'Device not found'; end if;

  update public.employee_devices
  set agent_mode = p_agent_mode,
      employee_sign_out_allowed = (p_agent_mode = 'standard'),
      employee_quit_allowed = (p_agent_mode = 'standard'),
      auto_start_tracking = (p_agent_mode = 'corporate'),
      recovery_enabled = true,
      managed_at = case when p_agent_mode = 'corporate' then now() else null end,
      managed_by = case when p_agent_mode = 'corporate' then auth.uid() else null end
  where id = p_device_id
  returning * into device;

  perform public.activity_write_audit_log(
    device.employee_id,
    'device.management_changed',
    'employee_device',
    device.id,
    jsonb_build_object(
      'agentMode', device.agent_mode,
      'employeeSignOutAllowed', device.employee_sign_out_allowed,
      'employeeQuitAllowed', device.employee_quit_allowed,
      'autoStartTracking', device.auto_start_tracking,
      'recoveryEnabled', device.recovery_enabled
    )
  );
  return device;
end
$$;

revoke all on function public.activity_set_device_management(uuid,text) from public;
grant execute on function public.activity_set_device_management(uuid,text) to authenticated;

comment on function public.activity_set_device_management(uuid,text) is
  'Switches an employee device between visible standard and administrator-managed corporate agent modes and records the change in the activity audit log.';
