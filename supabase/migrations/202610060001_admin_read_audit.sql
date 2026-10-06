-- Admin read-access auditing + an owner-facing admin-activity view.
--
-- The system already logs what admins CHANGE (activity_audit_logs for policy,
-- device, screenshot and session actions; rbac_audit_log for role, user and
-- permission changes). What it does not record is what admins VIEW -- e.g. an
-- admin opening another employee's screenshots or activity detail. These two
-- functions close that gap and give the owner one query for "what have my
-- admins been doing to or looking at other people".

-- 1. Record a read of another employee's sensitive data. Self-views are skipped
--    (they are noise); cross-employee reads require a real view entitlement, so
--    this cannot be used to fabricate audit noise. Writes to activity_audit_logs.
create or replace function public.activity_log_read_access(
  p_employee_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  audit_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_employee_id is null then raise exception 'A subject employee is required'; end if;
  if char_length(btrim(coalesce(p_action, ''))) not between 2 and 120
     or char_length(btrim(coalesce(p_entity_type, ''))) not between 2 and 80 then
    raise exception 'Invalid audit event';
  end if;
  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object'
     or pg_column_size(coalesce(p_metadata, '{}'::jsonb)) > 4096
     or coalesce(p_metadata, '{}'::jsonb) ?| array[
       'token','accessToken','serviceRoleKey','deviceIdentifier',
       'deviceIdentifierHash','typedText','clipboard','screenshot',
       'keystrokes','keyNames','keyCodes','mouseCoordinates'
     ] then
    raise exception 'Unsafe audit metadata';
  end if;

  -- An employee viewing their own data is not an oversight event; skip quietly.
  if p_employee_id = auth.uid() then
    return null;
  end if;

  -- Only record reads the caller is actually entitled to perform.
  if not (
    public.is_owner(auth.uid())
    or public.has_permission('activity.view_all')
    or public.has_permission('activity.policies.manage')
    or (public.has_permission('activity.view_team') and public.is_team_supervisor_for(p_employee_id))
  ) then
    raise exception 'Read audit scope denied';
  end if;

  insert into public.activity_audit_logs(
    actor_user_id, employee_id, action, entity_type, entity_id, metadata
  ) values (
    auth.uid(), p_employee_id, btrim(p_action), btrim(p_entity_type), p_entity_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into audit_id;
  return audit_id;
end $$;
revoke all on function public.activity_log_read_access(uuid,text,text,uuid,jsonb) from public;
grant execute on function public.activity_log_read_access(uuid,text,text,uuid,jsonb) to authenticated;

comment on function public.activity_log_read_access(uuid,text,text,uuid,jsonb) is
  'Records that the current user viewed another employee''s activity data. Owner/admin oversight signal; self-views are ignored.';

-- 2. Owner-facing admin-activity feed: audit rows where one person acted on or
--    viewed another (actor is distinct from subject), newest first. Visible only
--    to owners and workforce/policy administrators.
create or replace function public.activity_admin_audit(
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  actor_user_id uuid,
  employee_id uuid,
  action text,
  entity_type text,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz
)
language sql security definer set search_path = public stable as $$
  select a.id, a.actor_user_id, a.employee_id, a.action, a.entity_type,
         a.entity_id, a.metadata, a.created_at
  from public.activity_audit_logs a
  where (
      public.is_owner(auth.uid())
      or public.has_permission('activity.view_all')
      or public.has_permission('activity.policies.manage')
    )
    and a.actor_user_id is not null
    and a.actor_user_id is distinct from a.employee_id
  order by a.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200))
  offset greatest(0, coalesce(p_offset, 0));
$$;
revoke all on function public.activity_admin_audit(integer,integer) from public, authenticated;
grant execute on function public.activity_admin_audit(integer,integer) to authenticated;

comment on function public.activity_admin_audit(integer,integer) is
  'Owner/admin oversight feed: activity audit entries where an administrator acted on or viewed another employee.';
