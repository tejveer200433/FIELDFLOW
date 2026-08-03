-- Close abandoned activity sessions from trusted server-side scheduling.
-- Run public.activity_close_stale_sessions() once per minute using Supabase
-- Cron. It is intentionally unavailable to authenticated browser clients.

create or replace function public.activity_close_stale_sessions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  closed_count integer := 0;
begin
  with stale as (
    select
      session.id,
      session.employee_id,
      greatest(
        session.started_at,
        coalesce(max(heartbeat.recorded_at), session.started_at)
      ) as timeout_at
    from public.tracking_sessions session
    join public.monitoring_policies policy
      on policy.id = session.monitoring_policy_id
     and policy.policy_version = session.monitoring_policy_version
    left join public.agent_heartbeats heartbeat
      on heartbeat.tracking_session_id = session.id
     and heartbeat.employee_id = session.employee_id
     and heartbeat.device_id = session.device_id
    where session.status = 'active'
      and session.ended_at is null
    group by
      session.id,
      session.employee_id,
      session.started_at,
      policy.heartbeat_interval_seconds
    having coalesce(max(heartbeat.recorded_at), session.started_at)
      < now() - make_interval(
          secs => greatest(policy.heartbeat_interval_seconds * 3, 180)
        )
  ),
  closed as (
    update public.tracking_sessions session
    set status = 'ended',
        ended_at = stale.timeout_at,
        end_source = 'timeout',
        updated_at = now()
    from stale
    where session.id = stale.id
      and session.status = 'active'
      and session.ended_at is null
    returning session.id, session.employee_id, session.ended_at
  ),
  audited as (
    insert into public.activity_audit_logs(
      actor_user_id, employee_id, action, entity_type, entity_id, metadata
    )
    select
      null,
      closed.employee_id,
      'session.timed_out',
      'tracking_session',
      closed.id,
      jsonb_build_object('endedAt', closed.ended_at)
    from closed
    returning id
  )
  select count(*)::integer into closed_count from audited;

  return closed_count;
end
$$;

revoke all on function public.activity_close_stale_sessions() from public;
revoke all on function public.activity_close_stale_sessions() from authenticated;
grant execute on function public.activity_close_stale_sessions() to service_role;

comment on function public.activity_close_stale_sessions() is
  'Trusted scheduled maintenance: closes active sessions after three missed heartbeats (minimum three minutes) and writes an append-only audit event.';

notify pgrst, 'reload schema';
