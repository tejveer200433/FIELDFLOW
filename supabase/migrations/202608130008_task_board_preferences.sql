-- Per-manager task board presentation. Canonical task states remain unchanged
-- so reports, integrations, and employee status updates keep working.

create table if not exists public.task_board_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  columns jsonb not null,
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(columns) = 'array' and jsonb_array_length(columns) = 5)
);

alter table public.task_board_preferences enable row level security;
drop policy if exists task_board_preferences_owner on public.task_board_preferences;
create policy task_board_preferences_owner on public.task_board_preferences
for all to authenticated
using (
  user_id = auth.uid()
  and (public.has_permission('tasks.assign') or public.has_permission('tasks.manage_all'))
)
with check (
  user_id = auth.uid()
  and (public.has_permission('tasks.assign') or public.has_permission('tasks.manage_all'))
);

revoke all on public.task_board_preferences from anon, authenticated;
grant select, insert, update on public.task_board_preferences to authenticated;
