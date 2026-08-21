alter table public.leave_requests
  add column if not exists leave_duration text not null default 'full_day';

alter table public.leave_requests
  drop constraint if exists leave_requests_duration_valid;

alter table public.leave_requests
  add constraint leave_requests_duration_valid check (
    leave_duration in ('full_day', 'first_half', 'second_half')
    and (leave_duration = 'full_day' or start_date = end_date)
  );

comment on column public.leave_requests.leave_duration is
  'Full-day or half-day leave. Half-day leave is restricted to one calendar date.';

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
      and leave_request.leave_duration = 'full_day'
      and (now() at time zone p_time_zone)::date
          between leave_request.start_date and leave_request.end_date
  ) then
    raise exception 'You have approved full-day leave for today. Ask your manager to cancel the leave before checking in.';
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
