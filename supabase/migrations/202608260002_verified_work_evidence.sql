-- Verified Work Evidence: task-linked, privacy-preserving delivery evidence.
-- Scores are operational confidence signals, never automated performance decisions.

create table public.task_work_evidence_contexts (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  note text not null check (char_length(btrim(note)) between 1 and 1000),
  created_at timestamptz not null default now(),
  constraint task_work_evidence_context_author check (employee_id = created_by)
);

comment on table public.task_work_evidence_contexts is
  'Append-only employee context for a task work-evidence summary. It must not contain passwords, customer secrets, clipboard data, or screenshots.';

create index task_work_evidence_contexts_task_created_idx
  on public.task_work_evidence_contexts (task_id, created_at desc);

alter table public.task_work_evidence_contexts enable row level security;

create policy task_work_evidence_contexts_read
on public.task_work_evidence_contexts for select to authenticated
using (public.can_access_task(task_id));

create policy task_work_evidence_contexts_insert
on public.task_work_evidence_contexts for insert to authenticated
with check (
  created_by = auth.uid()
  and employee_id = auth.uid()
  and public.is_task_assignee(task_id, auth.uid())
);

revoke all on public.task_work_evidence_contexts from anon, authenticated;
grant select, insert on public.task_work_evidence_contexts to authenticated;

create or replace function public.task_work_evidence_summary(p_task_id uuid)
returns table (
  tracked_seconds bigint,
  session_count bigint,
  heartbeat_count bigint,
  integrity_alert_count bigint,
  context_count bigint,
  latest_evidence_at timestamptz,
  confidence_score smallint,
  confidence_band text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  computed_tracked_seconds bigint := 0;
  computed_session_count bigint := 0;
  computed_heartbeat_count bigint := 0;
  computed_alert_count bigint := 0;
  computed_context_count bigint := 0;
  computed_latest_evidence_at timestamptz := null;
  computed_score integer := 20;
begin
  if not public.can_access_task(p_task_id) then raise exception 'Task not found in your permitted scope'; end if;

  select
    coalesce(sum(greatest(0, extract(epoch from (coalesce(session.ended_at, now()) - session.started_at)))::bigint), 0),
    count(*)::bigint,
    max(coalesce(session.ended_at, session.started_at))
  into computed_tracked_seconds, computed_session_count, computed_latest_evidence_at
  from public.tracking_sessions session
  where session.task_id = p_task_id;

  select count(*)::bigint into computed_heartbeat_count
  from public.agent_heartbeats heartbeat
  join public.tracking_sessions session on session.id = heartbeat.tracking_session_id
  where session.task_id = p_task_id;

  select count(*)::bigint into computed_alert_count
  from public.activity_integrity_events event
  join public.tracking_sessions session on session.id = event.tracking_session_id
  where session.task_id = p_task_id and event.resolved_at is null;

  select count(*)::bigint into computed_context_count
  from public.task_work_evidence_contexts context
  where context.task_id = p_task_id;

  if computed_session_count > 0 then computed_score := 55; end if;
  if computed_tracked_seconds >= 300 then computed_score := computed_score + 15; end if;
  if computed_heartbeat_count > 0 then computed_score := computed_score + 20; end if;
  if computed_context_count > 0 then computed_score := computed_score + 10; end if;
  computed_score := greatest(0, least(100, computed_score - least(60, computed_alert_count * 25)));

  return query select
    computed_tracked_seconds,
    computed_session_count,
    computed_heartbeat_count,
    computed_alert_count,
    computed_context_count,
    computed_latest_evidence_at,
    computed_score::smallint,
    case
      when computed_score >= 80 then 'verified'
      when computed_score >= 55 then 'supported'
      else 'insufficient'
    end;
end
$$;

comment on function public.task_work_evidence_summary(uuid) is
  'Returns a task-level confidence summary without returning raw activity, application, website, screenshot, hardware, or integrity digest data.';

revoke all on function public.task_work_evidence_summary(uuid) from public;
grant execute on function public.task_work_evidence_summary(uuid) to authenticated;

notify pgrst, 'reload schema';
