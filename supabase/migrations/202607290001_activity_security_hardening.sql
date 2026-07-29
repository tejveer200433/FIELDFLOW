-- FIELD-FLOW activity write-path hardening.
--
-- Additive follow-up to the two applied activity migrations. This migration
-- does not edit existing migrations or any non-activity database object.
-- Authenticated clients retain scoped SELECT access through RLS, while all
-- activity writes are forced through the existing security-definer functions
-- or the bounded ingestion function introduced here.

create or replace function public.activity_ingest_samples(
  p_device_id uuid,
  p_tracking_session_id uuid,
  p_samples jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  device public.employee_devices;
  tracking_session public.tracking_sessions;
  policy public.monitoring_policies;
  sample jsonb;
  local_sample_id text;
  captured_at timestamptz;
  keyboard_event_count integer;
  mouse_event_count integer;
  idle_seconds integer;
  active_application text;
  screen_locked boolean;
  rejection_reason text;
  inserted_count integer;
  accepted_count integer := 0;
  duplicate_count integer := 0;
  rejected jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or not public.has_permission('activity.view_self') then
    raise exception 'Activity self access required';
  end if;
  if jsonb_typeof(p_samples) <> 'array'
     or jsonb_array_length(p_samples) not between 1 and 100 then
    raise exception 'Invalid activity sample batch';
  end if;

  select item.* into device
  from public.employee_devices item
  where item.id = p_device_id
    and item.employee_id = auth.uid();
  if not found then raise exception 'Device not found'; end if;
  if device.status = 'revoked' then raise exception 'Device is revoked'; end if;
  if device.status <> 'active' then raise exception 'Device is not active'; end if;

  select item.* into tracking_session
  from public.tracking_sessions item
  where item.id = p_tracking_session_id
    and item.employee_id = auth.uid()
    and item.device_id = device.id;
  if not found then raise exception 'Tracking session does not match device'; end if;
  if tracking_session.status <> 'active' or tracking_session.ended_at is not null then
    raise exception 'Active tracking session not found';
  end if;

  select item.* into policy
  from public.monitoring_policies item
  where item.is_active;
  if not found then raise exception 'No active monitoring policy'; end if;
  if not policy.tracking_enabled then raise exception 'Activity tracking is disabled'; end if;
  if policy.require_acknowledgement and not exists (
    select 1
    from public.monitoring_policy_acknowledgements acknowledgement
    where acknowledgement.employee_id = auth.uid()
      and acknowledgement.policy_id = policy.id
      and acknowledgement.policy_version = policy.policy_version
  ) then
    raise exception 'Monitoring policy acknowledgement required';
  end if;

  for sample in select value from jsonb_array_elements(p_samples)
  loop
    rejection_reason := null;
    begin
      if jsonb_typeof(sample) <> 'object'
         or sample::text ~* '"(typedText|text|keys|keyNames|keyCodes|keystrokes|clipboard|clipboardContent|screenshot|screenshots|mouseCoordinates|coordinates|token|accessToken|serviceRoleKey|employeeId|employee_id|managerId|manager_id|deviceIdentifier|deviceIdentifierHash)"[[:space:]]*:' then
        rejection_reason := 'FORBIDDEN_FIELD';
      end if;

      local_sample_id := btrim(coalesce(sample->>'localSampleId', ''));
      if rejection_reason is null and (
        char_length(local_sample_id) not between 1 and 120
        or local_sample_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'
      ) then rejection_reason := 'INVALID_LOCAL_SAMPLE_ID'; end if;

      captured_at := (sample->>'capturedAt')::timestamptz;
      keyboard_event_count := coalesce((sample->>'keyboardEventCount')::integer, 0);
      mouse_event_count := coalesce((sample->>'mouseEventCount')::integer, 0);
      idle_seconds := coalesce((sample->>'idleSeconds')::integer, 0);
      active_application := nullif(btrim(coalesce(sample->>'activeApplication', '')), '');
      screen_locked := coalesce((sample->>'screenLocked')::boolean, false);

      if rejection_reason is null and (
        keyboard_event_count not between 0 and 1000000
        or mouse_event_count not between 0 and 1000000
        or idle_seconds not between 0 and 86400
        or (active_application is not null and char_length(active_application) > 255)
      ) then rejection_reason := 'INVALID_SAMPLE_VALUE'; end if;
      if rejection_reason is null and captured_at > now() + interval '5 minutes' then
        rejection_reason := 'FUTURE_TIMESTAMP';
      elsif rejection_reason is null and captured_at < tracking_session.started_at then
        rejection_reason := 'BEFORE_SESSION_START';
      elsif rejection_reason is null and captured_at < now() - make_interval(secs => policy.offline_sync_limit_seconds) then
        rejection_reason := 'OFFLINE_SYNC_EXPIRED';
      elsif rejection_reason is null and not policy.collect_application_names and active_application is not null then
        rejection_reason := 'APPLICATION_COLLECTION_DISABLED';
      end if;
    exception when others then
      rejection_reason := 'INVALID_SAMPLE_VALUE';
    end;

    if rejection_reason is not null then
      rejected := rejected || jsonb_build_array(jsonb_build_object(
        'localSampleId', nullif(local_sample_id, ''),
        'reason', rejection_reason
      ));
      continue;
    end if;

    insert into public.activity_samples(
      local_sample_id,
      employee_id,
      device_id,
      tracking_session_id,
      captured_at,
      keyboard_event_count,
      mouse_event_count,
      idle_seconds,
      active_application,
      screen_locked
    ) values (
      local_sample_id,
      auth.uid(),
      device.id,
      tracking_session.id,
      captured_at,
      keyboard_event_count,
      mouse_event_count,
      idle_seconds,
      active_application,
      screen_locked
    )
    on conflict (device_id, local_sample_id) do nothing;
    get diagnostics inserted_count = row_count;
    if inserted_count = 1 then
      accepted_count := accepted_count + 1;
    else
      duplicate_count := duplicate_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'acceptedCount', accepted_count,
    'duplicateCount', duplicate_count,
    'rejectedCount', jsonb_array_length(rejected),
    'rejected', rejected,
    'serverTime', now()
  );
end
$$;

revoke all on function public.activity_ingest_samples(uuid,uuid,jsonb) from public;
grant execute on function public.activity_ingest_samples(uuid,uuid,jsonb) to authenticated;

-- Direct activity writes bypass API limits and transactional audit behaviour.
-- Security-definer activity functions remain the sole write path.
revoke insert, update on public.monitoring_policies from authenticated;
revoke insert on public.monitoring_policy_acknowledgements from authenticated;
revoke insert, update on public.employee_devices from authenticated;
revoke insert, update on public.tracking_sessions from authenticated;
revoke insert on public.activity_samples from authenticated;
revoke insert on public.agent_heartbeats from authenticated;

-- Enforce the audit metadata privacy boundary recursively, including nested
-- objects that the original top-level key check did not inspect.
alter table public.activity_audit_logs
  add constraint activity_audit_metadata_has_no_sensitive_keys
  check (
    metadata::text !~* '"(token|accessToken|refreshToken|serviceRoleKey|deviceIdentifier|deviceIdentifierHash|typedText|clipboard|clipboardContent|screenshot|screenshots|keystrokes|keyNames|keyCodes|mouseCoordinates|coordinates)"[[:space:]]*:'
  ) not valid;

alter table public.activity_audit_logs
  validate constraint activity_audit_metadata_has_no_sensitive_keys;

notify pgrst, 'reload schema';
