-- Per-device screenshot controls and secure administrative screenshot deletion.
-- Additive only: devices without an override continue to inherit the active
-- organisation policy, preserving existing behaviour after this migration.

create table public.device_screenshot_settings (
  device_id uuid primary key,
  employee_id uuid not null,
  capture_enabled boolean not null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (device_id, employee_id)
    references public.employee_devices(id, employee_id) on delete cascade
);

comment on table public.device_screenshot_settings is
  'Optional per-device screenshot override. No row means inherit the active monitoring policy.';

create trigger device_screenshot_settings_set_updated_at
before update on public.device_screenshot_settings
for each row execute function public.set_rbac_updated_at();

alter table public.device_screenshot_settings enable row level security;

create policy device_screenshot_settings_read
on public.device_screenshot_settings
for select
to authenticated
using (
  employee_id = auth.uid()
  or public.has_permission('activity.view_all')
  or public.has_permission('activity.policies.manage')
  or public.is_owner(auth.uid())
  or (
    public.has_permission('activity.view_team')
    and public.is_team_supervisor_for(employee_id)
  )
);

revoke insert, update, delete on public.device_screenshot_settings from authenticated;
grant select on public.device_screenshot_settings to authenticated;

create or replace function public.activity_device_screenshots_enabled(
  p_device_id uuid,
  p_employee_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select setting.capture_enabled
    from public.device_screenshot_settings setting
    where setting.device_id = p_device_id
      and setting.employee_id = p_employee_id
  ), true)
$$;

revoke all on function public.activity_device_screenshots_enabled(uuid,uuid) from public;
revoke all on function public.activity_device_screenshots_enabled(uuid,uuid) from authenticated;

-- Tighten the existing upload policy as well as the registration RPC. This
-- closes the retry window where a path was registered just before an admin
-- disabled capture but its JPEG had not reached Storage yet.
drop policy if exists activity_screenshots_upload on storage.objects;
create policy activity_screenshots_upload
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'activity-screenshots'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1
    from public.activity_screenshots shot
    where shot.storage_path = name
      and shot.employee_id = auth.uid()
      and coalesce((
        select setting.capture_enabled
        from public.device_screenshot_settings setting
        where setting.device_id = shot.device_id
          and setting.employee_id = shot.employee_id
      ), true)
  )
);

create or replace function public.activity_set_device_screenshot_capture(
  p_device_id uuid,
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_device public.employee_devices;
begin
  if not (
    public.has_permission('activity.policies.manage')
    or public.is_owner(auth.uid())
  ) then raise exception 'Monitoring policy administration required'; end if;

  select device.* into target_device
  from public.employee_devices device
  where device.id = p_device_id;
  if not found then raise exception 'Device not found'; end if;

  insert into public.device_screenshot_settings(
    device_id, employee_id, capture_enabled, updated_by
  ) values (
    target_device.id, target_device.employee_id, p_enabled, auth.uid()
  )
  on conflict (device_id) do update set
    capture_enabled = excluded.capture_enabled,
    updated_by = excluded.updated_by,
    updated_at = now();

  perform public.activity_write_audit_log(
    target_device.employee_id,
    'device.screenshot_capture.updated',
    'employee_device',
    target_device.id,
    jsonb_build_object('captureEnabled', p_enabled)
  );

  return jsonb_build_object(
    'deviceId', target_device.id,
    'employeeId', target_device.employee_id,
    'screenshotCaptureEnabled', p_enabled
  );
end
$$;

revoke all on function public.activity_set_device_screenshot_capture(uuid,boolean) from public;
grant execute on function public.activity_set_device_screenshot_capture(uuid,boolean) to authenticated;

-- Policy managers need to resolve the exact private objects selected for
-- deletion. This policy does not grant mutation rights on screenshot metadata.
create policy activity_screenshots_policy_admin_read
on public.activity_screenshots
for select
to authenticated
using (
  public.has_permission('activity.policies.manage')
  or public.is_owner(auth.uid())
);

-- Storage removal remains protected independently from the API route so a
-- direct Supabase request cannot bypass dynamic RBAC.
create policy activity_screenshots_admin_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'activity-screenshots'
  and (
    public.has_permission('activity.policies.manage')
    or public.is_owner(auth.uid())
  )
  and exists (
    select 1
    from public.activity_screenshots shot
    where shot.storage_path = name
  )
);

create or replace function public.activity_delete_screenshot_records(p_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_ids uuid[];
  deleted_count integer;
begin
  if not (
    public.has_permission('activity.policies.manage')
    or public.is_owner(auth.uid())
  ) then raise exception 'Monitoring policy administration required'; end if;

  select coalesce(array_agg(distinct screenshot_id), '{}')
  into normalized_ids
  from unnest(coalesce(p_ids, '{}')) screenshot_id;

  if coalesce(array_length(normalized_ids, 1), 0) not between 1 and 100 then
    raise exception 'Between 1 and 100 screenshot IDs are required';
  end if;

  delete from public.activity_screenshots screenshot
  where screenshot.id = any(normalized_ids);
  get diagnostics deleted_count = row_count;

  perform public.activity_write_audit_log(
    null,
    'screenshot.deleted',
    'activity_screenshot',
    null,
    jsonb_build_object('count', deleted_count)
  );

  return jsonb_build_object('deletedCount', deleted_count);
end
$$;

revoke all on function public.activity_delete_screenshot_records(uuid[]) from public;
grant execute on function public.activity_delete_screenshot_records(uuid[]) to authenticated;

-- Re-define screenshot registration so device disablement is enforced at the
-- trusted database boundary, even if an old or modified agent keeps trying.
create or replace function public.activity_register_screenshot(
  p_tracking_session_id uuid,
  p_local_sample_id text,
  p_captured_at timestamptz,
  p_active_application text,
  p_byte_size integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  tracking_session public.tracking_sessions;
  policy public.monitoring_policies;
  normalized_app text;
  normalized_local_id text;
  storage_path text;
  screenshot_row public.activity_screenshots;
begin
  if auth.uid() is null or not public.has_permission('activity.view_self') then
    raise exception 'Activity self access required';
  end if;

  normalized_local_id := btrim(coalesce(p_local_sample_id, ''));
  if char_length(normalized_local_id) not between 1 and 120
     or normalized_local_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$' then
    raise exception 'Invalid local sample id';
  end if;
  if p_byte_size not between 1 and 8388608 then
    raise exception 'Invalid screenshot size';
  end if;

  select item.* into screenshot_row from public.activity_screenshots item
    where item.employee_id = auth.uid() and item.local_sample_id = normalized_local_id;
  if found then
    return jsonb_build_object(
      'id', screenshot_row.id,
      'storagePath', screenshot_row.storage_path,
      'capturedAt', screenshot_row.captured_at
    );
  end if;

  select item.* into tracking_session from public.tracking_sessions item
    where item.id = p_tracking_session_id and item.employee_id = auth.uid();
  if not found then raise exception 'Tracking session not found'; end if;
  if tracking_session.status <> 'active' or tracking_session.ended_at is not null then
    raise exception 'Tracking session is not active';
  end if;

  select item.* into policy from public.monitoring_policies item
    where item.id = tracking_session.monitoring_policy_id
      and item.policy_version = tracking_session.monitoring_policy_version;
  if not found then raise exception 'Session monitoring policy not found'; end if;
  if not policy.tracking_enabled then raise exception 'Activity tracking is disabled'; end if;
  if not policy.collect_screenshots then raise exception 'Screenshot collection is disabled'; end if;
  if not public.activity_device_screenshots_enabled(tracking_session.device_id, auth.uid()) then
    raise exception 'Screenshot collection is disabled for this device';
  end if;

  if p_captured_at > now() + interval '5 minutes' then
    raise exception 'Screenshot timestamp is in the future';
  elsif p_captured_at < tracking_session.started_at then
    raise exception 'Screenshot predates session start';
  elsif p_captured_at < now() - make_interval(secs => policy.offline_sync_limit_seconds) then
    raise exception 'Screenshot timestamp has expired for offline sync';
  end if;

  normalized_app := lower(btrim(coalesce(p_active_application, '')));
  if normalized_app <> '' and normalized_app = any(policy.screenshot_excluded_apps) then
    raise exception 'Screenshot application is excluded by policy';
  end if;

  storage_path := auth.uid()::text || '/' || tracking_session.id::text || '/'
    || to_char(now(), 'YYYYMMDDHH24MISS') || '-'
    || replace(gen_random_uuid()::text, '-', '') || '.jpg';

  insert into public.activity_screenshots(
    local_sample_id, employee_id, device_id, tracking_session_id,
    captured_at, storage_path, active_application, byte_size
  ) values (
    normalized_local_id, auth.uid(), tracking_session.device_id, tracking_session.id,
    p_captured_at, storage_path, nullif(normalized_app, ''), p_byte_size
  )
  returning * into screenshot_row;

  return jsonb_build_object(
    'id', screenshot_row.id,
    'storagePath', screenshot_row.storage_path,
    'capturedAt', screenshot_row.captured_at
  );
end
$$;

revoke all on function public.activity_register_screenshot(uuid,text,timestamptz,text,integer) from public;
grant execute on function public.activity_register_screenshot(uuid,text,timestamptz,text,integer) to authenticated;
