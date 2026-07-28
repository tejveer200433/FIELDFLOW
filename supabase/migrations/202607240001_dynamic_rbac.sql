-- FieldFlow dynamic RBAC and team-scoped data access.
-- Run after:
--   202607220001_initial_production.sql
--   202607230001_project_workflow.sql
--   20260723_attendance_geofence.sql
--
-- This migration preserves profiles.role and profiles.requested_role for
-- compatibility. New authorization is driven by permissions and team scope.

create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists is_owner boolean not null default false;

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 100),
  description text,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists roles_name_lower_unique
  on public.roles (lower(name));

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  name text not null,
  description text,
  group_name text not null
);

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create table if not exists public.user_roles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role_id uuid not null references public.roles(id),
  assigned_by uuid references public.profiles(id),
  assigned_at timestamptz not null default now()
);
create index if not exists user_roles_role_idx on public.user_roles(role_id);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  description text,
  supervisor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists teams_name_lower_unique
  on public.teams(lower(name));
create index if not exists teams_supervisor_idx on public.teams(supervisor_id);

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  added_by uuid references public.profiles(id),
  added_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index if not exists team_members_user_idx on public.team_members(user_id);

create table if not exists public.rbac_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists rbac_audit_created_idx
  on public.rbac_audit_log(created_at desc);

insert into public.permissions (key, name, description, group_name) values
  ('dashboard.view', 'View dashboard', 'Open the FieldFlow dashboard.', 'Dashboard'),
  ('employees.view_all', 'View all users', 'View all user profiles across the workspace.', 'Users'),
  ('employees.manage', 'Manage users', 'Approve, reject, activate, and manage user accounts.', 'Users'),
  ('teams.manage', 'Manage teams', 'Create teams and manage supervisors and members.', 'Users'),
  ('roles.manage', 'Manage roles', 'Create roles, configure permissions, and assign roles.', 'Settings'),
  ('settings.manage', 'Manage settings', 'Manage workspace and attendance location settings.', 'Settings'),
  ('attendance.view_self', 'View own attendance', 'Check in, check out, and view own attendance.', 'Attendance'),
  ('attendance.view_team', 'View team attendance', 'View attendance for supervised team members.', 'Attendance'),
  ('attendance.view_all', 'View all attendance', 'View attendance for every user.', 'Attendance'),
  ('attendance.approve', 'Approve attendance', 'Review and approve attendance records.', 'Attendance'),
  ('locations.share_self', 'Share own location', 'Share the current user location while working.', 'Locations'),
  ('locations.view_team', 'View team locations', 'View live locations for supervised team members.', 'Locations'),
  ('locations.view_all', 'View all locations', 'View live locations for every user.', 'Locations'),
  ('tasks.view_self', 'View own tasks', 'View and update tasks assigned to the current user.', 'Tasks'),
  ('tasks.assign', 'Assign team tasks', 'Assign and manage tasks for supervised team members.', 'Tasks'),
  ('tasks.manage_all', 'Manage all tasks', 'Assign and manage tasks for every user.', 'Tasks'),
  ('projects.view_self', 'View own project work', 'View project modules assigned to the current user.', 'Projects'),
  ('projects.review', 'Review project work', 'Review project submissions assigned to the current user.', 'Projects'),
  ('projects.manage', 'Manage projects', 'Create and manage all projects, modules, and assignments.', 'Projects'),
  ('reports.submit', 'Submit reports', 'Create and view the current user daily reports.', 'Reports'),
  ('reports.review', 'Review reports', 'Review reports within the permitted team or global scope.', 'Reports'),
  ('expenses.submit', 'Submit expenses', 'Create and view the current user expenses.', 'Expenses'),
  ('expenses.approve', 'Approve expenses', 'Review expenses within the permitted team or global scope.', 'Expenses'),
  ('sos.create', 'Create SOS alerts', 'Send an SOS alert with the current location.', 'Safety'),
  ('sos.view_team', 'View team SOS alerts', 'View SOS alerts within the permitted team or global scope.', 'Safety'),
  ('sos.resolve', 'Resolve SOS alerts', 'Resolve accessible SOS alerts.', 'Safety'),
  ('sales.view_self', 'View own sales', 'View sales records owned by the current user.', 'Sales'),
  ('sales.manage', 'Manage sales', 'Manage sales records across the permitted scope.', 'Sales')
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  group_name = excluded.group_name;

insert into public.roles (name, description, is_system, is_active)
values
  ('Owner', 'Protected full-access workspace owner role.', true, true),
  ('Management', 'Migration template for existing manager accounts.', true, true),
  ('Standard Employee', 'Migration template for existing employee accounts.', true, true)
on conflict (lower(name)) do nothing;

-- Owner receives every current and future permission inserted before this step.
insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id
from public.roles role
cross join public.permissions permission
where lower(role.name) = 'owner'
on conflict do nothing;

insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.key = any(array[
  'dashboard.view',
  'employees.view_all',
  'attendance.view_all',
  'attendance.approve',
  'locations.view_all',
  'tasks.assign',
  'tasks.manage_all',
  'projects.manage',
  'projects.review',
  'reports.review',
  'expenses.approve',
  'sos.view_team',
  'sos.resolve'
])
where lower(role.name) = 'management'
on conflict do nothing;

insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.key = any(array[
  'dashboard.view',
  'attendance.view_self',
  'locations.share_self',
  'tasks.view_self',
  'projects.view_self',
  'reports.submit',
  'expenses.submit',
  'sos.create',
  'sales.view_self'
])
where lower(role.name) = 'standard employee'
on conflict do nothing;

-- Existing administrators become protected Owners. Legacy managers and
-- employees receive migration-template dynamic roles.
update public.profiles
set is_owner = true
where role::text = 'admin'
  and active = true
  and approval_status::text = 'approved';

-- If a legacy workspace has no approved administrator, protect the oldest
-- approved active account so the migration cannot leave the workspace without
-- an Owner. The role can be reassigned later after another Owner is established.
update public.profiles
set is_owner = true
where id = (
  select profile.id
  from public.profiles profile
  where profile.active
    and profile.approval_status::text = 'approved'
  order by profile.created_at
  limit 1
)
and not exists (
  select 1 from public.profiles profile
  where profile.is_owner
    and profile.active
    and profile.approval_status::text = 'approved'
);

insert into public.user_roles(user_id, role_id, assigned_by)
select
  profile.id,
  role.id,
  null
from public.profiles profile
join public.roles role on lower(role.name) = case
  when profile.is_owner then 'owner'
  when profile.role::text = 'manager' then 'management'
  else 'standard employee'
end
on conflict (user_id) do nothing;

create or replace function public.set_rbac_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists roles_set_updated_at on public.roles;
create trigger roles_set_updated_at
before update on public.roles
for each row execute function public.set_rbac_updated_at();

drop trigger if exists teams_set_updated_at on public.teams;
create trigger teams_set_updated_at
before update on public.teams
for each row execute function public.set_rbac_updated_at();

create or replace function public.is_owner(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = p_user_id
      and profile.is_owner
      and profile.active
      and profile.approval_status::text = 'approved'
  )
$$;

create or replace function public.has_permission(permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_owner(auth.uid())
    or exists (
      select 1
      from public.profiles profile
      join public.user_roles user_role on user_role.user_id = profile.id
      join public.roles role on role.id = user_role.role_id
      join public.role_permissions role_permission on role_permission.role_id = role.id
      join public.permissions permission on permission.id = role_permission.permission_id
      where profile.id = auth.uid()
        and profile.active
        and profile.approval_status::text = 'approved'
        and role.is_active
        and permission.key = permission_key
    )
$$;

create or replace function public.has_any_permission(permission_keys text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exists (
      select 1
      from unnest(permission_keys) permission_key
      where public.has_permission(permission_key)
    ),
    false
  )
$$;

create or replace function public.is_team_supervisor_for(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teams team
    join public.team_members member on member.team_id = team.id
    where team.supervisor_id = auth.uid()
      and member.user_id = target_user_id
  )
$$;

create or replace function public.can_view_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    target_user_id = auth.uid()
    or public.has_any_permission(array[
      'employees.view_all',
      'employees.manage',
      'teams.manage',
      'roles.manage',
      'projects.manage'
    ])
    or (
      public.is_team_supervisor_for(target_user_id)
      and public.has_any_permission(array[
        'tasks.assign',
        'attendance.view_team',
        'locations.view_team',
        'reports.review',
        'expenses.approve',
        'sos.view_team'
      ])
    )
    or exists (
      select 1
      from public.work_assignments assignment
      where (
        assignment.employee_id = auth.uid()
        and assignment.reviewer_id = target_user_id
      ) or (
        assignment.reviewer_id = auth.uid()
        and assignment.employee_id = target_user_id
      )
    )
$$;

create or replace function public.get_my_team_member_ids()
returns table(user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select distinct member.user_id
  from public.teams team
  join public.team_members member on member.team_id = team.id
  where team.supervisor_id = auth.uid()
$$;

create or replace function public.can_access_team(target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_any_permission(array['teams.manage', 'roles.manage', 'employees.view_all'])
    or exists (
      select 1 from public.teams team
      where team.id = target_team_id and team.supervisor_id = auth.uid()
    )
    or exists (
      select 1 from public.team_members member
      where member.team_id = target_team_id and member.user_id = auth.uid()
    )
$$;

create or replace function public.get_my_access_context()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'isOwner', profile.is_owner,
    'legacyRole', profile.role::text,
    'role', case
      when role.id is null then null
      else jsonb_build_object(
        'id', role.id,
        'name', role.name,
        'description', role.description,
        'isSystem', role.is_system,
        'isActive', role.is_active
      )
    end,
    'permissions', coalesce(
      (
        select jsonb_agg(permission.key order by permission.key)
        from public.role_permissions role_permission
        join public.permissions permission on permission.id = role_permission.permission_id
        where role_permission.role_id = role.id
          and role.is_active
      ),
      '[]'::jsonb
    )
  )
  from public.profiles profile
  left join public.user_roles user_role on user_role.user_id = profile.id
  left join public.roles role on role.id = user_role.role_id
  where profile.id = auth.uid()
$$;

-- Keep legacy SQL and storage policies permission-aware while they are
-- progressively replaced below.
create or replace function public.is_management()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_any_permission(array[
    'employees.view_all',
    'tasks.assign',
    'tasks.manage_all',
    'projects.manage',
    'reports.review',
    'expenses.approve',
    'attendance.view_team',
    'attendance.view_all',
    'locations.view_team',
    'locations.view_all',
    'sos.view_team',
    'sos.resolve'
  ])
$$;

create or replace function public.protect_owner_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining_owners integer;
begin
  if tg_op = 'UPDATE' and old.is_owner then
    if old.id = auth.uid() and (
      not new.is_owner
      or not new.active
      or new.approval_status::text <> 'approved'
    ) then
      raise exception 'You cannot remove your own protected Owner access';
    end if;

    if not new.is_owner
       or not new.active
       or new.approval_status::text <> 'approved' then
      select count(*) into remaining_owners
      from public.profiles profile
      where profile.id <> old.id
        and profile.is_owner
        and profile.active
        and profile.approval_status::text = 'approved';
      if remaining_owners = 0 then
        raise exception 'The workspace must always have at least one active Owner';
      end if;
    end if;
  elsif tg_op = 'DELETE' and old.is_owner then
    select count(*) into remaining_owners
    from public.profiles profile
    where profile.id <> old.id
      and profile.is_owner
      and profile.active
      and profile.approval_status::text = 'approved';
    if remaining_owners = 0 then
      raise exception 'The workspace must always have at least one active Owner';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;

drop trigger if exists profiles_protect_owner on public.profiles;
create trigger profiles_protect_owner
before update or delete on public.profiles
for each row execute function public.protect_owner_profile();

create or replace function public.protect_owner_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.is_system and lower(old.name) = 'owner' then
    if tg_op = 'DELETE' then
      raise exception 'The protected Owner role cannot be deleted';
    end if;
    if not new.is_active then
      raise exception 'The protected Owner role cannot be disabled';
    end if;
    if lower(new.name) <> 'owner' then
      raise exception 'The protected Owner role cannot be renamed';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;

drop trigger if exists roles_protect_owner on public.roles;
create trigger roles_protect_owner
before update or delete on public.roles
for each row execute function public.protect_owner_role();

create or replace function public.guard_role_permission_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_role uuid;
  affected_permission uuid;
  permission_key text;
begin
  affected_role := case when tg_op = 'DELETE' then old.role_id else new.role_id end;
  affected_permission := case when tg_op = 'DELETE' then old.permission_id else new.permission_id end;

  -- Allow trusted migration/administration sessions in Supabase SQL Editor to
  -- rerun permission seed statements. API requests use the authenticator role
  -- with a non-null auth.uid() and do not enter this branch.
  if auth.uid() is null and session_user in ('postgres', 'supabase_admin') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if public.is_owner(auth.uid()) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role_id = affected_role
  ) then
    raise exception 'You cannot change permissions for your own role';
  end if;

  select permission.key into permission_key
  from public.permissions permission
  where permission.id = affected_permission;

  if tg_op <> 'DELETE' and not public.has_permission(permission_key) then
    raise exception 'You cannot grant a permission that you do not have';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end
$$;

drop trigger if exists role_permissions_guard on public.role_permissions;
create trigger role_permissions_guard
before insert or update or delete on public.role_permissions
for each row execute function public.guard_role_permission_change();

create or replace function public.guard_user_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user uuid;
  target_role uuid;
  missing_permission boolean;
begin
  target_user := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  target_role := case when tg_op = 'DELETE' then old.role_id else new.role_id end;

  -- Supabase SQL Editor runs migrations as a trusted database role without an
  -- authenticated application user. Keep rerunnable seed/upsert statements
  -- separate from normal API requests, which never satisfy this condition.
  if auth.uid() is null and session_user in ('postgres', 'supabase_admin') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- The profile insert trigger seeds a safe default role with no actor. Direct
  -- client inserts still fail the user_roles RLS assigned_by check.
  if tg_op = 'INSERT' and new.assigned_by is null then
    return new;
  end if;

  if target_user = auth.uid() and not public.is_owner(auth.uid()) then
    raise exception 'You cannot change your own role';
  end if;

  if tg_op <> 'DELETE' and not public.is_owner(auth.uid()) then
    select exists (
      select 1
      from public.role_permissions role_permission
      join public.permissions permission on permission.id = role_permission.permission_id
      where role_permission.role_id = target_role
        and not public.has_permission(permission.key)
    ) into missing_permission;
    if missing_permission then
      raise exception 'You cannot assign a role with permissions that you do not have';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end
$$;

drop trigger if exists user_roles_guard on public.user_roles;
create trigger user_roles_guard
before insert or update or delete on public.user_roles
for each row execute function public.guard_user_role_change();

create or replace function public.assign_default_dynamic_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  default_role_id uuid;
begin
  select role.id into default_role_id
  from public.roles role
  where lower(role.name) = case
    when new.role::text = 'admin' then 'owner'
    when new.role::text = 'manager' then 'management'
    else 'standard employee'
  end
  limit 1;

  if default_role_id is not null then
    insert into public.user_roles(user_id, role_id)
    values(new.id, default_role_id)
    on conflict (user_id) do nothing;
  end if;
  return new;
end
$$;

drop trigger if exists profiles_assign_default_dynamic_role on public.profiles;
create trigger profiles_assign_default_dynamic_role
after insert on public.profiles
for each row execute function public.assign_default_dynamic_role();

create or replace function public.audit_rbac_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data jsonb;
  row_id text;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  row_id := coalesce(
    row_data->>'id',
    row_data->>'user_id',
    row_data->>'role_id',
    row_data->>'team_id'
  );
  insert into public.rbac_audit_log(actor_id, action, target_type, target_id, metadata)
  values(
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    row_id,
    jsonb_build_object(
      'old', case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
      'new', case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
    )
  );
  return case when tg_op = 'DELETE' then old else new end;
end
$$;

drop trigger if exists roles_audit on public.roles;
create trigger roles_audit after insert or update or delete on public.roles
for each row execute function public.audit_rbac_change();
drop trigger if exists role_permissions_audit on public.role_permissions;
create trigger role_permissions_audit after insert or update or delete on public.role_permissions
for each row execute function public.audit_rbac_change();
drop trigger if exists user_roles_audit on public.user_roles;
create trigger user_roles_audit after insert or update or delete on public.user_roles
for each row execute function public.audit_rbac_change();
drop trigger if exists teams_audit on public.teams;
create trigger teams_audit after insert or update or delete on public.teams
for each row execute function public.audit_rbac_change();
drop trigger if exists team_members_audit on public.team_members;
create trigger team_members_audit after insert or update or delete on public.team_members
for each row execute function public.audit_rbac_change();

alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.rbac_audit_log enable row level security;

drop policy if exists roles_authenticated_select on public.roles;
drop policy if exists roles_manage_write on public.roles;
create policy roles_authenticated_select on public.roles
for select to authenticated using (is_active or public.has_permission('roles.manage'));
create policy roles_manage_write on public.roles
for all to authenticated
using (public.has_permission('roles.manage'))
with check (public.has_permission('roles.manage'));

drop policy if exists permissions_authenticated_select on public.permissions;
create policy permissions_authenticated_select on public.permissions
for select to authenticated using (true);

drop policy if exists role_permissions_authenticated_select on public.role_permissions;
drop policy if exists role_permissions_manage_write on public.role_permissions;
create policy role_permissions_authenticated_select on public.role_permissions
for select to authenticated using (true);
create policy role_permissions_manage_write on public.role_permissions
for all to authenticated
using (public.has_permission('roles.manage'))
with check (public.has_permission('roles.manage'));

drop policy if exists user_roles_authorized_select on public.user_roles;
drop policy if exists user_roles_manage_write on public.user_roles;
create policy user_roles_authorized_select on public.user_roles
for select to authenticated
using (
  user_id = auth.uid()
  or public.has_any_permission(array['roles.manage', 'employees.manage', 'employees.view_all', 'teams.manage', 'projects.manage'])
  or public.is_team_supervisor_for(user_id)
);
create policy user_roles_manage_write on public.user_roles
for all to authenticated
using (public.has_permission('roles.manage'))
with check (public.has_permission('roles.manage') and assigned_by = auth.uid());

drop policy if exists teams_authorized_select on public.teams;
drop policy if exists teams_manage_write on public.teams;
create policy teams_authorized_select on public.teams
for select to authenticated
using (public.can_access_team(id));
create policy teams_manage_write on public.teams
for all to authenticated
using (public.has_permission('teams.manage') or public.has_permission('roles.manage'))
with check (public.has_permission('teams.manage') or public.has_permission('roles.manage'));

drop policy if exists team_members_authorized_select on public.team_members;
drop policy if exists team_members_manage_write on public.team_members;
create policy team_members_authorized_select on public.team_members
for select to authenticated
using (user_id = auth.uid() or public.can_access_team(team_id));
create policy team_members_manage_write on public.team_members
for all to authenticated
using (public.has_permission('teams.manage') or public.has_permission('roles.manage'))
with check (
  (public.has_permission('teams.manage') or public.has_permission('roles.manage'))
  and added_by = auth.uid()
);

drop policy if exists rbac_audit_owner_select on public.rbac_audit_log;
create policy rbac_audit_owner_select on public.rbac_audit_log
for select to authenticated using (public.is_owner(auth.uid()));

-- Replace legacy profile/data policies with permission and team-scoped rules.
drop policy if exists profiles_self_or_management_select on public.profiles;
drop policy if exists profiles_admin_update on public.profiles;
drop policy if exists profiles_rbac_select on public.profiles;
drop policy if exists profiles_rbac_update on public.profiles;
create policy profiles_rbac_select on public.profiles
for select to authenticated using (public.can_view_profile(id));
create policy profiles_rbac_update on public.profiles
for update to authenticated
using (public.has_permission('employees.manage'))
with check (public.has_permission('employees.manage'));

drop policy if exists tasks_employee_or_management_select on public.tasks;
drop policy if exists tasks_management_insert on public.tasks;
drop policy if exists tasks_management_update on public.tasks;
drop policy if exists tasks_rbac_select on public.tasks;
drop policy if exists tasks_rbac_insert on public.tasks;
drop policy if exists tasks_rbac_update on public.tasks;
create policy tasks_rbac_select on public.tasks
for select to authenticated using (
  (employee_id = auth.uid() and public.has_permission('tasks.view_self'))
  or public.has_permission('tasks.manage_all')
  or (public.has_permission('tasks.assign') and public.is_team_supervisor_for(employee_id))
);
create policy tasks_rbac_insert on public.tasks
for insert to authenticated with check (
  created_by = auth.uid()
  and (
    public.has_permission('tasks.manage_all')
    or (public.has_permission('tasks.assign') and public.is_team_supervisor_for(employee_id))
  )
);
create policy tasks_rbac_update on public.tasks
for update to authenticated
using (
  public.has_permission('tasks.manage_all')
  or (public.has_permission('tasks.assign') and public.is_team_supervisor_for(employee_id))
)
with check (
  public.has_permission('tasks.manage_all')
  or (public.has_permission('tasks.assign') and public.is_team_supervisor_for(employee_id))
);

drop policy if exists attendance_select on public.attendance_shifts;
drop policy if exists attendance_rbac_select on public.attendance_shifts;
create policy attendance_rbac_select on public.attendance_shifts
for select to authenticated using (
  (employee_id = auth.uid() and public.has_permission('attendance.view_self'))
  or public.has_permission('attendance.view_all')
  or (
    public.has_permission('attendance.view_team')
    and public.is_team_supervisor_for(employee_id)
  )
);

drop policy if exists reports_select on public.daily_reports;
drop policy if exists reports_employee_insert on public.daily_reports;
drop policy if exists reports_management_update on public.daily_reports;
drop policy if exists reports_rbac_select on public.daily_reports;
drop policy if exists reports_rbac_insert on public.daily_reports;
drop policy if exists reports_rbac_update on public.daily_reports;
create policy reports_rbac_select on public.daily_reports
for select to authenticated using (
  (employee_id = auth.uid() and public.has_permission('reports.submit'))
  or (
    public.has_permission('reports.review')
    and (
      public.has_permission('employees.view_all')
      or public.is_team_supervisor_for(employee_id)
    )
  )
);
create policy reports_rbac_insert on public.daily_reports
for insert to authenticated with check (
  employee_id = auth.uid() and public.has_permission('reports.submit')
);
create policy reports_rbac_update on public.daily_reports
for update to authenticated
using (
  public.has_permission('reports.review')
  and (
    public.has_permission('employees.view_all')
    or public.is_team_supervisor_for(employee_id)
  )
)
with check (
  public.has_permission('reports.review')
  and (
    public.has_permission('employees.view_all')
    or public.is_team_supervisor_for(employee_id)
  )
);

drop policy if exists expenses_select on public.expenses;
drop policy if exists expenses_employee_insert on public.expenses;
drop policy if exists expenses_management_update on public.expenses;
drop policy if exists expenses_rbac_select on public.expenses;
drop policy if exists expenses_rbac_insert on public.expenses;
drop policy if exists expenses_rbac_update on public.expenses;
create policy expenses_rbac_select on public.expenses
for select to authenticated using (
  (employee_id = auth.uid() and public.has_permission('expenses.submit'))
  or (
    public.has_permission('expenses.approve')
    and (
      public.has_permission('employees.view_all')
      or public.is_team_supervisor_for(employee_id)
    )
  )
);
create policy expenses_rbac_insert on public.expenses
for insert to authenticated with check (
  employee_id = auth.uid() and public.has_permission('expenses.submit')
);
create policy expenses_rbac_update on public.expenses
for update to authenticated
using (
  public.has_permission('expenses.approve')
  and (
    public.has_permission('employees.view_all')
    or public.is_team_supervisor_for(employee_id)
  )
)
with check (
  public.has_permission('expenses.approve')
  and (
    public.has_permission('employees.view_all')
    or public.is_team_supervisor_for(employee_id)
  )
);

drop policy if exists locations_select on public.employee_locations;
drop policy if exists locations_employee_write on public.employee_locations;
drop policy if exists employee_locations_rbac_select on public.employee_locations;
drop policy if exists employee_locations_rbac_write on public.employee_locations;
create policy employee_locations_rbac_select on public.employee_locations
for select to authenticated using (
  (employee_id = auth.uid() and public.has_permission('locations.share_self'))
  or public.has_permission('locations.view_all')
  or (
    public.has_permission('locations.view_team')
    and public.is_team_supervisor_for(employee_id)
  )
);
create policy employee_locations_rbac_write on public.employee_locations
for all to authenticated
using (employee_id = auth.uid() and public.has_permission('locations.share_self'))
with check (employee_id = auth.uid() and public.has_permission('locations.share_self'));

drop policy if exists location_history_select on public.location_history;
drop policy if exists location_history_employee_insert on public.location_history;
drop policy if exists location_history_rbac_select on public.location_history;
drop policy if exists location_history_rbac_insert on public.location_history;
create policy location_history_rbac_select on public.location_history
for select to authenticated using (
  (employee_id = auth.uid() and public.has_permission('locations.share_self'))
  or public.has_permission('locations.view_all')
  or (
    public.has_permission('locations.view_team')
    and public.is_team_supervisor_for(employee_id)
  )
);
create policy location_history_rbac_insert on public.location_history
for insert to authenticated with check (
  employee_id = auth.uid() and public.has_permission('locations.share_self')
);

drop policy if exists sos_select on public.sos_alerts;
drop policy if exists sos_employee_insert on public.sos_alerts;
drop policy if exists sos_management_update on public.sos_alerts;
drop policy if exists sos_rbac_select on public.sos_alerts;
drop policy if exists sos_rbac_insert on public.sos_alerts;
drop policy if exists sos_rbac_update on public.sos_alerts;
create policy sos_rbac_select on public.sos_alerts
for select to authenticated using (
  (employee_id = auth.uid() and public.has_permission('sos.create'))
  or (
    public.has_permission('sos.view_team')
    and (
      public.has_permission('employees.view_all')
      or public.is_team_supervisor_for(employee_id)
    )
  )
);
create policy sos_rbac_insert on public.sos_alerts
for insert to authenticated with check (
  employee_id = auth.uid() and public.has_permission('sos.create')
);
create policy sos_rbac_update on public.sos_alerts
for update to authenticated
using (
  public.has_permission('sos.resolve')
  and (
    public.has_permission('employees.view_all')
    or public.is_team_supervisor_for(employee_id)
  )
)
with check (
  public.has_permission('sos.resolve')
  and (
    public.has_permission('employees.view_all')
    or public.is_team_supervisor_for(employee_id)
  )
);

drop policy if exists projects_management_all on public.projects;
drop policy if exists projects_employee_select on public.projects;
drop policy if exists projects_rbac_select on public.projects;
drop policy if exists projects_rbac_write on public.projects;
create policy projects_rbac_select on public.projects
for select to authenticated using (
  public.has_permission('projects.manage')
  or (
    public.has_permission('projects.view_self')
    and exists (
      select 1
      from public.project_modules module
      join public.work_assignments assignment on assignment.module_id = module.id
      where module.project_id = projects.id
        and assignment.employee_id = auth.uid()
    )
  )
  or (
    public.has_permission('projects.review')
    and exists (
      select 1
      from public.project_modules module
      join public.work_assignments assignment on assignment.module_id = module.id
      where module.project_id = projects.id
        and assignment.reviewer_id = auth.uid()
    )
  )
);
create policy projects_rbac_write on public.projects
for all to authenticated
using (public.has_permission('projects.manage'))
with check (public.has_permission('projects.manage'));

drop policy if exists modules_management_all on public.project_modules;
drop policy if exists modules_employee_select on public.project_modules;
drop policy if exists modules_rbac_select on public.project_modules;
drop policy if exists modules_rbac_write on public.project_modules;
create policy modules_rbac_select on public.project_modules
for select to authenticated using (
  public.has_permission('projects.manage')
  or (
    public.has_permission('projects.view_self')
    and exists (
      select 1 from public.work_assignments assignment
      where assignment.module_id = project_modules.id
        and assignment.employee_id = auth.uid()
    )
  )
  or (
    public.has_permission('projects.review')
    and exists (
      select 1 from public.work_assignments assignment
      where assignment.module_id = project_modules.id
        and assignment.reviewer_id = auth.uid()
    )
  )
);
create policy modules_rbac_write on public.project_modules
for all to authenticated
using (public.has_permission('projects.manage'))
with check (public.has_permission('projects.manage'));

drop policy if exists assignments_management_all on public.work_assignments;
drop policy if exists assignments_employee_select on public.work_assignments;
drop policy if exists assignments_rbac_select on public.work_assignments;
drop policy if exists assignments_rbac_write on public.work_assignments;
drop policy if exists assignments_rbac_insert on public.work_assignments;
drop policy if exists assignments_rbac_update on public.work_assignments;
drop policy if exists assignments_rbac_delete on public.work_assignments;
create policy assignments_rbac_select on public.work_assignments
for select to authenticated using (
  public.has_permission('projects.manage')
  or (employee_id = auth.uid() and public.has_permission('projects.view_self'))
  or (reviewer_id = auth.uid() and public.has_permission('projects.review'))
);
create policy assignments_rbac_insert on public.work_assignments
for insert to authenticated
with check (public.has_permission('projects.manage'));
create policy assignments_rbac_update on public.work_assignments
for update to authenticated
using (
  public.has_permission('projects.manage')
  or (reviewer_id = auth.uid() and public.has_permission('projects.review'))
)
with check (
  public.has_permission('projects.manage')
  or (reviewer_id = auth.uid() and public.has_permission('projects.review'))
);
create policy assignments_rbac_delete on public.work_assignments
for delete to authenticated
using (public.has_permission('projects.manage'));

drop policy if exists submissions_management_all on public.work_submissions;
drop policy if exists submissions_employee_select on public.work_submissions;
drop policy if exists submissions_employee_insert on public.work_submissions;
drop policy if exists submissions_rbac_select on public.work_submissions;
drop policy if exists submissions_rbac_insert on public.work_submissions;
drop policy if exists submissions_rbac_update on public.work_submissions;
create policy submissions_rbac_select on public.work_submissions
for select to authenticated using (
  public.has_permission('projects.manage')
  or (employee_id = auth.uid() and public.has_permission('projects.view_self'))
  or (
    public.has_permission('projects.review')
    and exists (
      select 1 from public.work_assignments assignment
      where assignment.id = work_submissions.assignment_id
        and assignment.reviewer_id = auth.uid()
    )
  )
);
create policy submissions_rbac_insert on public.work_submissions
for insert to authenticated with check (
  employee_id = auth.uid()
  and public.has_permission('projects.view_self')
  and work_status = 'Submitted for Review'
  and reviewed_by is null
  and reviewed_at is null
  and exists (
    select 1 from public.work_assignments assignment
    where assignment.id = assignment_id
      and assignment.employee_id = auth.uid()
  )
);
create policy submissions_rbac_update on public.work_submissions
for update to authenticated
using (
  public.has_permission('projects.manage')
  or (
    public.has_permission('projects.review')
    and exists (
      select 1 from public.work_assignments assignment
      where assignment.id = work_submissions.assignment_id
        and assignment.reviewer_id = auth.uid()
    )
  )
)
with check (
  public.has_permission('projects.manage')
  or (
    public.has_permission('projects.review')
    and exists (
      select 1 from public.work_assignments assignment
      where assignment.id = work_submissions.assignment_id
        and assignment.reviewer_id = auth.uid()
    )
  )
);

drop policy if exists submission_files_management_all on public.submission_files;
drop policy if exists submission_files_employee_select on public.submission_files;
drop policy if exists submission_files_employee_insert on public.submission_files;
drop policy if exists submission_files_rbac_select on public.submission_files;
drop policy if exists submission_files_rbac_insert on public.submission_files;
create policy submission_files_rbac_select on public.submission_files
for select to authenticated using (
  public.has_permission('projects.manage')
  or (
    uploaded_by = auth.uid()
    and public.has_permission('projects.view_self')
  )
  or (
    public.has_permission('projects.review')
    and exists (
      select 1
      from public.work_submissions submission
      join public.work_assignments assignment on assignment.id = submission.assignment_id
      where submission.id = submission_files.submission_id
        and assignment.reviewer_id = auth.uid()
    )
  )
);
create policy submission_files_rbac_insert on public.submission_files
for insert to authenticated with check (
  uploaded_by = auth.uid()
  and public.has_permission('projects.view_self')
  and exists (
    select 1 from public.work_submissions submission
    where submission.id = submission_id
      and submission.employee_id = auth.uid()
  )
);

-- Attendance location settings are available only with settings.manage;
-- active locations remain readable for users who can use/view attendance.
drop policy if exists attendance_locations_active_select on public.attendance_locations;
drop policy if exists attendance_locations_admin_insert on public.attendance_locations;
drop policy if exists attendance_locations_admin_update on public.attendance_locations;
drop policy if exists attendance_locations_rbac_select on public.attendance_locations;
drop policy if exists attendance_locations_rbac_insert on public.attendance_locations;
drop policy if exists attendance_locations_rbac_update on public.attendance_locations;
create policy attendance_locations_rbac_select on public.attendance_locations
for select to authenticated using (
  public.has_permission('settings.manage')
  or (
    active and public.has_any_permission(array[
      'attendance.view_self',
      'attendance.view_team',
      'attendance.view_all'
    ])
  )
);
create policy attendance_locations_rbac_insert on public.attendance_locations
for insert to authenticated with check (
  public.has_permission('settings.manage') and created_by = auth.uid()
);
create policy attendance_locations_rbac_update on public.attendance_locations
for update to authenticated
using (public.has_permission('settings.manage'))
with check (public.has_permission('settings.manage'));

-- Permission-aware employee RPCs. Older FieldFlow databases used the
-- public.task_state enum, while newer databases may store task status as text.
-- Remove any two-argument legacy overload and recreate a schema-compatible
-- text signature. The update casts through the column's actual PostgreSQL type.
do $$
declare
  function_record record;
begin
  for function_record in
    select procedure.oid::regprocedure as signature
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'update_my_task_status'
      and procedure.pronargs = 2
  loop
    execute format('drop function %s', function_record.signature);
  end loop;
end
$$;

create function public.update_my_task_status(
  p_task_id uuid,
  p_status text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  status_type text;
  updated_id uuid;
begin
  if not public.has_permission('tasks.view_self') then
    raise exception 'You do not have permission to update tasks';
  end if;

  if p_status not in ('Assigned', 'On The Way', 'In Progress', 'Completed', 'Blocked') then
    raise exception 'A valid task status is required';
  end if;

  select format_type(attribute.atttypid, attribute.atttypmod)
  into status_type
  from pg_attribute attribute
  where attribute.attrelid = 'public.tasks'::regclass
    and attribute.attname = 'status'
    and not attribute.attisdropped;

  if status_type is null then
    raise exception 'The tasks status column is not available';
  end if;

  execute format(
    'update public.tasks
     set status = $1::%s, updated_at = now()
     where id = $2 and employee_id = auth.uid()
     returning id',
    status_type
  )
  into updated_id
  using p_status, p_task_id;

  if updated_id is null then raise exception 'Task not found'; end if;
  return updated_id;
end
$$;

create or replace function public.update_my_assignment(
  p_assignment_id uuid,
  p_status text,
  p_checklist_progress jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('projects.view_self') then
    raise exception 'You do not have permission to update project work';
  end if;
  if p_status not in ('Not Started','In Progress','Submitted for Review') then
    raise exception 'This status cannot be set by the assigned user';
  end if;
  update public.work_assignments
  set
    status = p_status,
    checklist_progress = coalesce(p_checklist_progress, checklist_progress),
    started_at = case
      when p_status = 'In Progress' then coalesce(started_at, now())
      else started_at
    end,
    updated_at = now()
  where id = p_assignment_id and employee_id = auth.uid();
  if not found then raise exception 'Assignment not found'; end if;
  return p_assignment_id;
end
$$;

-- Replace only the authorization clause in the geofence RPCs; validation and
-- distance persistence remain unchanged.
create or replace function public.check_in_with_gps(
  p_time_zone text,
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  shift_id uuid;
  local_time timestamp;
  work_day date;
  status text;
  geofence record;
begin
  if not public.has_permission('attendance.view_self') then
    raise exception 'You do not have permission to check in';
  end if;
  select * into strict geofence
  from public.validate_attendance_geofence(p_lat, p_lng);
  local_time := now() at time zone p_time_zone;
  work_day := local_time::date;
  status := case when extract(hour from local_time) >= 9 then 'Late' else 'On time' end;
  insert into public.attendance_shifts(
    employee_id, work_date, time_zone, check_in_at,
    check_in_lat, check_in_lng, check_in_accuracy,
    check_in_location_id, check_in_distance_m, attendance_status
  ) values (
    auth.uid(), work_day, p_time_zone, now(),
    p_lat, p_lng, p_accuracy,
    geofence.location_id, geofence.distance_m, status
  )
  returning id into shift_id;
  return shift_id;
end
$$;

create or replace function public.check_out_with_gps(
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  shift_id uuid;
  geofence record;
begin
  if not public.has_permission('attendance.view_self') then
    raise exception 'You do not have permission to check out';
  end if;
  select * into strict geofence
  from public.validate_attendance_geofence(p_lat, p_lng);
  update public.attendance_shifts
  set
    check_out_at = now(),
    check_out_lat = p_lat,
    check_out_lng = p_lng,
    check_out_accuracy = p_accuracy,
    check_out_location_id = geofence.location_id,
    check_out_distance_m = geofence.distance_m
  where employee_id = auth.uid() and check_out_at is null
  returning id into shift_id;
  if shift_id is null then raise exception 'No active check-in was found'; end if;
  return shift_id;
end
$$;

-- Storage access follows the submission/assignment authorization above.
drop policy if exists work_files_authorized_select on storage.objects;
drop policy if exists work_files_employee_insert on storage.objects;
drop policy if exists work_files_employee_delete on storage.objects;
create policy work_files_employee_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'work-submissions'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.has_permission('projects.view_self')
);
create policy work_files_authorized_select on storage.objects
for select to authenticated using (
  bucket_id = 'work-submissions'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.has_permission('projects.manage')
    or exists (
      select 1
      from public.submission_files file
      join public.work_submissions submission on submission.id = file.submission_id
      join public.work_assignments assignment on assignment.id = submission.assignment_id
      where file.object_path = storage.objects.name
        and assignment.reviewer_id = auth.uid()
        and public.has_permission('projects.review')
    )
  )
);
create policy work_files_employee_delete on storage.objects
for delete to authenticated using (
  bucket_id = 'work-submissions'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.has_permission('projects.manage')
  )
);

revoke all on public.roles, public.permissions, public.role_permissions,
  public.user_roles, public.teams, public.team_members,
  public.rbac_audit_log from anon;
grant select, insert, update, delete on public.roles to authenticated;
grant select on public.permissions to authenticated;
grant select, insert, update, delete on public.role_permissions to authenticated;
grant select, insert, update, delete on public.user_roles to authenticated;
grant select, insert, update, delete on public.teams to authenticated;
grant select, insert, update, delete on public.team_members to authenticated;
grant select on public.rbac_audit_log to authenticated;

revoke update on public.profiles from authenticated;
grant update(approval_status, active, role, requested_role, department, updated_at)
  on public.profiles to authenticated;

grant execute on function public.is_owner(uuid) to authenticated;
grant execute on function public.has_permission(text) to authenticated;
grant execute on function public.has_any_permission(text[]) to authenticated;
grant execute on function public.is_team_supervisor_for(uuid) to authenticated;
grant execute on function public.can_view_profile(uuid) to authenticated;
grant execute on function public.get_my_team_member_ids() to authenticated;
grant execute on function public.can_access_team(uuid) to authenticated;
grant execute on function public.get_my_access_context() to authenticated;
grant execute on function public.update_my_task_status(uuid, text) to authenticated;
grant execute on function public.update_my_assignment(uuid, text, jsonb) to authenticated;
grant execute on function public.check_in_with_gps(text, double precision, double precision, double precision) to authenticated;
grant execute on function public.check_out_with_gps(double precision, double precision, double precision) to authenticated;

notify pgrst, 'reload schema';
