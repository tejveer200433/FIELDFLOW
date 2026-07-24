-- Secure attendance geofencing. Run this migration in Supabase before deploying
-- the matching application code.

-- Some FieldFlow databases were created before the role helper was added to the
-- initial production migration. Create a compatible helper only when missing.
do $$
begin
  if to_regprocedure('public.current_role()') is null then
    execute $sql$
      create function public.current_role()
      returns text
      language sql
      stable
      security definer
      set search_path = public
      as $function$
        select role::text
        from public.profiles
        where id = auth.uid()
          and active = true
          and approval_status::text = 'approved'
      $function$
    $sql$;
  end if;
end
$$;

create table if not exists public.attendance_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 160),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  radius_m integer not null default 200 check (radius_m between 25 and 5000),
  active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists attendance_locations_active_idx
  on public.attendance_locations (active);

alter table public.attendance_shifts
  add column if not exists check_in_location_id uuid
    references public.attendance_locations(id) on delete set null,
  add column if not exists check_out_location_id uuid
    references public.attendance_locations(id) on delete set null,
  add column if not exists check_in_distance_m double precision
    check (check_in_distance_m is null or check_in_distance_m >= 0),
  add column if not exists check_out_distance_m double precision
    check (check_out_distance_m is null or check_out_distance_m >= 0);

create or replace function public.set_attendance_location_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists attendance_locations_set_updated_at
on public.attendance_locations;
create trigger attendance_locations_set_updated_at
before update on public.attendance_locations
for each row execute function public.set_attendance_location_updated_at();

-- Haversine distance between two WGS84 coordinate pairs, in metres.
create or replace function public.calculate_distance_m(
  p_latitude_1 double precision,
  p_longitude_1 double precision,
  p_latitude_2 double precision,
  p_longitude_2 double precision
)
returns double precision
language sql
immutable
strict
parallel safe
set search_path = public
as $$
  select 6371000.0 * 2.0 * asin(
    least(
      1.0,
      sqrt(
        power(sin(radians(p_latitude_2 - p_latitude_1) / 2.0), 2)
        + cos(radians(p_latitude_1))
        * cos(radians(p_latitude_2))
        * power(sin(radians(p_longitude_2 - p_longitude_1) / 2.0), 2)
      )
    )
  )
$$;

create or replace function public.validate_attendance_geofence(
  p_latitude double precision,
  p_longitude double precision
)
returns table (
  location_id uuid,
  location_name text,
  radius_m integer,
  distance_m double precision
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_latitude is null
     or p_longitude is null
     or p_latitude not between -90 and 90
     or p_longitude not between -180 and 180 then
    raise exception using
      errcode = '22023',
      message = 'A valid GPS location is required.';
  end if;

  if not exists (
    select 1 from public.attendance_locations location where location.active
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Attendance is not configured yet. Ask an administrator to add an office or site location.';
  end if;

  return query
  select candidate.id, candidate.name, candidate.radius_m, candidate.distance_m
  from (
    select
      location.id,
      location.name,
      location.radius_m,
      public.calculate_distance_m(
        p_latitude,
        p_longitude,
        location.latitude,
        location.longitude
      ) as distance_m
    from public.attendance_locations location
    where location.active
  ) candidate
  where candidate.distance_m <= candidate.radius_m
  order by candidate.distance_m
  limit 1;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'You are outside the allowed office or site radius. Move closer to your assigned attendance location and try again.';
  end if;
end
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
begin
  if public.current_role()::text <> 'employee' then
    raise exception 'Only employees can check in';
  end if;

  select *
  into strict geofence
  from public.validate_attendance_geofence(p_lat, p_lng);

  local_time := now() at time zone p_time_zone;
  work_day := local_time::date;
  status := case when extract(hour from local_time) >= 9 then 'Late' else 'On time' end;

  insert into public.attendance_shifts (
    employee_id,
    work_date,
    time_zone,
    check_in_at,
    check_in_lat,
    check_in_lng,
    check_in_accuracy,
    check_in_location_id,
    check_in_distance_m,
    attendance_status
  )
  values (
    auth.uid(),
    work_day,
    p_time_zone,
    now(),
    p_lat,
    p_lng,
    p_accuracy,
    geofence.location_id,
    geofence.distance_m,
    status
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
  if public.current_role()::text <> 'employee' then
    raise exception 'Only employees can check out';
  end if;

  select *
  into strict geofence
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

  if shift_id is null then
    raise exception 'No active check-in was found';
  end if;

  return shift_id;
end
$$;

alter table public.attendance_locations enable row level security;

drop policy if exists attendance_locations_active_select
on public.attendance_locations;
create policy attendance_locations_active_select
on public.attendance_locations
for select
to authenticated
using (
  public.current_role()::text = 'admin'
  or (
    active
    and public.current_role()::text in ('employee', 'manager')
  )
);

drop policy if exists attendance_locations_admin_insert
on public.attendance_locations;
create policy attendance_locations_admin_insert
on public.attendance_locations
for insert
to authenticated
with check (
  public.current_role()::text = 'admin'
  and created_by = auth.uid()
);

drop policy if exists attendance_locations_admin_update
on public.attendance_locations;
create policy attendance_locations_admin_update
on public.attendance_locations
for update
to authenticated
using (public.current_role()::text = 'admin')
with check (public.current_role()::text = 'admin');

revoke all on public.attendance_locations from anon;
revoke delete on public.attendance_locations from authenticated;
grant select, insert, update on public.attendance_locations to authenticated;

revoke all on function public.calculate_distance_m(
  double precision,
  double precision,
  double precision,
  double precision
) from public;
revoke all on function public.validate_attendance_geofence(
  double precision,
  double precision
) from public;
grant execute on function public.validate_attendance_geofence(
  double precision,
  double precision
) to authenticated;

grant execute on function public.check_in_with_gps(
  text,
  double precision,
  double precision,
  double precision
) to authenticated;
grant execute on function public.check_out_with_gps(
  double precision,
  double precision,
  double precision
) to authenticated;

-- Make the new foreign-key relationships immediately visible to PostgREST.
notify pgrst, 'reload schema';
