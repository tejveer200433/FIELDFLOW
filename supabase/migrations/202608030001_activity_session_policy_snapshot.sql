-- Bind every tracking session to the exact monitoring policy that governed it.
-- Existing policy rows remain immutable and available for historical summaries.

alter table public.tracking_sessions
  add column if not exists monitoring_policy_id uuid,
  add column if not exists monitoring_policy_version integer;

with session_policy as (
  select
    session.id as session_id,
    coalesce(
      (
        select policy.id
        from public.monitoring_policies policy
        where policy.created_at <= session.started_at
        order by policy.created_at desc, policy.policy_version desc
        limit 1
      ),
      (
        select policy.id
        from public.monitoring_policies policy
        order by policy.policy_version asc
        limit 1
      )
    ) as policy_id
  from public.tracking_sessions session
  where session.monitoring_policy_id is null
     or session.monitoring_policy_version is null
)
update public.tracking_sessions session
set monitoring_policy_id = policy.id,
    monitoring_policy_version = policy.policy_version
from session_policy mapping
join public.monitoring_policies policy on policy.id = mapping.policy_id
where session.id = mapping.session_id;

alter table public.tracking_sessions
  alter column monitoring_policy_id set not null,
  alter column monitoring_policy_version set not null;

do $$
begin
  alter table public.tracking_sessions
    add constraint tracking_sessions_monitoring_policy_fk
    foreign key (monitoring_policy_id, monitoring_policy_version)
    references public.monitoring_policies(id, policy_version);
exception when duplicate_object then
  null;
end
$$;

create index if not exists tracking_sessions_monitoring_policy_idx
  on public.tracking_sessions (monitoring_policy_id, monitoring_policy_version);

comment on column public.tracking_sessions.monitoring_policy_id is
  'Exact immutable monitoring policy used when this tracking session started.';
comment on column public.tracking_sessions.monitoring_policy_version is
  'Exact monitoring policy version used when this tracking session started.';

create or replace function public.activity_start_session(
  p_device_id uuid,
  p_project_id uuid default null,
  p_task_id uuid default null,
  p_start_source text default 'agent'
)
returns public.tracking_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  device public.employee_devices;
  policy public.monitoring_policies;
  created_session public.tracking_sessions;
begin
  if not public.has_permission('activity.view_self') then raise exception 'Activity self access required'; end if;
  if p_start_source not in ('agent','web','manual','api') then raise exception 'Invalid session source'; end if;

  select item.* into device from public.employee_devices item
  where item.id=p_device_id and item.employee_id=auth.uid() for update;
  if not found then raise exception 'Device not found'; end if;
  if device.status <> 'active' then raise exception 'Device is not active'; end if;

  select item.* into policy from public.monitoring_policies item
  where item.is_active;
  if not found then raise exception 'No active monitoring policy'; end if;
  if not policy.tracking_enabled then raise exception 'Activity tracking is disabled'; end if;
  if policy.require_acknowledgement and not exists (
    select 1 from public.monitoring_policy_acknowledgements acknowledgement
    where acknowledgement.employee_id=auth.uid()
      and acknowledgement.policy_id=policy.id
      and acknowledgement.policy_version=policy.policy_version
  ) then raise exception 'Monitoring policy acknowledgement required'; end if;

  if exists (
    select 1 from public.tracking_sessions session
    where session.employee_id=auth.uid() and session.status='active' and session.ended_at is null
  ) then raise exception 'An active tracking session already exists'; end if;

  if p_project_id is not null and not exists (
    select 1
    from public.project_modules module
    join public.work_assignments assignment on assignment.module_id=module.id
    where module.project_id=p_project_id and assignment.employee_id=auth.uid()
  ) then raise exception 'Project is not assigned to this employee'; end if;

  if p_task_id is not null and not exists (
    select 1 from public.tasks task
    where task.id=p_task_id and task.employee_id=auth.uid()
  ) then raise exception 'Task is not assigned to this employee'; end if;

  insert into public.tracking_sessions(
    employee_id, device_id, project_id, task_id, status, start_source,
    monitoring_policy_id, monitoring_policy_version
  ) values (
    auth.uid(), device.id, p_project_id, p_task_id, 'active', p_start_source,
    policy.id, policy.policy_version
  )
  returning * into created_session;

  perform public.activity_write_audit_log(
    auth.uid(), 'session.started', 'tracking_session', created_session.id,
    jsonb_build_object(
      'deviceId', device.id,
      'projectId', p_project_id,
      'taskId', p_task_id,
      'policyVersion', policy.policy_version
    )
  );
  return created_session;
end
$$;

revoke all on function public.activity_start_session(uuid,uuid,uuid,text) from public;
grant execute on function public.activity_start_session(uuid,uuid,uuid,text) to authenticated;

notify pgrst, 'reload schema';
