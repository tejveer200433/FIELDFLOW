-- Non-destructive task lifecycle. Archived work remains available to
-- authorised management and in append-only history, but disappears from
-- employee work queues and cannot receive employee updates or time tracking.

alter table public.tasks
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;

create index if not exists tasks_active_created_idx
  on public.tasks(created_at desc) where archived_at is null;
create index if not exists tasks_archived_at_idx
  on public.tasks(archived_at desc) where archived_at is not null;

create or replace function public.is_task_assignee(p_task_id uuid, p_employee_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.task_assignees assignment
    join public.tasks task on task.id = assignment.task_id
    where assignment.task_id = p_task_id
      and assignment.employee_id = p_employee_id
      and task.archived_at is null
  );
$$;

create or replace function public.capture_task_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.task_history(task_id, actor_id, action, changes)
  values (
    new.id,
    auth.uid(),
    case when tg_op = 'INSERT' then 'created' else 'updated' end,
    case
      when tg_op = 'INSERT' then jsonb_build_object('after', to_jsonb(new) - array['created_by','archived_by'])
      else jsonb_build_object(
        'before', to_jsonb(old) - array['created_by','archived_by'],
        'after', to_jsonb(new) - array['created_by','archived_by']
      )
    end
  );
  return new;
end;
$$;

revoke all on function public.is_task_assignee(uuid,uuid) from public;
grant execute on function public.is_task_assignee(uuid,uuid) to authenticated;
revoke all on function public.capture_task_history() from public;

comment on column public.tasks.archived_at is
  'Non-null when management has removed the task from active work queues without deleting its history.';
