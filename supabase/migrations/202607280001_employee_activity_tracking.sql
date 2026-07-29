-- FieldFlow employee activity tracking foundation.
--
-- This migration is strictly additive. It creates a separate monitoring
-- subsystem and registers new permissions without changing any existing
-- table, column, trigger, function, policy, role assignment, or permission.
--
-- Security model:
--   * employees with activity.view_self can read only their own records;
--   * supervisors with activity.view_team can read supervised employees;
--   * activity.view_all can read workforce records across this single-project
--     workspace;
--   * activity.policies.manage administers policies and devices;
--   * the protected Owner retains administrative read/manage access through
--     public.is_owner(auth.uid());
--   * samples, heartbeats, acknowledgements, summaries, and audit logs have no
--     ordinary authenticated update/delete path.
--
-- Privacy model:
--   * device_identifier_hash stores only a one-way identifier hash;
--   * activity_samples stores event counts, idle duration, lock state, and an
--     optional application name;
--   * actual keystrokes, typed content, clipboard contents, window contents,
--     screenshots, raw device identifiers, tokens, and secrets are not
--     represented anywhere in this schema.

-- Register only new activity permissions. ON CONFLICT DO NOTHING deliberately
-- preserves every pre-existing permission row exactly as it is.
insert into public.permissions (key, name, description, group_name) values
  (
    'activity.view_self',
    'View own activity',
    'View the current employee monitoring devices, sessions, samples, heartbeats, and summaries.',
    'Activity'
  ),
  (
    'activity.view_team',
    'View team activity',
    'View monitoring records for employees in teams supervised by the current user.',
    'Activity'
  ),
  (
    'activity.view_all',
    'View workforce activity',
    'View monitoring records for all employees in the current FieldFlow workspace.',
    'Activity'
  ),
  (
    'activity.policies.manage',
    'Manage monitoring policies',
    'Create and update monitoring policies and administer registered employee devices.',
    'Activity'
  )
on conflict (key) do nothing;

-- Add only the approved default grants. Existing role permissions and user role
-- assignments are never updated or removed, and custom roles receive nothing.
-- Some hosted SQL runners execute migrations without either an authenticated
-- Owner identity or the trusted session_user recognised by the existing RBAC
-- guard. In that environment the guard must remain enabled, so only its exact
-- "cannot grant" response is deferred to the existing Owner role editor.
do $activity_default_role_grants$
begin
  begin
    insert into public.role_permissions (role_id, permission_id)
    select role.id, permission.id
    from public.roles role
    join public.permissions permission
      on permission.key = 'activity.view_self'
    where lower(role.name) = 'standard employee'
    on conflict (role_id, permission_id) do nothing;
  exception when raise_exception then
    if sqlerrm <> 'You cannot grant a permission that you do not have' then
      raise;
    end if;
    raise notice 'Deferred activity.view_self default grant to the Owner role editor.';
  end;

  begin
    insert into public.role_permissions (role_id, permission_id)
    select role.id, permission.id
    from public.roles role
    join public.permissions permission
      on permission.key = 'activity.view_team'
    where lower(role.name) = 'management'
    on conflict (role_id, permission_id) do nothing;
  exception when raise_exception then
    if sqlerrm <> 'You cannot grant a permission that you do not have' then
      raise;
    end if;
    raise notice 'Deferred activity.view_team default grant to the Owner role editor.';
  end;

  begin
    insert into public.role_permissions (role_id, permission_id)
    select role.id, permission.id
    from public.roles role
    join public.permissions permission
      on permission.key in (
        'activity.view_self',
        'activity.view_team',
        'activity.view_all',
        'activity.policies.manage'
      )
    where lower(role.name) = 'owner'
    on conflict (role_id, permission_id) do nothing;
  exception when raise_exception then
    if sqlerrm <> 'You cannot grant a permission that you do not have' then
      raise;
    end if;
    raise notice 'Deferred Owner activity default grants to the Owner role editor.';
  end;
end
$activity_default_role_grants$;

create table public.monitoring_policies (
  id uuid primary key default gen_random_uuid(),
  policy_version integer not null unique check (policy_version > 0),
  is_active boolean not null default false,
  tracking_enabled boolean not null default false,
  idle_threshold_seconds integer not null default 300
    check (idle_threshold_seconds between 30 and 86400),
  sample_interval_seconds integer not null default 60
    check (sample_interval_seconds between 10 and 3600),
  upload_interval_seconds integer not null default 300
    check (upload_interval_seconds between 30 and 86400),
  offline_sync_limit_seconds integer not null default 86400
    check (offline_sync_limit_seconds between 0 and 2592000),
  heartbeat_interval_seconds integer not null default 60
    check (heartbeat_interval_seconds between 15 and 3600),
  collect_application_names boolean not null default false,
  require_acknowledgement boolean not null default true,
  retention_days integer not null default 90
    check (retention_days between 1 and 3650),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, policy_version)
);

comment on table public.monitoring_policies is
  'Versioned, project-wide monitoring configuration. A partial unique index identifies at most one active policy in the single-tenant Supabase project.';
comment on column public.monitoring_policies.is_active is
  'Marks the one policy version currently in force for this Supabase project.';
comment on column public.monitoring_policies.collect_application_names is
  'Controls collection of application names only; window contents and typed content are never collected.';

-- The bootstrap policy is intentionally disabled for tracking. created_by is
-- null because this row is generated by the migration rather than a user.
insert into public.monitoring_policies (
  policy_version,
  is_active,
  tracking_enabled,
  idle_threshold_seconds,
  sample_interval_seconds,
  upload_interval_seconds,
  offline_sync_limit_seconds,
  heartbeat_interval_seconds,
  collect_application_names,
  require_acknowledgement,
  retention_days,
  created_by
) values (
  1,
  true,
  false,
  300,
  60,
  300,
  86400,
  60,
  false,
  true,
  90,
  null
)
on conflict (policy_version) do nothing;

create table public.monitoring_policy_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  policy_version integer not null check (policy_version > 0),
  acknowledged_at timestamptz not null default now(),
  acknowledgement_text_hash text not null
    check (acknowledgement_text_hash ~ '^[A-Fa-f0-9]{64,128}$'),
  created_at timestamptz not null default now(),
  foreign key (policy_id, policy_version)
    references public.monitoring_policies(id, policy_version),
  unique (employee_id, policy_id, policy_version)
);

comment on table public.monitoring_policy_acknowledgements is
  'Append-only employee acknowledgement of an exact monitoring policy version; only a cryptographic text hash is retained.';

create table public.employee_devices (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  device_name text not null
    check (char_length(btrim(device_name)) between 2 and 160),
  platform text not null
    check (platform in ('windows', 'macos', 'linux', 'other')),
  operating_system_version text
    check (
      operating_system_version is null
      or char_length(operating_system_version) between 1 and 160
    ),
  agent_version text not null
    check (char_length(agent_version) between 1 and 80),
  device_identifier_hash text not null unique
    check (device_identifier_hash ~ '^[A-Fa-f0-9]{64,128}$'),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'revoked')),
  registered_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, employee_id),
  constraint employee_device_status_dates_valid check (
    (status = 'revoked' and revoked_at is not null)
    or (status in ('pending', 'active') and revoked_at is null)
  ),
  constraint employee_device_seen_after_registration check (
    last_seen_at is null or last_seen_at >= registered_at
  ),
  constraint employee_device_revoked_after_registration check (
    revoked_at is null or revoked_at >= registered_at
  )
);

comment on table public.employee_devices is
  'Employee desktop-agent registrations. device_identifier_hash must be a one-way hash; raw hardware or operating-system identifiers must never be stored.';

create table public.tracking_sessions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  device_id uuid not null,
  project_id uuid references public.projects(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'active'
    check (status in ('active', 'ended', 'cancelled')),
  start_source text not null default 'agent'
    check (start_source in ('agent', 'web', 'manual', 'api')),
  end_source text
    check (
      end_source is null
      or end_source in (
        'agent',
        'web',
        'manual',
        'api',
        'policy',
        'device_revoked',
        'timeout'
      )
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (device_id, employee_id)
    references public.employee_devices(id, employee_id) on delete cascade,
  unique (id, employee_id, device_id),
  constraint tracking_session_status_dates_valid check (
    (status = 'active' and ended_at is null and end_source is null)
    or (status in ('ended', 'cancelled') and ended_at is not null)
  ),
  constraint tracking_session_end_after_start check (
    ended_at is null or ended_at >= started_at
  )
);

comment on table public.tracking_sessions is
  'Explicit employee monitoring sessions associated with one registered device and optional existing FieldFlow project/task context.';

create table public.activity_samples (
  id uuid primary key default gen_random_uuid(),
  local_sample_id text not null
    check (char_length(local_sample_id) between 1 and 120),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  device_id uuid not null,
  tracking_session_id uuid not null,
  captured_at timestamptz not null,
  keyboard_event_count integer not null default 0
    check (keyboard_event_count between 0 and 1000000),
  mouse_event_count integer not null default 0
    check (mouse_event_count between 0 and 1000000),
  idle_seconds integer not null default 0
    check (idle_seconds between 0 and 86400),
  active_application text
    check (
      active_application is null
      or char_length(active_application) between 1 and 255
    ),
  screen_locked boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (device_id, employee_id)
    references public.employee_devices(id, employee_id) on delete cascade,
  foreign key (tracking_session_id, employee_id, device_id)
    references public.tracking_sessions(id, employee_id, device_id)
    on delete cascade,
  unique (device_id, local_sample_id)
);

comment on table public.activity_samples is
  'Append-only aggregate activity measurements. keyboard_event_count is a count only: keystrokes, key values, typed text, clipboard data, screenshots, and window contents are never stored.';
comment on column public.activity_samples.active_application is
  'Optional bounded application name controlled by the active monitoring policy; it must not contain titles, document names, URLs, or typed content.';

create table public.agent_heartbeats (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  device_id uuid not null,
  tracking_session_id uuid,
  recorded_at timestamptz not null default now(),
  agent_version text not null
    check (char_length(agent_version) between 1 and 80),
  online_status text not null
    check (online_status in ('online', 'idle', 'offline', 'error')),
  battery_level smallint
    check (battery_level is null or battery_level between 0 and 100),
  created_at timestamptz not null default now(),
  foreign key (device_id, employee_id)
    references public.employee_devices(id, employee_id) on delete cascade,
  foreign key (tracking_session_id, employee_id, device_id)
    references public.tracking_sessions(id, employee_id, device_id)
    on delete cascade
);

comment on table public.agent_heartbeats is
  'Append-only desktop-agent health observations used for latest-state and availability checks.';

create table public.activity_daily_summaries (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  summary_date date not null,
  tracked_seconds integer not null default 0 check (tracked_seconds >= 0),
  active_seconds integer not null default 0 check (active_seconds >= 0),
  idle_seconds integer not null default 0 check (idle_seconds >= 0),
  offline_seconds integer not null default 0 check (offline_seconds >= 0),
  activity_percentage numeric(5,2) not null default 0
    check (activity_percentage between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, summary_date),
  constraint activity_daily_duration_consistency check (
    active_seconds + idle_seconds <= tracked_seconds
  )
);

comment on table public.activity_daily_summaries is
  'Calculated daily monitoring totals. Ordinary employees have read-only access and cannot edit calculated values.';

create table public.activity_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  employee_id uuid references public.profiles(id) on delete set null,
  action text not null
    check (char_length(btrim(action)) between 2 and 120),
  entity_type text not null
    check (char_length(btrim(entity_type)) between 2 and 80),
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb
    check (
      jsonb_typeof(metadata) = 'object'
      and pg_column_size(metadata) <= 16384
    ),
  created_at timestamptz not null default now()
);

comment on table public.activity_audit_logs is
  'Append-only administrative monitoring audit records. Metadata must never contain secrets, tokens, raw device identifiers, typed content, screenshots, or clipboard contents.';

-- Indexes are confined to the eight new monitoring tables.
create unique index monitoring_policies_one_active_idx
  on public.monitoring_policies (is_active)
  where is_active;

create index monitoring_policies_active_version_idx
  on public.monitoring_policies (is_active, policy_version desc);

create index monitoring_acknowledgements_employee_time_idx
  on public.monitoring_policy_acknowledgements (
    employee_id,
    acknowledged_at desc
  );

create index monitoring_acknowledgements_policy_idx
  on public.monitoring_policy_acknowledgements (
    policy_id,
    policy_version,
    acknowledged_at desc
  );

create index employee_devices_employee_status_idx
  on public.employee_devices (employee_id, status, last_seen_at desc);

create index employee_devices_latest_seen_idx
  on public.employee_devices (last_seen_at desc)
  where status = 'active';

create unique index tracking_sessions_one_active_employee_idx
  on public.tracking_sessions (employee_id)
  where status = 'active' and ended_at is null;

create index tracking_sessions_employee_started_idx
  on public.tracking_sessions (employee_id, started_at desc);

create index tracking_sessions_device_started_idx
  on public.tracking_sessions (device_id, started_at desc);

create index tracking_sessions_project_started_idx
  on public.tracking_sessions (project_id, started_at desc)
  where project_id is not null;

create index tracking_sessions_task_started_idx
  on public.tracking_sessions (task_id, started_at desc)
  where task_id is not null;

create index activity_samples_employee_captured_idx
  on public.activity_samples (employee_id, captured_at desc);

create index activity_samples_session_captured_idx
  on public.activity_samples (tracking_session_id, captured_at);

create index activity_samples_device_captured_idx
  on public.activity_samples (device_id, captured_at desc);

create index agent_heartbeats_employee_recorded_idx
  on public.agent_heartbeats (employee_id, recorded_at desc);

create index agent_heartbeats_device_recorded_idx
  on public.agent_heartbeats (device_id, recorded_at desc);

create index agent_heartbeats_session_recorded_idx
  on public.agent_heartbeats (tracking_session_id, recorded_at desc)
  where tracking_session_id is not null;

create index activity_daily_summaries_date_employee_idx
  on public.activity_daily_summaries (summary_date desc, employee_id);

create index activity_audit_logs_created_idx
  on public.activity_audit_logs (created_at desc);

create index activity_audit_logs_employee_created_idx
  on public.activity_audit_logs (employee_id, created_at desc)
  where employee_id is not null;

create index activity_audit_logs_entity_idx
  on public.activity_audit_logs (entity_type, entity_id, created_at desc);

-- Reuse the existing no-argument updated_at trigger helper without modifying it.
create trigger monitoring_policies_set_updated_at
before update on public.monitoring_policies
for each row execute function public.set_rbac_updated_at();

create trigger employee_devices_set_updated_at
before update on public.employee_devices
for each row execute function public.set_rbac_updated_at();

create trigger tracking_sessions_set_updated_at
before update on public.tracking_sessions
for each row execute function public.set_rbac_updated_at();

create trigger activity_daily_summaries_set_updated_at
before update on public.activity_daily_summaries
for each row execute function public.set_rbac_updated_at();

alter table public.monitoring_policies enable row level security;
alter table public.monitoring_policy_acknowledgements enable row level security;
alter table public.employee_devices enable row level security;
alter table public.tracking_sessions enable row level security;
alter table public.activity_samples enable row level security;
alter table public.agent_heartbeats enable row level security;
alter table public.activity_daily_summaries enable row level security;
alter table public.activity_audit_logs enable row level security;

-- Active policy is visible to users participating in monitoring. Inactive
-- versions are restricted to monitoring administrators and the Owner.
create policy monitoring_policies_read
on public.monitoring_policies
for select to authenticated
using (
  (
    is_active
    and (
      public.has_permission('activity.view_self')
      or public.has_permission('activity.view_team')
      or public.has_permission('activity.view_all')
    )
  )
  or public.has_permission('activity.policies.manage')
  or public.is_owner(auth.uid())
);

create policy monitoring_policies_insert
on public.monitoring_policies
for insert to authenticated
with check (
  (
    public.has_permission('activity.policies.manage')
    or public.is_owner(auth.uid())
  )
  and created_by = auth.uid()
);

create policy monitoring_policies_update
on public.monitoring_policies
for update to authenticated
using (
  public.has_permission('activity.policies.manage')
  or public.is_owner(auth.uid())
)
with check (
  public.has_permission('activity.policies.manage')
  or public.is_owner(auth.uid())
);

create policy monitoring_acknowledgements_read
on public.monitoring_policy_acknowledgements
for select to authenticated
using (
  (
    employee_id = auth.uid()
    and public.has_permission('activity.view_self')
  )
  or (
    public.has_permission('activity.view_team')
    and public.is_team_supervisor_for(employee_id)
  )
  or public.has_permission('activity.view_all')
  or public.has_permission('activity.policies.manage')
  or public.is_owner(auth.uid())
);

create policy monitoring_acknowledgements_insert_self
on public.monitoring_policy_acknowledgements
for insert to authenticated
with check (
  employee_id = auth.uid()
  and public.has_permission('activity.view_self')
  and acknowledged_at <= now()
  and exists (
    select 1
    from public.monitoring_policies policy
    where policy.id = policy_id
      and policy.policy_version = monitoring_policy_acknowledgements.policy_version
      and policy.is_active
  )
);

create policy employee_devices_read
on public.employee_devices
for select to authenticated
using (
  (
    employee_id = auth.uid()
    and public.has_permission('activity.view_self')
  )
  or (
    public.has_permission('activity.view_team')
    and public.is_team_supervisor_for(employee_id)
  )
  or public.has_permission('activity.view_all')
  or public.has_permission('activity.policies.manage')
  or public.is_owner(auth.uid())
);

create policy employee_devices_insert_self
on public.employee_devices
for insert to authenticated
with check (
  employee_id = auth.uid()
  and public.has_permission('activity.view_self')
  and status = 'pending'
  and revoked_at is null
);

create policy employee_devices_update
on public.employee_devices
for update to authenticated
using (
  (
    employee_id = auth.uid()
    and public.has_permission('activity.view_self')
  )
  or public.has_permission('activity.policies.manage')
  or public.is_owner(auth.uid())
)
with check (
  (
    employee_id = auth.uid()
    and public.has_permission('activity.view_self')
  )
  or public.has_permission('activity.policies.manage')
  or public.is_owner(auth.uid())
);

create policy tracking_sessions_read
on public.tracking_sessions
for select to authenticated
using (
  (
    employee_id = auth.uid()
    and public.has_permission('activity.view_self')
  )
  or (
    public.has_permission('activity.view_team')
    and public.is_team_supervisor_for(employee_id)
  )
  or public.has_permission('activity.view_all')
  or public.is_owner(auth.uid())
);

create policy tracking_sessions_insert_self
on public.tracking_sessions
for insert to authenticated
with check (
  employee_id = auth.uid()
  and public.has_permission('activity.view_self')
  and status = 'active'
  and ended_at is null
  and exists (
    select 1
    from public.employee_devices device
    where device.id = device_id
      and device.employee_id = auth.uid()
      and device.status = 'active'
  )
  and exists (
    select 1
    from public.monitoring_policies policy
    where policy.is_active
      and policy.tracking_enabled
      and (
        not policy.require_acknowledgement
        or exists (
          select 1
          from public.monitoring_policy_acknowledgements acknowledgement
          where acknowledgement.policy_id = policy.id
            and acknowledgement.policy_version = policy.policy_version
            and acknowledgement.employee_id = auth.uid()
        )
      )
  )
);

create policy tracking_sessions_update_self
on public.tracking_sessions
for update to authenticated
using (
  (
    employee_id = auth.uid()
    and public.has_permission('activity.view_self')
  )
  or public.is_owner(auth.uid())
)
with check (
  (
    employee_id = auth.uid()
    and public.has_permission('activity.view_self')
  )
  or public.is_owner(auth.uid())
);

create policy activity_samples_read
on public.activity_samples
for select to authenticated
using (
  (
    employee_id = auth.uid()
    and public.has_permission('activity.view_self')
  )
  or (
    public.has_permission('activity.view_team')
    and public.is_team_supervisor_for(employee_id)
  )
  or public.has_permission('activity.view_all')
  or public.is_owner(auth.uid())
);

create policy activity_samples_insert_self
on public.activity_samples
for insert to authenticated
with check (
  employee_id = auth.uid()
  and public.has_permission('activity.view_self')
  and exists (
    select 1
    from public.employee_devices device
    where device.id = device_id
      and device.employee_id = auth.uid()
      and device.status = 'active'
  )
  and exists (
    select 1
    from public.tracking_sessions session
    where session.id = tracking_session_id
      and session.employee_id = auth.uid()
      and session.device_id = device_id
      and session.status = 'active'
      and session.ended_at is null
      and captured_at >= session.started_at
      and captured_at <= now() + interval '5 minutes'
  )
);

create policy agent_heartbeats_read
on public.agent_heartbeats
for select to authenticated
using (
  (
    employee_id = auth.uid()
    and public.has_permission('activity.view_self')
  )
  or (
    public.has_permission('activity.view_team')
    and public.is_team_supervisor_for(employee_id)
  )
  or public.has_permission('activity.view_all')
  or public.is_owner(auth.uid())
);

create policy agent_heartbeats_insert_self
on public.agent_heartbeats
for insert to authenticated
with check (
  employee_id = auth.uid()
  and public.has_permission('activity.view_self')
  and exists (
    select 1
    from public.employee_devices device
    where device.id = device_id
      and device.employee_id = auth.uid()
      and device.status = 'active'
  )
  and (
    tracking_session_id is null
    or exists (
      select 1
      from public.tracking_sessions session
      where session.id = tracking_session_id
        and session.employee_id = auth.uid()
        and session.device_id = device_id
    )
  )
);

create policy activity_daily_summaries_read
on public.activity_daily_summaries
for select to authenticated
using (
  (
    employee_id = auth.uid()
    and public.has_permission('activity.view_self')
  )
  or (
    public.has_permission('activity.view_team')
    and public.is_team_supervisor_for(employee_id)
  )
  or public.has_permission('activity.view_all')
  or public.is_owner(auth.uid())
);

create policy activity_audit_logs_read
on public.activity_audit_logs
for select to authenticated
using (
  public.has_permission('activity.policies.manage')
  or public.has_permission('activity.view_all')
  or public.is_owner(auth.uid())
);

-- Explicit table privileges complement RLS. No new monitoring table is exposed
-- to anon, and append-only/calculated tables omit update/delete grants.
revoke all on public.monitoring_policies,
  public.monitoring_policy_acknowledgements,
  public.employee_devices,
  public.tracking_sessions,
  public.activity_samples,
  public.agent_heartbeats,
  public.activity_daily_summaries,
  public.activity_audit_logs
from anon, authenticated;

grant select on public.monitoring_policies to authenticated;
grant insert (
  policy_version,
  is_active,
  tracking_enabled,
  idle_threshold_seconds,
  sample_interval_seconds,
  upload_interval_seconds,
  offline_sync_limit_seconds,
  heartbeat_interval_seconds,
  collect_application_names,
  require_acknowledgement,
  retention_days,
  created_by
) on public.monitoring_policies to authenticated;
grant update (
  policy_version,
  is_active,
  tracking_enabled,
  idle_threshold_seconds,
  sample_interval_seconds,
  upload_interval_seconds,
  offline_sync_limit_seconds,
  heartbeat_interval_seconds,
  collect_application_names,
  require_acknowledgement,
  retention_days,
  updated_at
) on public.monitoring_policies to authenticated;

grant select on public.monitoring_policy_acknowledgements to authenticated;
grant insert (
  policy_id,
  employee_id,
  policy_version,
  acknowledgement_text_hash
) on public.monitoring_policy_acknowledgements to authenticated;

grant select on public.employee_devices to authenticated;
grant insert (
  employee_id,
  device_name,
  platform,
  operating_system_version,
  agent_version,
  device_identifier_hash,
  status
) on public.employee_devices to authenticated;
grant update (
  device_name,
  platform,
  operating_system_version,
  agent_version,
  status,
  last_seen_at,
  revoked_at,
  updated_at
) on public.employee_devices to authenticated;

grant select on public.tracking_sessions to authenticated;
grant insert (
  employee_id,
  device_id,
  project_id,
  task_id,
  status,
  start_source
) on public.tracking_sessions to authenticated;
grant update (
  ended_at,
  status,
  end_source,
  updated_at
) on public.tracking_sessions to authenticated;

grant select on public.activity_samples to authenticated;
grant insert (
  local_sample_id,
  employee_id,
  device_id,
  tracking_session_id,
  captured_at,
  keyboard_event_count,
  mouse_event_count,
  idle_seconds,
  active_application,
  screen_locked
) on public.activity_samples to authenticated;

grant select on public.agent_heartbeats to authenticated;
grant insert (
  employee_id,
  device_id,
  tracking_session_id,
  agent_version,
  online_status,
  battery_level
) on public.agent_heartbeats to authenticated;
grant select on public.activity_daily_summaries to authenticated;
grant select on public.activity_audit_logs to authenticated;

-- Refresh PostgREST after all new objects and privileges are installed.
notify pgrst, 'reload schema';
