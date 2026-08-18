-- Recurring field tasks and estimated-versus-tracked time.

alter table public.tasks
  add column if not exists estimated_minutes integer,
  add column if not exists recurrence text not null default 'none',
  add column if not exists recurrence_parent_id uuid references public.tasks(id) on delete set null;

alter table public.tasks drop constraint if exists tasks_estimated_minutes_range;
alter table public.tasks add constraint tasks_estimated_minutes_range check (estimated_minutes is null or estimated_minutes between 1 and 100800);
alter table public.tasks drop constraint if exists tasks_recurrence_allowed;
alter table public.tasks add constraint tasks_recurrence_allowed check (recurrence in ('none','daily','weekly','monthly'));
create unique index if not exists tasks_recurrence_parent_unique on public.tasks(recurrence_parent_id) where recurrence_parent_id is not null;

create or replace function public.task_tracked_seconds(p_task_ids uuid[])
returns table(task_id uuid, tracked_seconds bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select session.task_id,
    sum(greatest(0, extract(epoch from (coalesce(session.ended_at, now()) - session.started_at))))::bigint
  from public.tracking_sessions session
  where session.task_id = any(p_task_ids)
  group by session.task_id;
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
  if source.employee_id <> auth.uid()
    and not public.has_permission('tasks.manage_all')
    and not (public.has_permission('tasks.assign') and public.is_team_supervisor_for(source.employee_id))
  then raise exception 'Task not found in your permitted scope'; end if;
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
  return created;
end;
$$;

revoke all on function public.task_tracked_seconds(uuid[]) from public;
grant execute on function public.task_tracked_seconds(uuid[]) to authenticated;
revoke all on function public.create_next_recurring_task(uuid) from public;
grant execute on function public.create_next_recurring_task(uuid) to authenticated;
