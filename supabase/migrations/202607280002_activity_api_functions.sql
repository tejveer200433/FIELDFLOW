-- FieldFlow activity API support functions.
--
-- Strictly additive: these functions operate only on the monitoring tables
-- introduced by 202607280001_employee_activity_tracking.sql. They provide
-- server-time, transactional state changes for the Bearer-authenticated API.

create or replace function public.activity_write_audit_log(
  p_employee_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  audit_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if char_length(btrim(coalesce(p_action, ''))) not between 2 and 120
     or char_length(btrim(coalesce(p_entity_type, ''))) not between 2 and 80 then
    raise exception 'Invalid audit event';
  end if;
  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object'
     or pg_column_size(coalesce(p_metadata, '{}'::jsonb)) > 16384
     or coalesce(p_metadata, '{}'::jsonb) ?| array[
       'token','accessToken','serviceRoleKey','deviceIdentifier',
       'deviceIdentifierHash','typedText','clipboard','screenshot',
       'keystrokes','keyNames','keyCodes','mouseCoordinates'
     ] then
    raise exception 'Unsafe audit metadata';
  end if;
  if p_employee_id is null then
    if not (
      public.has_permission('activity.policies.manage')
      or public.is_owner(auth.uid())
    ) then raise exception 'Audit scope denied'; end if;
  elsif p_employee_id <> auth.uid() and not (
    public.has_permission('activity.policies.manage')
    or public.is_owner(auth.uid())
  ) then
    raise exception 'Audit scope denied';
  end if;

  insert into public.activity_audit_logs(
    actor_user_id, employee_id, action, entity_type, entity_id, metadata
  ) values (
    auth.uid(), p_employee_id, btrim(p_action), btrim(p_entity_type),
    p_entity_id, coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into audit_id;
  return audit_id;
end
$$;

create or replace function public.activity_register_device(
  p_device_name text,
  p_platform text,
  p_operating_system_version text,
  p_agent_version text,
  p_device_identifier_hash text
)
returns public.employee_devices
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_device public.employee_devices;
  created_device public.employee_devices;
begin
  if not public.has_permission('activity.view_self') then
    raise exception 'Activity self access required';
  end if;
  if char_length(btrim(coalesce(p_device_name, ''))) not between 2 and 160
     or p_platform not in ('windows','macos','linux','other')
     or char_length(coalesce(p_agent_version, '')) not between 1 and 80
     or p_device_identifier_hash !~ '^[A-Fa-f0-9]{64,128}$' then
    raise exception 'Invalid device registration';
  end if;

  select device.* into existing_device
  from public.employee_devices device
  where device.device_identifier_hash = p_device_identifier_hash
  for update;

  if found then
    if existing_device.employee_id <> auth.uid()
       or existing_device.status = 'revoked' then
      raise exception 'Device registration unavailable';
    end if;
    return existing_device;
  end if;

  insert into public.employee_devices(
    employee_id, device_name, platform, operating_system_version,
    agent_version, device_identifier_hash, status
  ) values (
    auth.uid(), btrim(p_device_name), p_platform,
    nullif(btrim(coalesce(p_operating_system_version, '')), ''),
    btrim(p_agent_version), lower(p_device_identifier_hash), 'pending'
  )
  returning * into created_device;

  perform public.activity_write_audit_log(
    auth.uid(), 'device.registered', 'employee_device', created_device.id,
    jsonb_build_object('platform', created_device.platform, 'status', created_device.status)
  );
  return created_device;
end
$$;

create or replace function public.activity_update_device(
  p_device_id uuid,
  p_action text,
  p_agent_version text default null
)
returns public.employee_devices
language plpgsql
security definer
set search_path = public
as $$
declare
  device public.employee_devices;
  is_admin boolean;
begin
  is_admin := public.has_permission('activity.policies.manage') or public.is_owner(auth.uid());
  select item.* into device
  from public.employee_devices item
  where item.id = p_device_id
  for update;
  if not found then raise exception 'Device not found'; end if;
  if device.employee_id <> auth.uid() and not is_admin then raise exception 'Device access denied'; end if;
  if p_action not in ('revoke','reactivate','update-agent') then raise exception 'Invalid device action'; end if;
  if p_action = 'reactivate' and not is_admin then raise exception 'Device reactivation requires monitoring administration'; end if;

  if p_action = 'revoke' then
    update public.employee_devices
    set status='revoked', revoked_at=now()
    where id=device.id returning * into device;
  elsif p_action = 'reactivate' then
    update public.employee_devices
    set status='active', revoked_at=null
    where id=device.id returning * into device;
  else
    if char_length(coalesce(p_agent_version, '')) not between 1 and 80 then
      raise exception 'Invalid agent version';
    end if;
    update public.employee_devices
    set agent_version=btrim(p_agent_version)
    where id=device.id returning * into device;
  end if;

  perform public.activity_write_audit_log(
    device.employee_id, 'device.' || replace(p_action, '-', '_'),
    'employee_device', device.id, jsonb_build_object('status', device.status)
  );
  return device;
end
$$;

create or replace function public.activity_start_session(
  p_device_id uuid,
  p_project_id uuid default null,
  p_task_id uuid default null,
  p_start_source text default 'agent'
)
returns public.tracking_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  device public.employee_devices;
  policy public.monitoring_policies;
  created_session public.tracking_sessions;
begin
  if not public.has_permission('activity.view_self') then raise exception 'Activity self access required'; end if;
  if p_start_source not in ('agent','web','manual','api') then raise exception 'Invalid session source'; end if;

  select item.* into device from public.employee_devices item
  where item.id=p_device_id and item.employee_id=auth.uid() for update;
  if not found then raise exception 'Device not found'; end if;
  if device.status <> 'active' then raise exception 'Device is not active'; end if;

  select item.* into policy from public.monitoring_policies item
  where item.is_active;
  if not found then raise exception 'No active monitoring policy'; end if;
  if not policy.tracking_enabled then raise exception 'Activity tracking is disabled'; end if;
  if policy.require_acknowledgement and not exists (
    select 1 from public.monitoring_policy_acknowledgements acknowledgement
    where acknowledgement.employee_id=auth.uid()
      and acknowledgement.policy_id=policy.id
      and acknowledgement.policy_version=policy.policy_version
  ) then raise exception 'Monitoring policy acknowledgement required'; end if;

  if exists (
    select 1 from public.tracking_sessions session
    where session.employee_id=auth.uid() and session.status='active' and session.ended_at is null
  ) then raise exception 'An active tracking session already exists'; end if;

  if p_project_id is not null and not exists (
    select 1
    from public.project_modules module
    join public.work_assignments assignment on assignment.module_id=module.id
    where module.project_id=p_project_id and assignment.employee_id=auth.uid()
  ) then raise exception 'Project is not assigned to this employee'; end if;

  if p_task_id is not null and not exists (
    select 1 from public.tasks task
    where task.id=p_task_id and task.employee_id=auth.uid()
  ) then raise exception 'Task is not assigned to this employee'; end if;

  insert into public.tracking_sessions(
    employee_id, device_id, project_id, task_id, status, start_source
  ) values (
    auth.uid(), device.id, p_project_id, p_task_id, 'active', p_start_source
  )
  returning * into created_session;

  perform public.activity_write_audit_log(
    auth.uid(), 'session.started', 'tracking_session', created_session.id,
    jsonb_build_object('deviceId', device.id, 'projectId', p_project_id, 'taskId', p_task_id)
  );
  return created_session;
end
$$;

create or replace function public.activity_stop_session(
  p_session_id uuid,
  p_end_source text default 'agent'
)
returns public.tracking_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  stopped_session public.tracking_sessions;
begin
  if not public.has_permission('activity.view_self') then raise exception 'Activity self access required'; end if;
  if p_end_source not in ('agent','web','manual','api','timeout') then raise exception 'Invalid session source'; end if;
  update public.tracking_sessions
  set status='ended', ended_at=now(), end_source=p_end_source
  where id=p_session_id and employee_id=auth.uid()
    and status='active' and ended_at is null
  returning * into stopped_session;
  if stopped_session.id is null then raise exception 'Active tracking session not found'; end if;

  perform public.activity_write_audit_log(
    auth.uid(), 'session.stopped', 'tracking_session', stopped_session.id,
    jsonb_build_object(
      'source', p_end_source,
      'durationSeconds', greatest(0, floor(extract(epoch from (stopped_session.ended_at-stopped_session.started_at)))::integer)
    )
  );
  return stopped_session;
end
$$;

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
    where policy.id=p_policy_id and policy.policy_version=p_policy_version and policy.is_active
  ) then raise exception 'Active policy version not found'; end if;
  if exists (
    select 1 from public.monitoring_policy_acknowledgements item
    where item.employee_id=auth.uid() and item.policy_id=p_policy_id
      and item.policy_version=p_policy_version
  ) then raise exception 'Policy version already acknowledged'; end if;

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

create or replace function public.activity_record_heartbeat(
  p_device_id uuid,
  p_tracking_session_id uuid,
  p_agent_version text,
  p_online_status text,
  p_battery_level smallint
)
returns public.agent_heartbeats
language plpgsql
security definer
set search_path = public
as $$
declare
  device public.employee_devices;
  policy public.monitoring_policies;
  heartbeat public.agent_heartbeats;
  minimum_interval integer;
begin
  if not public.has_permission('activity.view_self') then raise exception 'Activity self access required'; end if;
  if char_length(coalesce(p_agent_version,'')) not between 1 and 80
     or p_online_status not in ('online','idle','offline','error')
     or (p_battery_level is not null and p_battery_level not between 0 and 100) then
    raise exception 'Invalid heartbeat';
  end if;
  select item.* into device from public.employee_devices item
  where item.id=p_device_id and item.employee_id=auth.uid() for update;
  if not found then raise exception 'Device not found'; end if;
  if device.status='revoked' then raise exception 'Device is revoked'; end if;
  if p_tracking_session_id is not null and not exists (
    select 1 from public.tracking_sessions session
    where session.id=p_tracking_session_id and session.employee_id=auth.uid()
      and session.device_id=device.id
  ) then raise exception 'Tracking session does not match device'; end if;

  select item.* into policy from public.monitoring_policies item where item.is_active;
  minimum_interval := greatest(5, coalesce(policy.heartbeat_interval_seconds,60)/2);
  if exists (
    select 1 from public.agent_heartbeats item
    where item.device_id=device.id
      and item.recorded_at > now() - make_interval(secs => minimum_interval)
  ) then raise exception 'Heartbeat sent too frequently'; end if;

  insert into public.agent_heartbeats(
    employee_id, device_id, tracking_session_id, agent_version,
    online_status, battery_level
  ) values (
    auth.uid(), device.id, p_tracking_session_id, btrim(p_agent_version),
    p_online_status, p_battery_level
  )
  returning * into heartbeat;
  update public.employee_devices
  set last_seen_at=heartbeat.recorded_at, agent_version=btrim(p_agent_version)
  where id=device.id;
  return heartbeat;
end
$$;

create or replace function public.activity_activate_policy(
  p_tracking_enabled boolean,
  p_idle_threshold_seconds integer,
  p_sample_interval_seconds integer,
  p_upload_interval_seconds integer,
  p_offline_sync_limit_seconds integer,
  p_heartbeat_interval_seconds integer,
  p_collect_application_names boolean,
  p_require_acknowledgement boolean,
  p_retention_days integer
)
returns public.monitoring_policies
language plpgsql
security definer
set search_path = public
as $$
declare
  next_version integer;
  created_policy public.monitoring_policies;
begin
  if not (
    public.has_permission('activity.policies.manage')
    or public.is_owner(auth.uid())
  ) then raise exception 'Monitoring policy administration required'; end if;
  if p_idle_threshold_seconds not between 30 and 86400
     or p_sample_interval_seconds not between 10 and 3600
     or p_upload_interval_seconds not between 30 and 86400
     or p_offline_sync_limit_seconds not between 0 and 2592000
     or p_heartbeat_interval_seconds not between 15 and 3600
     or p_retention_days not between 1 and 3650 then
    raise exception 'Invalid monitoring policy settings';
  end if;

  perform pg_advisory_xact_lock(hashtext('fieldflow.monitoring_policy'));
  select coalesce(max(policy_version),0)+1 into next_version
  from public.monitoring_policies;
  update public.monitoring_policies set is_active=false where is_active;
  insert into public.monitoring_policies(
    policy_version, is_active, tracking_enabled, idle_threshold_seconds,
    sample_interval_seconds, upload_interval_seconds,
    offline_sync_limit_seconds, heartbeat_interval_seconds,
    collect_application_names, require_acknowledgement, retention_days,
    created_by
  ) values (
    next_version, true, p_tracking_enabled, p_idle_threshold_seconds,
    p_sample_interval_seconds, p_upload_interval_seconds,
    p_offline_sync_limit_seconds, p_heartbeat_interval_seconds,
    p_collect_application_names, p_require_acknowledgement, p_retention_days,
    auth.uid()
  )
  returning * into created_policy;
  perform public.activity_write_audit_log(
    null, 'policy.activated', 'monitoring_policy', created_policy.id,
    jsonb_build_object(
      'policyVersion', created_policy.policy_version,
      'trackingEnabled', created_policy.tracking_enabled
    )
  );
  return created_policy;
end
$$;

create or replace function public.activity_get_employee_profiles(
  p_user_ids uuid[] default null
)
returns table (
  employee_id uuid,
  full_name text,
  email text,
  department text
)
language sql
stable
security definer
set search_path = public
as $$
  select profile.id, profile.full_name, profile.email, profile.department
  from public.profiles profile
  where (p_user_ids is null or profile.id = any(p_user_ids))
    and profile.active
    and profile.approval_status::text = 'approved'
    and (
      (
        profile.id = auth.uid()
        and public.has_permission('activity.view_self')
      )
      or public.has_permission('activity.view_all')
      or public.is_owner(auth.uid())
      or (
        public.has_permission('activity.view_team')
        and public.is_team_supervisor_for(profile.id)
      )
    )
  order by profile.full_name, profile.id
$$;

revoke all on function public.activity_write_audit_log(uuid,text,text,uuid,jsonb) from public;
revoke all on function public.activity_register_device(text,text,text,text,text) from public;
revoke all on function public.activity_update_device(uuid,text,text) from public;
revoke all on function public.activity_start_session(uuid,uuid,uuid,text) from public;
revoke all on function public.activity_stop_session(uuid,text) from public;
revoke all on function public.activity_acknowledge_policy(uuid,integer,text) from public;
revoke all on function public.activity_record_heartbeat(uuid,uuid,text,text,smallint) from public;
revoke all on function public.activity_activate_policy(boolean,integer,integer,integer,integer,integer,boolean,boolean,integer) from public;
revoke all on function public.activity_get_employee_profiles(uuid[]) from public;

grant execute on function public.activity_write_audit_log(uuid,text,text,uuid,jsonb) to authenticated;
grant execute on function public.activity_register_device(text,text,text,text,text) to authenticated;
grant execute on function public.activity_update_device(uuid,text,text) to authenticated;
grant execute on function public.activity_start_session(uuid,uuid,uuid,text) to authenticated;
grant execute on function public.activity_stop_session(uuid,text) to authenticated;
grant execute on function public.activity_acknowledge_policy(uuid,integer,text) to authenticated;
grant execute on function public.activity_record_heartbeat(uuid,uuid,text,text,smallint) to authenticated;
grant execute on function public.activity_activate_policy(boolean,integer,integer,integer,integer,integer,boolean,boolean,integer) to authenticated;
grant execute on function public.activity_get_employee_profiles(uuid[]) to authenticated;

notify pgrst, 'reload schema';
