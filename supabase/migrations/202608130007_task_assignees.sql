-- Multiple task assignees while retaining tasks.employee_id as the primary
-- assignee for backwards compatibility with existing integrations.

create table if not exists public.task_assignees (
  task_id uuid not null references public.tasks(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (task_id, employee_id)
);

create index if not exists task_assignees_employee_idx on public.task_assignees(employee_id, task_id);

insert into public.task_assignees(task_id, employee_id, assigned_by)
select task.id, task.employee_id, task.created_by
from public.tasks task
where task.employee_id is not null
on conflict (task_id, employee_id) do nothing;

alter table public.task_assignees enable row level security;

create or replace function public.is_task_assignee(p_task_id uuid, p_employee_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.task_assignees assignment
    where assignment.task_id = p_task_id and assignment.employee_id = p_employee_id
  );
$$;

drop policy if exists task_assignees_scoped_select on public.task_assignees;
create policy task_assignees_scoped_select on public.task_assignees for select to authenticated using (
  employee_id = auth.uid()
  or public.has_permission('tasks.manage_all')
  or (public.has_permission('tasks.assign') and public.is_team_supervisor_for(employee_id))
);

drop policy if exists tasks_rbac_select on public.tasks;
create policy tasks_rbac_select on public.tasks for select to authenticated using (
  (public.is_task_assignee(id, auth.uid()) and public.has_permission('tasks.view_self'))
  or public.has_permission('tasks.manage_all')
  or (
    public.has_permission('tasks.assign') and exists (
      select 1 from public.task_assignees assignment
      where assignment.task_id = tasks.id and public.is_team_supervisor_for(assignment.employee_id)
    )
  )
);

create or replace function public.sync_task_primary_assignee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.employee_id is not null then
    insert into public.task_assignees(task_id, employee_id, assigned_by)
    values(new.id, new.employee_id, coalesce(new.created_by, auth.uid()))
    on conflict (task_id, employee_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_sync_primary_assignee on public.tasks;
create trigger tasks_sync_primary_assignee
after insert or update of employee_id on public.tasks
for each row execute function public.sync_task_primary_assignee();

create or replace function public.set_task_assignees(p_task_id uuid, p_employee_ids uuid[])
returns setof public.task_assignees
language plpgsql
security definer
set search_path = public
as $$
declare
  task public.tasks;
  employee uuid;
  normalized uuid[];
begin
  if not (public.has_permission('tasks.manage_all') or public.has_permission('tasks.assign')) then
    raise exception 'Task assignment permission required';
  end if;

  select item.* into task from public.tasks item where item.id = p_task_id for update;
  if not found then raise exception 'Task not found'; end if;
  if not public.has_permission('tasks.manage_all')
    and not public.is_team_supervisor_for(task.employee_id)
  then raise exception 'Task not found in your permitted scope'; end if;

  select array_agg(value order by ordinal)
  into normalized
  from (
    select value, min(ordinal) ordinal
    from unnest(coalesce(p_employee_ids, array[]::uuid[])) with ordinality input(value, ordinal)
    where value is not null
    group by value
  ) unique_values;

  if coalesce(cardinality(normalized), 0) < 1 or cardinality(normalized) > 25 then
    raise exception 'A task requires between 1 and 25 assignees';
  end if;

  foreach employee in array normalized loop
    if not exists (
      select 1 from public.profiles profile
      where profile.id = employee and profile.approval_status::text = 'approved'
    ) then raise exception 'Every assignee must be an approved employee'; end if;
    if not public.has_permission('tasks.manage_all') and not public.is_team_supervisor_for(employee) then
      raise exception 'An assignee is outside your permitted team';
    end if;
  end loop;

  update public.tasks set employee_id = normalized[1], updated_at = now() where id = p_task_id;
  delete from public.task_assignees assignment where assignment.task_id = p_task_id;
  insert into public.task_assignees(task_id, employee_id, assigned_by)
  select p_task_id, value, auth.uid() from unnest(normalized) value;

  return query
    select assignment.* from public.task_assignees assignment
    where assignment.task_id = p_task_id order by assignment.created_at, assignment.employee_id;
end;
$$;

create or replace function public.can_access_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tasks task
    where task.id = p_task_id and (
      (public.is_task_assignee(task.id, auth.uid()) and public.has_permission('tasks.view_self'))
      or public.has_permission('tasks.manage_all')
      or (
        public.has_permission('tasks.assign') and exists (
          select 1 from public.task_assignees assignment
          where assignment.task_id = task.id and public.is_team_supervisor_for(assignment.employee_id)
        )
      )
    )
  );
$$;

drop policy if exists task_history_rbac_select on public.task_history;
create policy task_history_rbac_select on public.task_history for select to authenticated using (
  public.can_access_task(task_id)
);

create or replace function public.update_my_task_status(p_task_id uuid, p_status text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare status_type text; updated_id uuid;
begin
  if not public.has_permission('tasks.view_self') then raise exception 'You do not have permission to update tasks'; end if;
  if p_status not in ('Assigned', 'On The Way', 'In Progress', 'Completed', 'Blocked') then raise exception 'A valid task status is required'; end if;
  select format_type(attribute.atttypid, attribute.atttypmod) into status_type
  from pg_attribute attribute
  where attribute.attrelid = 'public.tasks'::regclass and attribute.attname = 'status' and not attribute.attisdropped;
  execute format(
    'update public.tasks set status = $1::%s, updated_at = now()
     where id = $2 and public.is_task_assignee(id, auth.uid()) returning id', status_type
  ) into updated_id using p_status, p_task_id;
  if updated_id is null then raise exception 'Task not found'; end if;
  return updated_id;
end;
$$;

create or replace function public.update_my_task_checklist(p_task_id uuid, p_completed_ids text[])
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare updated_task public.tasks;
begin
  if not public.has_permission('tasks.view_self') then raise exception 'Task self access required'; end if;
  update public.tasks task
  set checklist = coalesce((
    select jsonb_agg(item || jsonb_build_object('completed', (item->>'id') = any(coalesce(p_completed_ids, array[]::text[]))))
    from jsonb_array_elements(task.checklist) item
  ), '[]'::jsonb), updated_at = now()
  where task.id = p_task_id and public.is_task_assignee(task.id, auth.uid())
  returning task.* into updated_task;
  if not found then raise exception 'Task not found in your permitted scope'; end if;
  return updated_task;
end;
$$;

-- Keep activity attribution valid for every task assignee. This is the latest
-- activity_start_session definition plus the multi-assignee task check.
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
  select item.* into policy from public.monitoring_policies item where item.is_active;
  if not found then raise exception 'No active monitoring policy'; end if;
  if not policy.tracking_enabled then raise exception 'Activity tracking is disabled'; end if;
  if policy.require_acknowledgement and not exists (
    select 1 from public.monitoring_policy_acknowledgements acknowledgement
    where acknowledgement.employee_id=auth.uid() and acknowledgement.policy_id=policy.id
      and acknowledgement.policy_version=policy.policy_version
  ) then raise exception 'Monitoring policy acknowledgement required'; end if;
  if exists (
    select 1 from public.tracking_sessions session
    where session.employee_id=auth.uid() and session.status='active' and session.ended_at is null
  ) then raise exception 'An active tracking session already exists'; end if;
  if p_project_id is not null and not exists (
    select 1 from public.project_modules module
    join public.work_assignments assignment on assignment.module_id=module.id
    where module.project_id=p_project_id and assignment.employee_id=auth.uid()
  ) then raise exception 'Project is not assigned to this employee'; end if;
  if p_task_id is not null and not public.is_task_assignee(p_task_id, auth.uid()) then
    raise exception 'Task is not assigned to this employee';
  end if;
  insert into public.tracking_sessions(
    employee_id, device_id, project_id, task_id, status, start_source,
    monitoring_policy_id, monitoring_policy_version
  ) values (
    auth.uid(), device.id, p_project_id, p_task_id, 'active', p_start_source,
    policy.id, policy.policy_version
  ) returning * into created_session;
  perform public.activity_write_audit_log(
    auth.uid(), 'session.started', 'tracking_session', created_session.id,
    jsonb_build_object('deviceId',device.id,'projectId',p_project_id,'taskId',p_task_id,'policyVersion',policy.policy_version)
  );
  return created_session;
end;
$$;

create or replace function public.create_next_recurring_task(p_task_id uuid)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare source public.tasks; created public.tasks; next_time timestamptz;
begin
  select * into source from public.tasks where id = p_task_id for update;
  if not found then raise exception 'Task not found'; end if;
  if not public.can_access_task(source.id) then raise exception 'Task not found in your permitted scope'; end if;
  if source.status <> 'Completed' or source.recurrence = 'none' then return null; end if;
  select * into created from public.tasks where recurrence_parent_id = source.id;
  if found then return created; end if;
  next_time := case source.recurrence
    when 'daily' then coalesce(source.scheduled_at, now()) + interval '1 day'
    when 'weekly' then coalesce(source.scheduled_at, now()) + interval '1 week'
    when 'monthly' then coalesce(source.scheduled_at, now()) + interval '1 month'
  end;
  insert into public.tasks(title,employee_id,created_by,client,address,priority,status,scheduled_at,description,checklist,estimated_minutes,recurrence,recurrence_parent_id)
  values(source.title,source.employee_id,source.created_by,source.client,source.address,source.priority,'Assigned',next_time,source.description,
    (select coalesce(jsonb_agg(item || jsonb_build_object('completed', false)), '[]'::jsonb) from jsonb_array_elements(source.checklist) item),
    source.estimated_minutes,source.recurrence,source.id)
  returning * into created;
  insert into public.task_assignees(task_id,employee_id,assigned_by)
  select created.id, assignment.employee_id, auth.uid()
  from public.task_assignees assignment where assignment.task_id = source.id
  on conflict (task_id,employee_id) do nothing;
  return created;
end;
$$;

revoke all on public.task_assignees from anon, authenticated;
grant select on public.task_assignees to authenticated;
revoke all on function public.is_task_assignee(uuid,uuid) from public;
grant execute on function public.is_task_assignee(uuid,uuid) to authenticated;
revoke all on function public.set_task_assignees(uuid,uuid[]) from public;
grant execute on function public.set_task_assignees(uuid,uuid[]) to authenticated;
grant execute on function public.update_my_task_status(uuid,text) to authenticated;
grant execute on function public.update_my_task_checklist(uuid,text[]) to authenticated;
grant execute on function public.activity_start_session(uuid,uuid,uuid,text) to authenticated;
grant execute on function public.create_next_recurring_task(uuid) to authenticated;
