-- FIELD-FLOW live daily activity summary aggregation.
--
-- Recomputes bounded UTC-day summaries from authoritative sessions and
-- accepted aggregate samples. The API invokes this function after ingestion,
-- so summaries become current without a service-role key or external cron job.

create or replace function public.activity_refresh_daily_summaries(
  p_start_date date default (now() at time zone 'utc')::date,
  p_end_date date default (now() at time zone 'utc')::date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  employee uuid := auth.uid();
  policy public.monitoring_policies;
begin
  if employee is null or not public.has_permission('activity.view_self') then
    raise exception 'Activity self access required';
  end if;
  if p_start_date is null
     or p_end_date is null
     or p_end_date < p_start_date
     or p_end_date - p_start_date > 31 then
    raise exception 'Invalid daily summary date range';
  end if;

  select item.* into policy
  from public.monitoring_policies item
  where item.is_active;
  if not found then raise exception 'No active monitoring policy'; end if;

  insert into public.activity_daily_summaries (
    employee_id,
    summary_date,
    tracked_seconds,
    active_seconds,
    idle_seconds,
    offline_seconds,
    activity_percentage
  )
  with days as (
    select
      (day_value at time zone 'utc')::date as summary_date,
      day_value as day_start,
      day_value + interval '1 day' as day_end
    from generate_series(
      p_start_date::timestamp at time zone 'utc',
      p_end_date::timestamp at time zone 'utc',
      interval '1 day'
    ) day_value
  ),
  session_totals as (
    select
      day.summary_date,
      greatest(0, floor(coalesce(sum(extract(epoch from (
        least(coalesce(session.ended_at, now()), day.day_end)
        - greatest(session.started_at, day.day_start)
      ))), 0)))::integer as tracked_seconds
    from days day
    left join public.tracking_sessions session
      on session.employee_id = employee
     and session.started_at < day.day_end
     and coalesce(session.ended_at, now()) > day.day_start
    group by day.summary_date
  ),
  sample_totals as (
    select
      day.summary_date,
      count(sample.id) filter (
        where not sample.screen_locked
          and sample.idle_seconds < policy.idle_threshold_seconds
      )::bigint * policy.sample_interval_seconds as raw_active_seconds,
      count(sample.id) filter (
        where sample.screen_locked
           or sample.idle_seconds >= policy.idle_threshold_seconds
      )::bigint * policy.sample_interval_seconds as raw_idle_seconds
    from days day
    left join public.activity_samples sample
      on sample.employee_id = employee
     and sample.captured_at >= day.day_start
     and sample.captured_at < day.day_end
    group by day.summary_date
  ),
  raw_totals as (
    select
      session.summary_date,
      session.tracked_seconds,
      coalesce(sample.raw_active_seconds, 0) as raw_active_seconds,
      coalesce(sample.raw_idle_seconds, 0) as raw_idle_seconds,
      least(
        session.tracked_seconds::bigint,
        coalesce(sample.raw_active_seconds, 0) + coalesce(sample.raw_idle_seconds, 0)
      ) as sampled_seconds
    from session_totals session
    left join sample_totals sample using (summary_date)
  ),
  normalized as (
    select
      summary_date,
      tracked_seconds,
      case
        when raw_active_seconds + raw_idle_seconds = 0 then 0
        else floor(
          sampled_seconds::numeric * raw_active_seconds
          / (raw_active_seconds + raw_idle_seconds)
        )::integer
      end as active_seconds,
      sampled_seconds::integer
    from raw_totals
  ),
  calculated as (
    select
      summary_date,
      tracked_seconds,
      active_seconds,
      sampled_seconds - active_seconds as idle_seconds,
      greatest(0, tracked_seconds - sampled_seconds) as offline_seconds,
      case
        when sampled_seconds = 0 then 0::numeric
        else round(100.0 * active_seconds / sampled_seconds, 2)
      end as activity_percentage
    from normalized
  )
  select
    employee,
    summary_date,
    tracked_seconds,
    active_seconds,
    idle_seconds,
    offline_seconds,
    activity_percentage
  from calculated
  on conflict (employee_id, summary_date) do update
  set tracked_seconds = excluded.tracked_seconds,
      active_seconds = excluded.active_seconds,
      idle_seconds = excluded.idle_seconds,
      offline_seconds = excluded.offline_seconds,
      activity_percentage = excluded.activity_percentage,
      updated_at = now();
end
$$;

revoke all on function public.activity_refresh_daily_summaries(date,date) from public;
grant execute on function public.activity_refresh_daily_summaries(date,date) to authenticated;

notify pgrst, 'reload schema';
