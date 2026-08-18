-- Confidential, management-only field-task budgets and labour rates.

create table if not exists public.task_financials (
  task_id uuid primary key references public.tasks(id) on delete cascade,
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  budget_amount numeric(14,2) check (budget_amount is null or budget_amount >= 0),
  hourly_cost numeric(12,2) check (hourly_cost is null or hourly_cost >= 0),
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now()
);

alter table public.task_financials enable row level security;
drop policy if exists task_financials_management_all on public.task_financials;
create policy task_financials_management_all on public.task_financials for all to authenticated
using (
  exists (
    select 1 from public.tasks task where task.id = task_financials.task_id
      and (public.has_permission('tasks.manage_all') or (public.has_permission('tasks.assign') and public.is_team_supervisor_for(task.employee_id)))
  )
)
with check (
  updated_by = auth.uid() and exists (
    select 1 from public.tasks task where task.id = task_financials.task_id
      and (public.has_permission('tasks.manage_all') or (public.has_permission('tasks.assign') and public.is_team_supervisor_for(task.employee_id)))
  )
);

grant select, insert, update on public.task_financials to authenticated;
