-- Real notifications: expense/report approvals, task completion, and attendance
-- geofence violations. Additive only. Fan-out at write time (one row per
-- recipient) so RLS can scope entirely on recipient_id, and mark-as-read is a
-- trivial per-row update. Writes only ever happen through notify_event(),
-- never a direct client insert.

create type public.notification_type as enum (
  'expense_submitted', 'report_submitted', 'task_completed', 'attendance_geofence_violation'
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type public.notification_type not null,
  title text not null check (char_length(title) between 1 and 200),
  body text not null check (char_length(body) between 1 and 500),
  entity_type text not null check (entity_type in ('expense', 'daily_report', 'task', 'attendance_shift')),
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_recipient_unread_idx
  on public.notifications (recipient_id, created_at desc) where read_at is null;
create index notifications_recipient_idx
  on public.notifications (recipient_id, created_at desc);

alter table public.notifications enable row level security;
create policy notifications_read on public.notifications for select to authenticated using (
  recipient_id = auth.uid()
);
create policy notifications_mark_read on public.notifications for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());
revoke all on public.notifications from public;
grant select, update on public.notifications to authenticated;
revoke insert, delete on public.notifications from authenticated;

-- has_permission() (dynamic_rbac.sql) only ever answers "does the CURRENT
-- caller hold this permission" -- there is no existing variant for an
-- arbitrary user, which notification routing needs (checking whether an
-- employee's *supervisor* holds the relevant permission, not the caller).
create or replace function public.has_permission_as(p_user_id uuid, p_permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_owner(p_user_id)
    or exists (
      select 1
      from public.profiles profile
      join public.user_roles user_role on user_role.user_id = profile.id
      join public.roles role on role.id = user_role.role_id
      join public.role_permissions role_permission on role_permission.role_id = role.id
      join public.permissions permission on permission.id = role_permission.permission_id
      where profile.id = p_user_id
        and profile.active
        and profile.approval_status::text = 'approved'
        and role.is_active
        and permission.key = p_permission_key
    )
$$;
revoke all on function public.has_permission_as(uuid, text) from public;
grant execute on function public.has_permission_as(uuid, text) to authenticated;

-- Resolves recipients for an event about p_employee_id and inserts one row
-- per distinct recipient: the employee's team supervisor(s) who hold
-- p_permission_key, unioned with anyone who is Owner or holds
-- employees.view_all (the same escalation rule already used elsewhere in
-- this app to grant "all" scope for reports/expenses). Returns the count
-- inserted. Every call site is already behind its own permission-checked
-- route; this only ever lets a caller generate a notification *about* an
-- event, never read anyone else's notifications (RLS handles that).
create or replace function public.notify_event(
  p_employee_id uuid,
  p_permission_key text,
  p_type public.notification_type,
  p_title text,
  p_body text,
  p_entity_type text,
  p_entity_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
begin
  if p_employee_id is null or p_permission_key is null or p_title is null or p_body is null or p_entity_type is null then
    raise exception 'Invalid notification event';
  end if;

  with recipients as (
    select distinct team.supervisor_id as user_id
    from public.team_members member
    join public.teams team on team.id = member.team_id
    where member.user_id = p_employee_id
      and public.has_permission_as(team.supervisor_id, p_permission_key)
    union
    select profile.id as user_id
    from public.profiles profile
    where profile.active
      and profile.approval_status::text = 'approved'
      and public.has_permission_as(profile.id, 'employees.view_all')
  )
  insert into public.notifications (recipient_id, actor_id, type, title, body, entity_type, entity_id)
  select recipients.user_id, p_employee_id, p_type, p_title, p_body, p_entity_type, p_entity_id
  from recipients
  where recipients.user_id <> p_employee_id;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end
$$;
revoke all on function public.notify_event(uuid, text, public.notification_type, text, text, text, uuid) from public;
grant execute on function public.notify_event(uuid, text, public.notification_type, text, text, text, uuid) to authenticated;

notify pgrst, 'reload schema';
