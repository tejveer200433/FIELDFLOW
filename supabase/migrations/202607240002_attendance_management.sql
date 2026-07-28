-- FieldFlow attendance management and assigned geofences.
-- Run after:
--   20260723_attendance_geofence.sql
--   202607240001_dynamic_rbac.sql
-- This migration is intentionally upgrade-safe and does not remove attendance data.

create table if not exists public.attendance_shift_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  start_time time not null,
  end_time time not null,
  unpaid_break_minutes integer not null default 0 check (unpaid_break_minutes between 0 and 480),
  grace_minutes integer not null default 15 check (grace_minutes between 0 and 180),
  auto_checkout_after_minutes integer not null default 120 check (auto_checkout_after_minutes between 15 and 720),
  weekly_off_days smallint[] not null default array[0]::smallint[],
  active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_shift_weekdays_valid check (
    weekly_off_days <@ array[0,1,2,3,4,5,6]::smallint[]
  )
);

create table if not exists public.employee_attendance_schedules (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  shift_template_id uuid not null references public.attendance_shift_templates(id),
  effective_from date not null,
  effective_to date,
  weekdays smallint[] not null default array[1,2,3,4,5]::smallint[],
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_schedule_dates_valid check (effective_to is null or effective_to >= effective_from),
  constraint attendance_schedule_weekdays_valid check (
    weekdays <@ array[0,1,2,3,4,5,6]::smallint[] and cardinality(weekdays) > 0
  )
);

create index if not exists employee_attendance_schedules_lookup_idx
  on public.employee_attendance_schedules(employee_id, effective_from desc);

create table if not exists public.attendance_rosters (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null,
  shift_template_id uuid not null references public.attendance_shift_templates(id),
  check_in_location_id uuid references public.attendance_locations(id) on delete set null,
  check_out_location_id uuid references public.attendance_locations(id) on delete set null,
  notes text check (notes is null or char_length(notes) <= 1000),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(employee_id, work_date)
);

create index if not exists attendance_rosters_date_idx
  on public.attendance_rosters(work_date, employee_id);

create table if not exists public.attendance_holidays (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 160),
  holiday_date date not null,
  location_id uuid references public.attendance_locations(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists attendance_holidays_unique_global_idx
  on public.attendance_holidays(holiday_date, lower(name))
  where location_id is null;

create unique index if not exists attendance_holidays_unique_location_idx
  on public.attendance_holidays(holiday_date, location_id, lower(name))
  where location_id is not null;

create table if not exists public.attendance_breaks (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.attendance_shifts(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  constraint attendance_break_end_valid check (ended_at is null or ended_at >= started_at)
);

create unique index if not exists one_open_attendance_break_per_employee
  on public.attendance_breaks(employee_id) where ended_at is null;

create index if not exists attendance_breaks_shift_idx
  on public.attendance_breaks(shift_id, started_at);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  leave_type text not null check (leave_type in ('Annual', 'Sick', 'Casual', 'Unpaid', 'Other')),
  start_date date not null,
  end_date date not null,
  reason text not null check (char_length(btrim(reason)) between 2 and 2000),
  status text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected', 'Cancelled')),
  reviewer_comment text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leave_request_dates_valid check (end_date >= start_date)
);

create index if not exists leave_requests_employee_dates_idx
  on public.leave_requests(employee_id, start_date desc, end_date);

create table if not exists public.attendance_corrections (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.attendance_shifts(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  requested_check_in_at timestamptz,
  requested_check_out_at timestamptz,
  reason text not null check (char_length(btrim(reason)) between 2 and 2000),
  status text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected', 'Cancelled')),
  reviewer_comment text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_correction_time_valid check (
    requested_check_out_at is null
    or requested_check_in_at is null
    or requested_check_out_at >= requested_check_in_at
  )
);

create unique index if not exists one_pending_correction_per_shift
  on public.attendance_corrections(shift_id) where status = 'Pending';

create table if not exists public.attendance_geofence_assignments (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.attendance_locations(id) on delete cascade,
  target_type text not null check (target_type in ('all', 'team', 'employee', 'project')),
  team_id uuid references public.teams(id) on delete cascade,
  employee_id uuid references public.profiles(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  event_type text not null default 'both' check (event_type in ('both', 'check-in', 'check-out')),
  valid_from date,
  valid_until date,
  weekdays smallint[] not null default array[0,1,2,3,4,5,6]::smallint[],
  window_start time,
  window_end time,
  active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_geofence_assignment_target_valid check (
    (target_type = 'all' and team_id is null and employee_id is null and project_id is null)
    or (target_type = 'team' and team_id is not null and employee_id is null and project_id is null)
    or (target_type = 'employee' and team_id is null and employee_id is not null and project_id is null)
    or (target_type = 'project' and team_id is null and employee_id is null and project_id is not null)
  ),
  constraint attendance_geofence_assignment_dates_valid check (
    valid_until is null or valid_from is null or valid_until >= valid_from
  ),
  constraint attendance_geofence_assignment_weekdays_valid check (
    weekdays <@ array[0,1,2,3,4,5,6]::smallint[] and cardinality(weekdays) > 0
  )
);

create index if not exists attendance_geofence_assignments_lookup_idx
  on public.attendance_geofence_assignments(location_id, active, target_type);

-- Keep existing geofences usable after upgrade. Administrators can deactivate
-- these compatibility assignments after adding team/employee/project rules.
insert into public.attendance_geofence_assignments(
  location_id, target_type, event_type, created_by
)
select location.id, 'all', 'both', location.created_by
from public.attendance_locations location
where not exists (
  select 1
  from public.attendance_geofence_assignments assignment
  where assignment.location_id = location.id
)
on conflict do nothing;

alter table public.attendance_shifts
  add column if not exists shift_template_id uuid references public.attendance_shift_templates(id) on delete set null,
  add column if not exists schedule_id uuid references public.employee_attendance_schedules(id) on delete set null,
  add column if not exists roster_id uuid references public.attendance_rosters(id) on delete set null,
  add column if not exists scheduled_start_at timestamptz,
  add column if not exists scheduled_end_at timestamptz,
  add column if not exists break_minutes integer not null default 0 check (break_minutes >= 0),
  add column if not exists worked_minutes integer not null default 0 check (worked_minutes >= 0),
  add column if not exists overtime_minutes integer not null default 0 check (overtime_minutes >= 0),
  add column if not exists is_weekly_off boolean not null default false,
  add column if not exists is_holiday boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_attendance_management_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create or replace function public.set_attendance_management_created_by()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  return new;
end
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'attendance_shift_templates',
    'employee_attendance_schedules',
    'attendance_rosters',
    'attendance_holidays',
    'leave_requests',
    'attendance_corrections',
    'attendance_geofence_assignments'
  ]
  loop
    execute format('drop trigger if exists %I_set_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger %I_set_updated_at before update on public.%I
       for each row execute function public.set_attendance_management_updated_at()',
      table_name,
      table_name
    );
    if table_name = any(array[
      'attendance_shift_templates',
      'employee_attendance_schedules',
      'attendance_rosters',
      'attendance_holidays',
      'attendance_geofence_assignments'
    ]) then
      execute format('drop trigger if exists %I_set_created_by on public.%I', table_name, table_name);
      execute format(
        'create trigger %I_set_created_by before insert on public.%I
         for each row execute function public.set_attendance_management_created_by()',
        table_name,
        table_name
      );
    end if;
  end loop;
end
$$;

drop trigger if exists leave_requests_set_created_by on public.leave_requests;
drop trigger if exists attendance_corrections_set_created_by on public.attendance_corrections;

create or replace function public.can_manage_attendance_user(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_owner(auth.uid())
    or public.has_permission('attendance.view_all')
    or (
      public.has_permission('attendance.approve')
      and public.is_team_supervisor_for(target_user_id)
    )
$$;

create or replace function public.can_view_attendance_geofence_assignment(
  p_target_type text,
  p_team_id uuid,
  p_employee_id uuid,
  p_project_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_any_permission(array[
      'attendance.view_team',
      'attendance.view_all',
      'attendance.approve',
      'settings.manage'
    ])
    or p_target_type = 'all'
    or (p_target_type = 'employee' and p_employee_id = auth.uid())
    or (
      p_target_type = 'team'
      and exists (
        select 1 from public.team_members member
        where member.team_id = p_team_id and member.user_id = auth.uid()
      )
    )
    or (
      p_target_type = 'project'
      and exists (
        select 1
        from public.project_modules module
        join public.work_assignments assignment on assignment.module_id = module.id
        where module.project_id = p_project_id
          and assignment.employee_id = auth.uid()
      )
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
      'projects.manage',
      'settings.manage'
    ])
    or (
      public.is_team_supervisor_for(target_user_id)
      and public.has_any_permission(array[
        'tasks.assign',
        'attendance.view_team',
        'attendance.approve',
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

create or replace function public.recalculate_attendance_totals(p_shift_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  shift_record record;
  paid_minutes integer;
  recorded_break_minutes integer;
  scheduled_minutes integer;
begin
  select *
  into shift_record
  from public.attendance_shifts
  where id = p_shift_id;

  if shift_record.id is null then
    return;
  end if;

  select coalesce(sum(
    greatest(0, floor(extract(epoch from (
      coalesce(break_record.ended_at, coalesce(shift_record.check_out_at, now()))
      - break_record.started_at
    )) / 60))::integer
  ), 0)
  into recorded_break_minutes
  from public.attendance_breaks break_record
  where break_record.shift_id = p_shift_id;

  paid_minutes := greatest(
    0,
    floor(extract(epoch from (
      coalesce(shift_record.check_out_at, now()) - shift_record.check_in_at
    )) / 60)::integer - recorded_break_minutes
  );

  scheduled_minutes := case
    when shift_record.is_weekly_off or shift_record.is_holiday then 0
    when shift_record.scheduled_start_at is not null and shift_record.scheduled_end_at is not null
    then greatest(
      0,
      floor(extract(epoch from (
        shift_record.scheduled_end_at - shift_record.scheduled_start_at
      )) / 60)::integer - coalesce((
        select template.unpaid_break_minutes
        from public.attendance_shift_templates template
        where template.id = shift_record.shift_template_id
      ), 0)
    )
    else paid_minutes
  end;

  update public.attendance_shifts
  set
    break_minutes = recorded_break_minutes,
    worked_minutes = paid_minutes,
    overtime_minutes = greatest(0, paid_minutes - scheduled_minutes)
  where id = p_shift_id;
end
$$;

create or replace function public.get_effective_attendance_plan(
  p_user_id uuid,
  p_work_date date,
  p_time_zone text
)
returns table(
  shift_template_id uuid,
  schedule_id uuid,
  roster_id uuid,
  shift_name text,
  scheduled_start_at timestamptz,
  scheduled_end_at timestamptz,
  grace_minutes integer,
  auto_checkout_after_minutes integer,
  weekly_off boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  selected_template public.attendance_shift_templates%rowtype;
  selected_template_id uuid;
  selected_schedule uuid;
  selected_roster uuid;
  selected_weekdays smallint[];
  local_start timestamp;
  local_end timestamp;
begin
  select roster.id, roster.shift_template_id
  into selected_roster, selected_template_id
  from public.attendance_rosters roster
  join public.attendance_shift_templates template on template.id = roster.shift_template_id
  where roster.employee_id = p_user_id
    and roster.work_date = p_work_date
    and template.active
  limit 1;

  if selected_template_id is null then
    select schedule.id, schedule.shift_template_id, schedule.weekdays
    into selected_schedule, selected_template_id, selected_weekdays
    from public.employee_attendance_schedules schedule
    join public.attendance_shift_templates template on template.id = schedule.shift_template_id
    where schedule.employee_id = p_user_id
      and p_work_date >= schedule.effective_from
      and (schedule.effective_to is null or p_work_date <= schedule.effective_to)
      and template.active
    order by schedule.effective_from desc, schedule.created_at desc
    limit 1;
  end if;

  if selected_template_id is null then
    return;
  end if;

  select * into selected_template
  from public.attendance_shift_templates
  where id = selected_template_id;

  local_start := p_work_date + selected_template.start_time;
  local_end := p_work_date + selected_template.end_time;
  if selected_template.end_time <= selected_template.start_time then
    local_end := local_end + interval '1 day';
  end if;

  return query select
    selected_template.id,
    selected_schedule,
    selected_roster,
    selected_template.name,
    local_start at time zone p_time_zone,
    local_end at time zone p_time_zone,
    selected_template.grace_minutes,
    selected_template.auto_checkout_after_minutes,
    case
      when selected_roster is not null then false
      else extract(dow from p_work_date)::smallint = any(selected_template.weekly_off_days)
        or (
          selected_weekdays is not null
          and not extract(dow from p_work_date)::smallint = any(selected_weekdays)
        )
    end;
end
$$;

-- Assigned geofence validation. Specific roster locations take precedence,
-- followed by employee, team, project, and compatibility/global assignments.
create or replace function public.validate_attendance_geofence(
  p_latitude double precision,
  p_longitude double precision,
  p_event_type text,
  p_time_zone text
)
returns table(
  location_id uuid,
  location_name text,
  radius_m integer,
  distance_m double precision
)
language plpgsql
security definer
set search_path = public
as $$
declare
  local_now timestamp;
  local_date date;
  local_clock time;
  required_location_id uuid;
begin
  if not public.has_permission('attendance.view_self') then
    raise exception 'You do not have permission to record attendance';
  end if;
  if p_event_type not in ('check-in', 'check-out') then
    raise exception 'A valid attendance event is required';
  end if;
  if p_latitude is null or p_longitude is null
     or p_latitude not between -90 and 90
     or p_longitude not between -180 and 180 then
    raise exception using errcode = '22023', message = 'A valid GPS location is required.';
  end if;

  local_now := now() at time zone p_time_zone;
  local_date := local_now::date;
  local_clock := local_now::time;

  if p_event_type = 'check-out' then
    select roster.check_out_location_id
    into required_location_id
    from public.attendance_shifts shift_record
    left join public.attendance_rosters roster on roster.id = shift_record.roster_id
    where shift_record.employee_id = auth.uid()
      and shift_record.check_out_at is null;
  else
    select roster.check_in_location_id
    into required_location_id
    from public.attendance_rosters roster
    where roster.employee_id = auth.uid()
      and roster.work_date = local_date;
  end if;

  if not exists (
    select 1
    from public.attendance_locations location
    where location.active
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Attendance is not configured yet. Ask an administrator to add an office or site location.';
  end if;

  return query
  with eligible as (
    select
      location.id,
      location.name,
      location.radius_m,
      public.calculate_distance_m(
        p_latitude, p_longitude, location.latitude, location.longitude
      ) as calculated_distance,
      0 as priority
    from public.attendance_locations location
    where required_location_id is not null
      and location.id = required_location_id
      and location.active

    union all

    select
      location.id,
      location.name,
      location.radius_m,
      public.calculate_distance_m(
        p_latitude, p_longitude, location.latitude, location.longitude
      ) as calculated_distance,
      case assignment.target_type
        when 'employee' then 1
        when 'team' then 2
        when 'project' then 3
        else 4
      end as priority
    from public.attendance_locations location
    join public.attendance_geofence_assignments assignment
      on assignment.location_id = location.id
    where location.active
      and assignment.active
      and required_location_id is null
      and assignment.event_type in ('both', p_event_type)
      and (assignment.valid_from is null or local_date >= assignment.valid_from)
      and (assignment.valid_until is null or local_date <= assignment.valid_until)
      and extract(dow from local_date)::smallint = any(assignment.weekdays)
      and (
        assignment.window_start is null
        or assignment.window_end is null
        or (
          assignment.window_end > assignment.window_start
          and local_clock between assignment.window_start and assignment.window_end
        )
        or (
          assignment.window_end <= assignment.window_start
          and (local_clock >= assignment.window_start or local_clock <= assignment.window_end)
        )
      )
      and (
        assignment.target_type = 'all'
        or (assignment.target_type = 'employee' and assignment.employee_id = auth.uid())
        or (
          assignment.target_type = 'team'
          and exists (
            select 1 from public.team_members member
            where member.team_id = assignment.team_id and member.user_id = auth.uid()
          )
        )
        or (
          assignment.target_type = 'project'
          and exists (
            select 1
            from public.project_modules module
            join public.work_assignments work_assignment on work_assignment.module_id = module.id
            where module.project_id = assignment.project_id
              and work_assignment.employee_id = auth.uid()
          )
        )
      )
  )
  select eligible.id, eligible.name, eligible.radius_m, eligible.calculated_distance
  from eligible
  where eligible.calculated_distance <= eligible.radius_m
  order by
    case when eligible.id = required_location_id then 0 else eligible.priority end,
    eligible.calculated_distance
  limit 1;

  if not found then
    if not exists (
      select 1
      from public.attendance_geofence_assignments assignment
      where assignment.active
        and (
          assignment.target_type = 'all'
          or (assignment.target_type = 'employee' and assignment.employee_id = auth.uid())
          or (
            assignment.target_type = 'team'
            and exists (
              select 1 from public.team_members member
              where member.team_id = assignment.team_id and member.user_id = auth.uid()
            )
          )
          or (
            assignment.target_type = 'project'
            and exists (
              select 1
              from public.project_modules module
              join public.work_assignments work_assignment on work_assignment.module_id = module.id
              where module.project_id = assignment.project_id
                and work_assignment.employee_id = auth.uid()
            )
          )
        )
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'No attendance location is assigned to you for this time. Ask your manager or administrator to update your attendance assignment.';
    end if;
    raise exception using
      errcode = 'P0001',
      message = 'You are outside the allowed office or site radius. Move closer to your assigned attendance location and try again.';
  end if;
end
$$;

-- Retain the legacy signature for diagnostics while enforcing assigned rules.
create or replace function public.validate_attendance_geofence(
  p_latitude double precision,
  p_longitude double precision
)
returns table(
  location_id uuid,
  location_name text,
  radius_m integer,
  distance_m double precision
)
language sql
security definer
set search_path = public
as $$
  select *
  from public.validate_attendance_geofence(
    p_latitude, p_longitude, 'check-in', 'UTC'
  )
$$;

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
  plan record;
  holiday_today boolean;
begin
  if not public.has_permission('attendance.view_self') then
    raise exception 'You do not have permission to check in';
  end if;
  if exists (
    select 1 from public.leave_requests leave_request
    where leave_request.employee_id = auth.uid()
      and leave_request.status = 'Approved'
      and (now() at time zone p_time_zone)::date
          between leave_request.start_date and leave_request.end_date
  ) then
    raise exception 'You have approved leave for today. Ask your manager to cancel the leave before checking in.';
  end if;

  select * into strict geofence
  from public.validate_attendance_geofence(p_lat, p_lng, 'check-in', p_time_zone);

  local_time := now() at time zone p_time_zone;
  work_day := local_time::date;
  select * into plan
  from public.get_effective_attendance_plan(auth.uid(), work_day, p_time_zone);
  select exists (
    select 1
    from public.attendance_holidays holiday
    where holiday.holiday_date = work_day
      and (holiday.location_id is null or holiday.location_id = geofence.location_id)
  ) into holiday_today;

  status := case
    when coalesce(plan.weekly_off, false) or holiday_today then 'On time'
    when plan.scheduled_start_at is not null
      and now() > plan.scheduled_start_at + make_interval(mins => plan.grace_minutes)
    then 'Late'
    when plan.scheduled_start_at is null and extract(hour from local_time) >= 9
    then 'Late'
    else 'On time'
  end;

  insert into public.attendance_shifts(
    employee_id, work_date, time_zone, check_in_at,
    check_in_lat, check_in_lng, check_in_accuracy,
    check_in_location_id, check_in_distance_m, attendance_status,
    shift_template_id, schedule_id, roster_id,
    scheduled_start_at, scheduled_end_at,
    is_weekly_off, is_holiday
  ) values (
    auth.uid(), work_day, p_time_zone, now(),
    p_lat, p_lng, p_accuracy,
    geofence.location_id, geofence.distance_m, status,
    plan.shift_template_id, plan.schedule_id, plan.roster_id,
    plan.scheduled_start_at, plan.scheduled_end_at,
    coalesce(plan.weekly_off, false), holiday_today
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
  shift_time_zone text;
  geofence record;
begin
  if not public.has_permission('attendance.view_self') then
    raise exception 'You do not have permission to check out';
  end if;
  select time_zone into shift_time_zone
  from public.attendance_shifts
  where employee_id = auth.uid() and check_out_at is null;
  if shift_time_zone is null then
    raise exception 'No active check-in was found';
  end if;
  if exists (
    select 1 from public.attendance_breaks
    where employee_id = auth.uid() and ended_at is null
  ) then
    raise exception 'End your current break before checking out.';
  end if;

  select * into strict geofence
  from public.validate_attendance_geofence(
    p_lat, p_lng, 'check-out', shift_time_zone
  );

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

  perform public.recalculate_attendance_totals(shift_id);
  return shift_id;
end
$$;

create or replace function public.start_attendance_break()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  open_shift uuid;
  break_id uuid;
begin
  if not public.has_permission('attendance.view_self') then
    raise exception 'You do not have permission to record a break';
  end if;
  select id into open_shift
  from public.attendance_shifts
  where employee_id = auth.uid() and check_out_at is null;
  if open_shift is null then raise exception 'Check in before starting a break'; end if;
  insert into public.attendance_breaks(shift_id, employee_id)
  values(open_shift, auth.uid())
  returning id into break_id;
  return break_id;
end
$$;

create or replace function public.end_attendance_break()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  break_id uuid;
  target_shift uuid;
begin
  update public.attendance_breaks
  set ended_at = now()
  where employee_id = auth.uid() and ended_at is null
  returning id, shift_id into break_id, target_shift;
  if break_id is null then raise exception 'No active break was found'; end if;
  perform public.recalculate_attendance_totals(target_shift);
  return break_id;
end
$$;

create or replace function public.review_leave_request(
  p_request_id uuid,
  p_status text,
  p_comment text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user uuid;
begin
  if p_status not in ('Approved', 'Rejected') then
    raise exception 'A valid leave decision is required';
  end if;
  select employee_id into target_user
  from public.leave_requests where id = p_request_id and status = 'Pending';
  if target_user is null then raise exception 'Pending leave request not found'; end if;
  if not public.can_manage_attendance_user(target_user)
     and not public.has_permission('settings.manage') then
    raise exception 'You do not have permission to review this leave request';
  end if;
  update public.leave_requests
  set status = p_status,
      reviewer_comment = nullif(btrim(p_comment), ''),
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_request_id;
  return p_request_id;
end
$$;

create or replace function public.review_attendance_correction(
  p_request_id uuid,
  p_status text,
  p_comment text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  correction record;
  corrected_check_in timestamptz;
  corrected_check_out timestamptz;
begin
  if p_status not in ('Approved', 'Rejected') then
    raise exception 'A valid correction decision is required';
  end if;
  select * into correction
  from public.attendance_corrections
  where id = p_request_id and status = 'Pending';
  if correction.id is null then raise exception 'Pending correction request not found'; end if;
  if not public.can_manage_attendance_user(correction.employee_id)
     and not public.has_permission('settings.manage') then
    raise exception 'You do not have permission to review this correction';
  end if;

  if p_status = 'Approved' then
    select
      coalesce(correction.requested_check_in_at, shift_record.check_in_at),
      coalesce(correction.requested_check_out_at, shift_record.check_out_at)
    into corrected_check_in, corrected_check_out
    from public.attendance_shifts shift_record
    where shift_record.id = correction.shift_id;
    if corrected_check_out is not null and corrected_check_out < corrected_check_in then
      raise exception 'Corrected checkout cannot be before corrected check-in';
    end if;
    update public.attendance_shifts
    set
      check_in_at = corrected_check_in,
      check_out_at = corrected_check_out,
      work_date = (corrected_check_in at time zone time_zone)::date,
      updated_at = now()
    where id = correction.shift_id
      and employee_id = correction.employee_id;
    perform public.recalculate_attendance_totals(correction.shift_id);
  end if;

  update public.attendance_corrections
  set status = p_status,
      reviewer_comment = nullif(btrim(p_comment), ''),
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_request_id;
  return p_request_id;
end
$$;

alter table public.attendance_shift_templates enable row level security;
alter table public.employee_attendance_schedules enable row level security;
alter table public.attendance_rosters enable row level security;
alter table public.attendance_holidays enable row level security;
alter table public.attendance_breaks enable row level security;
alter table public.leave_requests enable row level security;
alter table public.attendance_corrections enable row level security;
alter table public.attendance_geofence_assignments enable row level security;

drop policy if exists attendance_shift_templates_read on public.attendance_shift_templates;
drop policy if exists attendance_shift_templates_manage on public.attendance_shift_templates;
drop policy if exists attendance_schedules_read on public.employee_attendance_schedules;
drop policy if exists attendance_schedules_manage on public.employee_attendance_schedules;
drop policy if exists attendance_rosters_read on public.attendance_rosters;
drop policy if exists attendance_rosters_manage on public.attendance_rosters;
drop policy if exists attendance_holidays_read on public.attendance_holidays;
drop policy if exists attendance_holidays_manage on public.attendance_holidays;
drop policy if exists attendance_breaks_read on public.attendance_breaks;
drop policy if exists leave_requests_read on public.leave_requests;
drop policy if exists leave_requests_employee_insert on public.leave_requests;
drop policy if exists leave_requests_employee_update on public.leave_requests;
drop policy if exists attendance_corrections_read on public.attendance_corrections;
drop policy if exists attendance_corrections_employee_insert on public.attendance_corrections;
drop policy if exists attendance_corrections_employee_update on public.attendance_corrections;
drop policy if exists attendance_geofence_assignments_read on public.attendance_geofence_assignments;
drop policy if exists attendance_geofence_assignments_manage on public.attendance_geofence_assignments;
drop policy if exists projects_attendance_settings_select on public.projects;
drop policy if exists teams_attendance_settings_select on public.teams;

create policy attendance_shift_templates_read on public.attendance_shift_templates
for select to authenticated using (
  public.has_permission('attendance.view_self')
  or public.has_any_permission(array['attendance.view_team','attendance.view_all','attendance.approve','settings.manage'])
);
create policy attendance_shift_templates_manage on public.attendance_shift_templates
for all to authenticated
using (public.has_permission('settings.manage') or public.has_permission('attendance.approve'))
with check (
  public.has_permission('settings.manage') or public.has_permission('attendance.approve')
);

create policy attendance_schedules_read on public.employee_attendance_schedules
for select to authenticated using (
  employee_id = auth.uid()
  or public.can_manage_attendance_user(employee_id)
  or public.has_permission('settings.manage')
);
create policy attendance_schedules_manage on public.employee_attendance_schedules
for all to authenticated
using (public.can_manage_attendance_user(employee_id) or public.has_permission('settings.manage'))
with check (
  public.can_manage_attendance_user(employee_id) or public.has_permission('settings.manage')
);

create policy attendance_rosters_read on public.attendance_rosters
for select to authenticated using (
  employee_id = auth.uid()
  or public.can_manage_attendance_user(employee_id)
  or public.has_permission('settings.manage')
);
create policy attendance_rosters_manage on public.attendance_rosters
for all to authenticated
using (public.can_manage_attendance_user(employee_id) or public.has_permission('settings.manage'))
with check (
  public.can_manage_attendance_user(employee_id) or public.has_permission('settings.manage')
);

create policy attendance_holidays_read on public.attendance_holidays
for select to authenticated using (public.has_permission('attendance.view_self') or public.has_permission('attendance.approve'));
create policy attendance_holidays_manage on public.attendance_holidays
for all to authenticated
using (public.has_permission('settings.manage') or public.has_permission('attendance.approve'))
with check (
  public.has_permission('settings.manage') or public.has_permission('attendance.approve')
);

create policy attendance_breaks_read on public.attendance_breaks
for select to authenticated using (
  employee_id = auth.uid() or public.can_manage_attendance_user(employee_id)
);

create policy leave_requests_read on public.leave_requests
for select to authenticated using (
  employee_id = auth.uid()
  or public.can_manage_attendance_user(employee_id)
  or public.has_permission('settings.manage')
);
create policy leave_requests_employee_insert on public.leave_requests
for insert to authenticated with check (
  employee_id = auth.uid() and public.has_permission('attendance.view_self')
);
create policy leave_requests_employee_update on public.leave_requests
for update to authenticated
using (employee_id = auth.uid() and status = 'Pending')
with check (employee_id = auth.uid() and status in ('Pending', 'Cancelled'));

create policy attendance_corrections_read on public.attendance_corrections
for select to authenticated using (
  employee_id = auth.uid()
  or public.can_manage_attendance_user(employee_id)
  or public.has_permission('settings.manage')
);
create policy attendance_corrections_employee_insert on public.attendance_corrections
for insert to authenticated with check (
  employee_id = auth.uid()
  and public.has_permission('attendance.view_self')
  and exists (
    select 1
    from public.attendance_shifts shift_record
    where shift_record.id = shift_id
      and shift_record.employee_id = auth.uid()
  )
);
create policy attendance_corrections_employee_update on public.attendance_corrections
for update to authenticated
using (employee_id = auth.uid() and status = 'Pending')
with check (employee_id = auth.uid() and status in ('Pending', 'Cancelled'));

create policy attendance_geofence_assignments_read on public.attendance_geofence_assignments
for select to authenticated using (
  public.can_view_attendance_geofence_assignment(
    target_type, team_id, employee_id, project_id
  )
);
create policy attendance_geofence_assignments_manage on public.attendance_geofence_assignments
for all to authenticated
using (public.has_permission('settings.manage'))
with check (public.has_permission('settings.manage'));

create policy projects_attendance_settings_select on public.projects
for select to authenticated
using (public.has_permission('settings.manage'));

create policy teams_attendance_settings_select on public.teams
for select to authenticated
using (public.has_permission('settings.manage'));

revoke insert, update, delete on public.attendance_breaks from authenticated;
revoke update, delete on public.leave_requests from authenticated;
revoke update, delete on public.attendance_corrections from authenticated;
grant select on public.attendance_shift_templates, public.employee_attendance_schedules,
  public.attendance_rosters, public.attendance_holidays, public.attendance_breaks,
  public.leave_requests, public.attendance_corrections,
  public.attendance_geofence_assignments to authenticated;
grant insert, update on public.attendance_shift_templates,
  public.employee_attendance_schedules, public.attendance_rosters,
  public.attendance_holidays, public.attendance_geofence_assignments to authenticated;
grant insert on public.leave_requests, public.attendance_corrections to authenticated;

revoke all on function public.get_effective_attendance_plan(uuid,date,text) from public;
revoke all on function public.recalculate_attendance_totals(uuid) from public;
revoke all on function public.can_manage_attendance_user(uuid) from public;
revoke all on function public.can_view_attendance_geofence_assignment(text,uuid,uuid,uuid) from public;
revoke all on function public.start_attendance_break() from public;
revoke all on function public.end_attendance_break() from public;
revoke all on function public.review_leave_request(uuid,text,text) from public;
revoke all on function public.review_attendance_correction(uuid,text,text) from public;
revoke all on function public.validate_attendance_geofence(double precision,double precision,text,text) from public;
grant execute on function public.start_attendance_break() to authenticated;
grant execute on function public.end_attendance_break() to authenticated;
grant execute on function public.review_leave_request(uuid,text,text) to authenticated;
grant execute on function public.review_attendance_correction(uuid,text,text) to authenticated;
grant execute on function public.validate_attendance_geofence(double precision,double precision,text,text) to authenticated;

notify pgrst, 'reload schema';
