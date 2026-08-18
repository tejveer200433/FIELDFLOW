-- Append-only task history for accountable field-work changes.

create table if not exists public.task_history (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.tasks(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('created', 'updated')),
  changes jsonb not null default '{}'::jsonb check (jsonb_typeof(changes) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists task_history_task_created_idx
  on public.task_history(task_id, created_at desc);

alter table public.task_history enable row level security;

drop policy if exists task_history_rbac_select on public.task_history;
create policy task_history_rbac_select on public.task_history
for select to authenticated using (
  exists (
    select 1 from public.tasks task
    where task.id = task_history.task_id
      and (
        (task.employee_id = auth.uid() and public.has_permission('tasks.view_self'))
        or public.has_permission('tasks.manage_all')
        or (public.has_permission('tasks.assign') and public.is_team_supervisor_for(task.employee_id))
      )
  )
);

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
      when tg_op = 'INSERT' then jsonb_build_object('after', to_jsonb(new) - array['created_by'])
      else jsonb_build_object(
        'before', to_jsonb(old) - array['created_by'],
        'after', to_jsonb(new) - array['created_by']
      )
    end
  );
  return new;
end;
$$;

drop trigger if exists tasks_capture_history on public.tasks;
create trigger tasks_capture_history
after insert or update on public.tasks
for each row execute function public.capture_task_history();

revoke all on public.task_history from anon, authenticated;
grant select on public.task_history to authenticated;
revoke all on function public.capture_task_history() from public;
