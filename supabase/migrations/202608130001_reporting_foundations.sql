-- Filtered daily-report summaries. RLS remains authoritative because this
-- function runs with the caller's privileges (security invoker).

create or replace function public.daily_report_summary(
  p_employee_ids uuid[] default null,
  p_task_id uuid default null,
  p_status public.review_state default null,
  p_from date default null,
  p_to date default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'totalReports', count(*),
    'totalHours', coalesce(sum(report.hours), 0),
    'submitted', count(*) filter (where report.status = 'Submitted'),
    'approved', count(*) filter (where report.status = 'Approved'),
    'needsUpdate', count(*) filter (where report.status = 'Needs Update'),
    'rejected', count(*) filter (where report.status = 'Rejected')
  )
  from public.daily_reports report
  where (p_employee_ids is null or report.employee_id = any(p_employee_ids))
    and (p_task_id is null or report.task_id = p_task_id)
    and (p_status is null or report.status = p_status)
    and (p_from is null or report.report_date >= p_from)
    and (p_to is null or report.report_date <= p_to);
$$;

revoke all on function public.daily_report_summary(uuid[],uuid,public.review_state,date,date) from public;
grant execute on function public.daily_report_summary(uuid[],uuid,public.review_state,date,date) to authenticated;
