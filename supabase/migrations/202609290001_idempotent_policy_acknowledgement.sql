-- Make monitoring-policy acknowledgement idempotent.
--
-- Previously, acknowledging a policy version that the employee had already
-- acknowledged raised 'Policy version already acknowledged'. If the agent
-- re-displayed the consent screen for a policy the employee had in fact already
-- accepted -- which can happen after an agent restart, reinstall, or a stale
-- policy read -- clicking "Accept" then failed and the agent got stuck on the
-- consent screen with no way forward.
--
-- This version returns the existing acknowledgement instead of failing, so a
-- repeat acknowledgement is a harmless no-op and the agent always proceeds.
-- Everything else (permission check, hash validation, active-policy check,
-- audit logging on first acknowledgement) is unchanged.

create or replace function public.activity_acknowledge_policy(
  p_policy_id uuid,
  p_policy_version integer,
  p_acknowledgement_text_hash text
)
returns public.monitoring_policy_acknowledgements
language plpgsql
security definer
set search_path = public
as $$
declare
  acknowledgement public.monitoring_policy_acknowledgements;
begin
  if not public.has_permission('activity.view_self') then raise exception 'Activity self access required'; end if;
  if p_acknowledgement_text_hash !~ '^[A-Fa-f0-9]{64,128}$' then raise exception 'Invalid acknowledgement hash'; end if;
  if not exists (
    select 1 from public.monitoring_policies policy
    where policy.id = p_policy_id and policy.policy_version = p_policy_version and policy.is_active
  ) then raise exception 'Active policy version not found'; end if;

  -- Idempotent: if already acknowledged, return the existing record so the
  -- agent can proceed instead of getting stuck on the consent screen.
  select * into acknowledgement
  from public.monitoring_policy_acknowledgements item
  where item.employee_id = auth.uid()
    and item.policy_id = p_policy_id
    and item.policy_version = p_policy_version;
  if found then
    return acknowledgement;
  end if;

  insert into public.monitoring_policy_acknowledgements(
    policy_id, employee_id, policy_version, acknowledgement_text_hash
  ) values (
    p_policy_id, auth.uid(), p_policy_version, lower(p_acknowledgement_text_hash)
  )
  returning * into acknowledgement;
  perform public.activity_write_audit_log(
    auth.uid(), 'policy.acknowledged', 'monitoring_policy', p_policy_id,
    jsonb_build_object('policyVersion', p_policy_version)
  );
  return acknowledgement;
end
$$;

revoke all on function public.activity_acknowledge_policy(uuid,integer,text) from public;
grant execute on function public.activity_acknowledge_policy(uuid,integer,text) to authenticated;
