-- Additive scoped web/application access control, approval, extension health, alerts,
-- and privacy-safe audit events. Existing website blocking tables and policies remain.

insert into public.permissions (key, name, description, group_name) values
  ('activity.web_access.review', 'Review web access requests', 'Review web and application access requests for employees in scope.', 'Activity'),
  ('activity.web_access.manage', 'Manage web access policies', 'Manage scoped web and application restriction policies.', 'Activity')
on conflict (key) do nothing;

create table public.web_access_categories (
  key text primary key check (key ~ '^[a-z][a-z0-9_-]{1,39}$'),
  name text not null check (char_length(name) between 2 and 80),
  domains text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.web_access_categories (key, name, domains) values
  ('social_media', 'Social media', array['instagram.com','snapchat.com','facebook.com','x.com','twitter.com','tiktok.com']),
  ('entertainment', 'Entertainment and video', array['youtube.com','netflix.com','primevideo.com','hotstar.com']),
  ('messaging', 'Messaging', array['web.whatsapp.com','whatsapp.com','telegram.org','web.telegram.org']),
  ('gaming', 'Gaming', array['steampowered.com','epicgames.com','roblox.com','twitch.tv']),
  ('shopping', 'Shopping', array['amazon.com','flipkart.com','ebay.com'])
on conflict (key) do nothing;

create table public.web_access_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  scope_type text not null check (scope_type in ('organisation','team','role','employee','device')),
  scope_id uuid,
  enforcement_enabled boolean not null default true,
  priority integer not null default 100 check (priority between 0 and 10000),
  blocked_categories text[] not null default '{}',
  blocked_domains text[] not null default '{}',
  allowed_domains text[] not null default '{}',
  blocked_applications text[] not null default '{}',
  schedule_timezone text not null default 'UTC',
  schedule_days smallint[] not null default array[0,1,2,3,4,5,6]::smallint[],
  schedule_start time not null default '00:00:00',
  schedule_end time not null default '23:59:59',
  require_managed_extension boolean not null default true,
  enabled boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scope_type = 'organisation' and scope_id is null) or (scope_type <> 'organisation' and scope_id is not null)),
  check (cardinality(schedule_days) between 1 and 7)
);
create index web_access_rules_scope_idx on public.web_access_rules(scope_type, scope_id, enabled, priority desc);

create table public.web_access_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  device_id uuid references public.employee_devices(id) on delete set null,
  resource_type text not null check (resource_type in ('domain','application','category')),
  resource_key text not null check (char_length(resource_key) between 1 and 253),
  reason text not null check (char_length(reason) between 3 and 500),
  project_id uuid references public.projects(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  requested_minutes integer not null default 30 check (requested_minutes between 5 and 10080),
  requested_scope text not null default 'once' check (requested_scope in ('once','shift','project','seven_days','always')),
  status text not null default 'Pending' check (status in ('Pending','Approved','Rejected','Expired','Revoked')),
  granted_minutes integer check (granted_minutes between 5 and 525600),
  approval_scope text check (approval_scope in ('once','shift','project','seven_days','always')),
  access_starts_at timestamptz,
  access_ends_at timestamptz,
  reviewer_comment text check (char_length(reviewer_comment) <= 500),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index web_access_requests_employee_idx on public.web_access_requests(employee_id, created_at desc);
create index web_access_requests_active_idx on public.web_access_requests(employee_id, resource_type, resource_key, status, access_ends_at);

create table public.browser_extension_status (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  device_id uuid not null references public.employee_devices(id) on delete cascade,
  browser_name text not null check (char_length(browser_name) between 1 and 40),
  extension_id text check (char_length(extension_id) <= 160),
  extension_version text check (char_length(extension_version) <= 40),
  status text not null check (status in ('installed','disabled','missing','unknown')),
  last_seen_at timestamptz,
  missing_since timestamptz,
  last_alerted_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(employee_id, device_id, browser_name)
);
create index browser_extension_status_health_idx on public.browser_extension_status(status, last_seen_at);

create table public.web_access_events (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  device_id uuid references public.employee_devices(id) on delete set null,
  event_type text not null check (event_type in ('domain_blocked','application_blocked','request_created','request_approved','request_rejected','request_revoked','extension_installed','extension_missing','extension_disabled','policy_applied')),
  resource_type text check (resource_type in ('domain','application','extension','policy')),
  resource_key text check (char_length(resource_key) <= 253),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now()
);
create index web_access_events_employee_time_idx on public.web_access_events(employee_id, occurred_at desc);
create index web_access_events_type_time_idx on public.web_access_events(event_type, occurred_at desc);

create table public.web_access_alerts (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  employee_id uuid references public.profiles(id) on delete set null,
  alert_type text not null check (alert_type in ('access_request','access_decision','extension_missing','extension_disabled','restricted_application')),
  title text not null check (char_length(title) between 1 and 200),
  body text not null check (char_length(body) between 1 and 500),
  entity_type text not null check (entity_type in ('web_access_request','browser_extension','web_access_event')),
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index web_access_alerts_recipient_idx on public.web_access_alerts(recipient_id, created_at desc);
create index web_access_alerts_unread_idx on public.web_access_alerts(recipient_id, created_at desc) where read_at is null;

alter table public.web_access_categories enable row level security;
alter table public.web_access_rules enable row level security;
alter table public.web_access_requests enable row level security;
alter table public.browser_extension_status enable row level security;
alter table public.web_access_events enable row level security;
alter table public.web_access_alerts enable row level security;

create or replace function public.web_access_is_manager_for(p_employee_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_owner(auth.uid())
    or public.has_permission('activity.policies.manage')
    or public.has_permission('activity.web_access.manage')
    or ((public.has_permission('activity.view_team') or public.has_permission('activity.web_access.review'))
      and public.is_team_supervisor_for(p_employee_id))
$$;
revoke all on function public.web_access_is_manager_for(uuid) from public;
grant execute on function public.web_access_is_manager_for(uuid) to authenticated;

create policy web_access_categories_read on public.web_access_categories for select to authenticated using (true);
create policy web_access_categories_manage on public.web_access_categories for all to authenticated
  using (public.is_owner(auth.uid()) or public.has_permission('activity.web_access.manage') or public.has_permission('activity.policies.manage'))
  with check (public.is_owner(auth.uid()) or public.has_permission('activity.web_access.manage') or public.has_permission('activity.policies.manage'));

create policy web_access_rules_read on public.web_access_rules for select to authenticated using (
  public.is_owner(auth.uid()) or public.has_permission('activity.web_access.manage') or public.has_permission('activity.policies.manage')
  or (scope_type = 'employee' and (scope_id = auth.uid() or public.web_access_is_manager_for(scope_id)))
  or (scope_type = 'device' and exists (select 1 from public.employee_devices d where d.id = scope_id and (d.employee_id = auth.uid() or public.web_access_is_manager_for(d.employee_id))))
  or (scope_type = 'team' and exists (select 1 from public.teams t where t.id = scope_id and t.supervisor_id = auth.uid()))
  or scope_type = 'organisation'
);
create policy web_access_rules_manage on public.web_access_rules for all to authenticated
  using (public.is_owner(auth.uid()) or public.has_permission('activity.web_access.manage') or public.has_permission('activity.policies.manage')
    or (scope_type = 'employee' and public.web_access_is_manager_for(scope_id))
    or (scope_type = 'device' and exists (select 1 from public.employee_devices d where d.id = scope_id and public.web_access_is_manager_for(d.employee_id)))
    or (scope_type = 'team' and exists (select 1 from public.teams t where t.id = scope_id and t.supervisor_id = auth.uid())))
  with check (public.is_owner(auth.uid()) or public.has_permission('activity.web_access.manage') or public.has_permission('activity.policies.manage')
    or (scope_type = 'employee' and public.web_access_is_manager_for(scope_id))
    or (scope_type = 'device' and exists (select 1 from public.employee_devices d where d.id = scope_id and public.web_access_is_manager_for(d.employee_id)))
    or (scope_type = 'team' and exists (select 1 from public.teams t where t.id = scope_id and t.supervisor_id = auth.uid())));

create policy web_access_requests_read on public.web_access_requests for select to authenticated using (
  employee_id = auth.uid() or public.web_access_is_manager_for(employee_id)
);
create policy web_access_requests_create on public.web_access_requests for insert to authenticated with check (
  employee_id = auth.uid() and public.has_permission('activity.view_self')
  and (device_id is null or exists (select 1 from public.employee_devices d where d.id = device_id and d.employee_id = auth.uid()))
);
create policy extension_status_read on public.browser_extension_status for select to authenticated using (
  employee_id = auth.uid() or public.web_access_is_manager_for(employee_id)
);
create policy web_access_events_read on public.web_access_events for select to authenticated using (
  employee_id = auth.uid() or public.web_access_is_manager_for(employee_id)
);
create policy web_access_alerts_read on public.web_access_alerts for select to authenticated using (recipient_id = auth.uid());
create policy web_access_alerts_update on public.web_access_alerts for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

revoke all on public.web_access_categories, public.web_access_rules, public.web_access_requests,
  public.browser_extension_status, public.web_access_events, public.web_access_alerts from public, authenticated;
grant select on public.web_access_categories, public.web_access_rules, public.web_access_requests,
  public.browser_extension_status, public.web_access_events, public.web_access_alerts to authenticated;
grant insert, update, delete on public.web_access_categories, public.web_access_rules to authenticated;
grant insert on public.web_access_requests to authenticated;
grant update on public.web_access_alerts to authenticated;

create or replace function public.web_access_notify_managers(
  p_employee_id uuid, p_alert_type text, p_title text, p_body text, p_entity_type text, p_entity_id uuid
) returns integer language plpgsql security definer set search_path = public as $$
declare inserted_count integer;
begin
  with recipients as (
    select distinct t.supervisor_id user_id from public.team_members tm join public.teams t on t.id = tm.team_id
      where tm.user_id = p_employee_id and t.supervisor_id is not null
    union
    select p.id from public.profiles p where p.active and p.approval_status::text = 'approved'
      and (public.is_owner(p.id) or public.has_permission_as(p.id, 'activity.policies.manage') or public.has_permission_as(p.id, 'activity.web_access.manage'))
  )
  insert into public.web_access_alerts(recipient_id, employee_id, alert_type, title, body, entity_type, entity_id)
  select user_id, p_employee_id, p_alert_type, p_title, p_body, p_entity_type, p_entity_id from recipients
  where user_id is not null and user_id <> p_employee_id;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end $$;
revoke all on function public.web_access_notify_managers(uuid,text,text,text,text,uuid) from public;

create or replace function public.web_access_request_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.web_access_events(employee_id,device_id,event_type,resource_type,resource_key,metadata)
    values(new.employee_id,new.device_id,'request_created',new.resource_type,new.resource_key,
      jsonb_build_object('requestedScope',new.requested_scope,'requestedMinutes',new.requested_minutes));
  perform public.web_access_notify_managers(new.employee_id,'access_request','Web access request',
    left(new.resource_key||' access requested: '||new.reason,500),'web_access_request',new.id);
  return new;
end $$;
revoke all on function public.web_access_request_created() from public, authenticated;
create trigger web_access_request_created_trigger after insert on public.web_access_requests
  for each row execute function public.web_access_request_created();

create or replace function public.web_access_record_event(
  p_device_id uuid, p_event_type text, p_resource_type text, p_resource_key text
) returns uuid language plpgsql security definer set search_path = public as $$
declare event_id uuid; employee uuid := auth.uid();
begin
  if p_event_type not in ('domain_blocked','application_blocked','policy_applied') then raise exception 'Invalid web access event'; end if;
  if p_resource_type not in ('domain','application','policy') then raise exception 'Invalid web access resource'; end if;
  if p_device_id is not null and not exists(select 1 from public.employee_devices d where d.id=p_device_id and d.employee_id=employee) then raise exception 'Device access denied'; end if;
  insert into public.web_access_events(employee_id,device_id,event_type,resource_type,resource_key)
    values(employee,p_device_id,p_event_type,p_resource_type,lower(left(p_resource_key,253))) returning id into event_id;
  if p_event_type='application_blocked' then
    perform public.web_access_notify_managers(employee,'restricted_application','Restricted application blocked',left(p_resource_key,120)||' was blocked by the active web access policy.','web_access_event',event_id);
  end if;
  return event_id;
end $$;
revoke all on function public.web_access_record_event(uuid,text,text,text) from public;
grant execute on function public.web_access_record_event(uuid,text,text,text) to authenticated;

create or replace function public.web_access_effective_policy(p_employee_id uuid, p_device_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare selected_rule public.web_access_rules; local_time time; local_day smallint; schedule_active boolean; category_domains text[]; overrides jsonb;
begin
  if auth.uid() <> p_employee_id and not public.web_access_is_manager_for(p_employee_id) then raise exception 'Web access scope denied'; end if;
  select r.* into selected_rule from public.web_access_rules r where r.enabled and (
    r.scope_type = 'organisation'
    or (r.scope_type = 'employee' and r.scope_id = p_employee_id)
    or (r.scope_type = 'device' and r.scope_id = p_device_id)
    or (r.scope_type = 'team' and exists (select 1 from public.team_members tm where tm.user_id = p_employee_id and tm.team_id = r.scope_id))
    or (r.scope_type = 'role' and exists (select 1 from public.user_roles ur where ur.user_id = p_employee_id and ur.role_id = r.scope_id))
  ) order by r.priority desc,
    case r.scope_type when 'device' then 5 when 'employee' then 4 when 'team' then 3 when 'role' then 2 else 1 end desc,
    r.updated_at desc limit 1;
  if selected_rule.id is null then
    return jsonb_build_object('enabled', false, 'ruleId', null, 'blockedDomains', '[]'::jsonb, 'blockedApplications', '[]'::jsonb, 'activeOverrides', '[]'::jsonb, 'requireManagedExtension', false);
  end if;
  if not exists (select 1 from pg_timezone_names where name = selected_rule.schedule_timezone) then raise exception 'Invalid web access policy timezone'; end if;
  local_time := (now() at time zone selected_rule.schedule_timezone)::time;
  local_day := extract(dow from (now() at time zone selected_rule.schedule_timezone))::smallint;
  schedule_active := local_day = any(selected_rule.schedule_days) and case
    when selected_rule.schedule_start <= selected_rule.schedule_end then local_time between selected_rule.schedule_start and selected_rule.schedule_end
    else local_time >= selected_rule.schedule_start or local_time <= selected_rule.schedule_end end;
  select coalesce(array_agg(distinct lower(domain)), '{}') into category_domains
    from public.web_access_categories c cross join unnest(c.domains) as expanded(domain)
    where c.key = any(selected_rule.blocked_categories);
  select coalesce(jsonb_agg(jsonb_build_object('resourceType',q.resource_type,'resourceKey',q.resource_key,'accessEndsAt',q.access_ends_at,'approvalScope',q.approval_scope)), '[]'::jsonb)
    into overrides from public.web_access_requests q where q.employee_id = p_employee_id and q.status = 'Approved'
      and q.access_starts_at <= now() and (q.access_ends_at is null or q.access_ends_at > now());
  return jsonb_build_object(
    'enabled', selected_rule.enforcement_enabled and schedule_active,
    'ruleId', selected_rule.id, 'ruleName', selected_rule.name, 'scopeType', selected_rule.scope_type,
    'blockedCategories', selected_rule.blocked_categories,
    'blockedDomains', array(select distinct value from unnest(selected_rule.blocked_domains || category_domains) as expanded(value) where not value = any(selected_rule.allowed_domains)),
    'allowedDomains', selected_rule.allowed_domains, 'blockedApplications', selected_rule.blocked_applications,
    'activeOverrides', overrides, 'requireManagedExtension', selected_rule.require_managed_extension,
    'scheduleActive', schedule_active, 'scheduleTimezone', selected_rule.schedule_timezone
  );
end $$;
revoke all on function public.web_access_effective_policy(uuid,uuid) from public;
grant execute on function public.web_access_effective_policy(uuid,uuid) to authenticated;

create or replace function public.web_access_review_request(p_request_id uuid, p_decision text, p_granted_minutes integer, p_approval_scope text, p_comment text)
returns public.web_access_requests language plpgsql security definer set search_path = public as $$
declare item public.web_access_requests; duration_minutes integer;
begin
  select * into item from public.web_access_requests where id = p_request_id for update;
  if not found then raise exception 'Web access request not found'; end if;
  if not public.web_access_is_manager_for(item.employee_id) then raise exception 'Web access review denied'; end if;
  if item.status <> 'Pending' then raise exception 'Web access request already reviewed'; end if;
  if p_decision not in ('Approved','Rejected') then raise exception 'Invalid web access decision'; end if;
  if p_decision = 'Approved' and p_approval_scope not in ('once','shift','project','seven_days','always') then raise exception 'Invalid approval scope'; end if;
  duration_minutes := case p_approval_scope when 'shift' then 720 when 'seven_days' then 10080 when 'always' then 525600 else p_granted_minutes end;
  if p_decision = 'Approved' and coalesce(duration_minutes,0) not between 5 and 525600 then raise exception 'Invalid approval duration'; end if;
  update public.web_access_requests set status=p_decision, granted_minutes=case when p_decision='Approved' then duration_minutes end,
    approval_scope=case when p_decision='Approved' then p_approval_scope end, access_starts_at=case when p_decision='Approved' then now() end,
    access_ends_at=case when p_decision='Approved' and p_approval_scope <> 'always' then now()+make_interval(mins=>duration_minutes) end,
    reviewer_comment=nullif(btrim(coalesce(p_comment,'')),''), reviewed_by=auth.uid(), reviewed_at=now() where id=item.id returning * into item;
  insert into public.web_access_events(employee_id,device_id,event_type,resource_type,resource_key,metadata)
    values(item.employee_id,item.device_id,case when p_decision='Approved' then 'request_approved' else 'request_rejected' end,item.resource_type,item.resource_key,jsonb_build_object('scope',item.approval_scope));
  insert into public.web_access_alerts(recipient_id,employee_id,alert_type,title,body,entity_type,entity_id)
    values(item.employee_id,item.employee_id,'access_decision','Access request '||lower(p_decision),item.resource_key||' was '||lower(p_decision)||'.','web_access_request',item.id);
  return item;
end $$;
revoke all on function public.web_access_review_request(uuid,text,integer,text,text) from public;
grant execute on function public.web_access_review_request(uuid,text,integer,text,text) to authenticated;

create or replace function public.web_access_report_extension(p_device_id uuid,p_browser_name text,p_extension_id text,p_extension_version text,p_status text,p_seen_at timestamptz)
returns public.browser_extension_status language plpgsql security definer set search_path = public as $$
declare current_status public.browser_extension_status; employee uuid := auth.uid(); should_alert boolean := false;
begin
  if not exists(select 1 from public.employee_devices d where d.id=p_device_id and d.employee_id=employee) then raise exception 'Device access denied'; end if;
  if p_status not in ('installed','disabled','missing','unknown') then raise exception 'Invalid extension status'; end if;
  select * into current_status from public.browser_extension_status where employee_id=employee and device_id=p_device_id and browser_name=lower(p_browser_name) for update;
  should_alert := p_status in ('disabled','missing') and (current_status.id is null or current_status.status not in ('disabled','missing') or current_status.last_alerted_at < now()-interval '6 hours');
  insert into public.browser_extension_status(employee_id,device_id,browser_name,extension_id,extension_version,status,last_seen_at,missing_since,last_alerted_at,updated_at)
    values(employee,p_device_id,lower(p_browser_name),nullif(p_extension_id,''),nullif(p_extension_version,''),p_status,
      case when p_status='installed' then now() else current_status.last_seen_at end,
      case when p_status in ('disabled','missing') then coalesce(current_status.missing_since,now()) end,
      case when should_alert then now() else current_status.last_alerted_at end,now())
  on conflict(employee_id,device_id,browser_name) do update set extension_id=excluded.extension_id,extension_version=excluded.extension_version,status=excluded.status,
    last_seen_at=coalesce(excluded.last_seen_at,browser_extension_status.last_seen_at),missing_since=excluded.missing_since,last_alerted_at=excluded.last_alerted_at,updated_at=now()
  returning * into current_status;
  if should_alert then
    insert into public.web_access_events(employee_id,device_id,event_type,resource_type,resource_key)
      values(employee,p_device_id,case when p_status='disabled' then 'extension_disabled' else 'extension_missing' end,'extension',lower(p_browser_name));
    perform public.web_access_notify_managers(employee,case when p_status='disabled' then 'extension_disabled' else 'extension_missing' end,
      'FieldFlow browser extension '||p_status, 'The managed extension is '||p_status||' for '||lower(p_browser_name)||'.','browser_extension',current_status.id);
  end if;
  return current_status;
end $$;
revoke all on function public.web_access_report_extension(uuid,text,text,text,text,timestamptz) from public;
grant execute on function public.web_access_report_extension(uuid,text,text,text,text,timestamptz) to authenticated;

create or replace function public.web_access_expire_and_detect_stale_extensions()
returns integer language plpgsql security definer set search_path = public as $$
declare affected integer := 0; item record;
begin
  update public.web_access_requests set status='Expired' where status='Approved' and access_ends_at is not null and access_ends_at <= now();
  for item in select s.* from public.browser_extension_status s join public.employee_devices d on d.id=s.device_id
    where d.status='active' and s.status='installed' and s.last_seen_at < now()-interval '5 minutes' for update of s
  loop
    update public.browser_extension_status set status='missing',missing_since=coalesce(missing_since,now()),last_alerted_at=now(),updated_at=now() where id=item.id;
    insert into public.web_access_events(employee_id,device_id,event_type,resource_type,resource_key) values(item.employee_id,item.device_id,'extension_missing','extension',item.browser_name);
    perform public.web_access_notify_managers(item.employee_id,'extension_missing','FieldFlow browser extension missing','No extension heartbeat has been received from '||item.browser_name||' for five minutes.','browser_extension',item.id);
    affected := affected + 1;
  end loop;
  return affected;
end $$;
revoke all on function public.web_access_expire_and_detect_stale_extensions() from public, authenticated;

do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') and not exists(select 1 from cron.job where jobname='fieldflow-web-access-health') then
    perform cron.schedule('fieldflow-web-access-health','* * * * *',$cron$select public.web_access_expire_and_detect_stale_extensions();$cron$);
  end if;
exception when undefined_table or insufficient_privilege then null; end $$;

notify pgrst, 'reload schema';
