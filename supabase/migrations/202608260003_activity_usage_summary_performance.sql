-- Replace large raw-sample downloads in the employee activity drawer with
-- scoped database aggregation. The client receives only summary rows.

create or replace function public.activity_employee_usage_summary(
  p_employee_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_today_start timestamptz
)
returns table (
  category text,
  primary_label text,
  secondary_label text,
  sample_count bigint,
  duration_seconds bigint,
  last_seen_at timestamptz,
  keyboard_event_count bigint,
  mouse_event_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_start_at > p_end_at then
    raise exception 'Invalid activity summary range';
  end if;
  if not (
    (p_employee_id = auth.uid() and public.has_permission('activity.view_self'))
    or public.has_permission('activity.view_all')
    or public.is_owner(auth.uid())
    or (public.has_permission('activity.view_team') and public.is_team_supervisor_for(p_employee_id))
  ) then
    raise exception 'Activity access required';
  end if;

  return query
  select 'application'::text, sample.active_application, null::text,
    count(*)::bigint, 0::bigint, max(sample.captured_at), 0::bigint, 0::bigint
  from public.activity_samples sample
  where sample.employee_id = p_employee_id
    and sample.captured_at between p_start_at and p_end_at
    and sample.active_application is not null
  group by sample.active_application
  union all
  select 'website'::text, sample.domain, null::text,
    count(*)::bigint, coalesce(sum(sample.duration_seconds), 0)::bigint, max(sample.captured_at), 0::bigint, 0::bigint
  from public.website_activity_samples sample
  where sample.employee_id = p_employee_id and sample.captured_at between p_start_at and p_end_at
  group by sample.domain
  union all
  select 'coding'::text, sample.ide_name, sample.project_name,
    count(*)::bigint, coalesce(sum(sample.duration_seconds), 0)::bigint, max(sample.captured_at), 0::bigint, 0::bigint
  from public.coding_activity_samples sample
  where sample.employee_id = p_employee_id and sample.captured_at between p_start_at and p_end_at
  group by sample.ide_name, sample.project_name
  union all
  select 'input'::text, null::text, null::text,
    count(*)::bigint, 0::bigint, max(sample.captured_at),
    coalesce(sum(sample.keyboard_event_count), 0)::bigint,
    coalesce(sum(sample.mouse_event_count), 0)::bigint
  from public.activity_samples sample
  where sample.employee_id = p_employee_id
    and sample.captured_at between greatest(p_start_at, p_today_start) and p_end_at;
end
$$;

comment on function public.activity_employee_usage_summary(uuid,timestamptz,timestamptz,timestamptz) is
  'Returns bounded aggregate activity usage for an authorized employee drawer; raw samples remain server-side.';

revoke all on function public.activity_employee_usage_summary(uuid,timestamptz,timestamptz,timestamptz) from public;
grant execute on function public.activity_employee_usage_summary(uuid,timestamptz,timestamptz,timestamptz) to authenticated;

notify pgrst, 'reload schema';
 