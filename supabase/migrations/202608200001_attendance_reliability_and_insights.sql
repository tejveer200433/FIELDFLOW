-- Attendance reliability, anomaly, offline-capture, and privacy foundations.
-- Existing records remain valid; all new columns have safe defaults.

alter table public.attendance_shifts
  add column if not exists checkout_source text not null default 'manual'
    check (checkout_source in ('manual','automatic','correction')),
  add column if not exists check_in_device_id text,
  add column if not exists check_out_device_id text,
  add column if not exists check_in_client_event_id text,
  add column if not exists check_out_client_event_id text,
  add column if not exists check_in_captured_at timestamptz,
  add column if not exists check_out_captured_at timestamptz,
  add column if not exists check_in_offline boolean not null default false,
  add column if not exists check_out_offline boolean not null default false,
  add column if not exists risk_score integer not null default 0 check (risk_score between 0 and 100),
  add column if not exists risk_flags jsonb not null default '[]'::jsonb,
  add column if not exists evidence_path text;

create unique index if not exists attendance_shift_check_in_event_uidx
  on public.attendance_shifts(employee_id, check_in_client_event_id)
  where check_in_client_event_id is not null;
create unique index if not exists attendance_shift_check_out_event_uidx
  on public.attendance_shifts(employee_id, check_out_client_event_id)
  where check_out_client_event_id is not null;
create index if not exists attendance_shift_device_idx
  on public.attendance_shifts(employee_id, check_in_device_id, check_in_at desc);

alter table public.attendance_breaks
  add column if not exists break_type text not null default 'unpaid'
    check (break_type in ('paid','unpaid')),
  add column if not exists policy_exceeded boolean not null default false;

create table if not exists public.attendance_anomalies (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid references public.attendance_shifts(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  anomaly_type text not null check (anomaly_type in (
    'late_arrival','early_departure','missed_checkout','excessive_break',
    'long_shift','unusual_location','impossible_travel','multiple_device','offline_capture'
  )),
  severity text not null default 'warning' check (severity in ('info','warning','high')),
  details jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  unique(shift_id, anomaly_type)
);
create index if not exists attendance_anomalies_employee_idx
  on public.attendance_anomalies(employee_id, created_at desc);
create index if not exists attendance_anomalies_open_idx
  on public.attendance_anomalies(status, severity, created_at desc);

create table if not exists public.attendance_audit_log (
  id bigint generated always as identity primary key,
  shift_id uuid references public.attendance_shifts(id) on delete set null,
  employee_id uuid references public.profiles(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists attendance_audit_shift_idx
  on public.attendance_audit_log(shift_id, created_at desc);

create table if not exists public.attendance_reminders (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  shift_id uuid references public.attendance_shifts(id) on delete cascade,
  reminder_type text not null check (reminder_type in (
    'shift_upcoming','missed_check_in','shift_ending','break_overdue','missed_checkout','request_decision'
  )),
  message text not null,
  due_at timestamptz not null,
  delivered_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(employee_id, shift_id, reminder_type, due_at)
);
create index if not exists attendance_reminders_due_idx
  on public.attendance_reminders(employee_id, due_at) where dismissed_at is null;

create table if not exists public.attendance_privacy_settings (
  singleton boolean primary key default true check (singleton),
  location_during_active_shift_only boolean not null default true,
  location_retention_days integer not null default 90 check (location_retention_days between 7 and 730),
  audit_retention_days integer not null default 365 check (audit_retention_days between 30 and 3650),
  photo_evidence_risk_threshold integer not null default 70 check (photo_evidence_risk_threshold between 0 and 100),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.attendance_privacy_settings(singleton) values(true) on conflict do nothing;

create table if not exists public.attendance_evidence (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.attendance_shifts(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  evidence_type text not null check (evidence_type in ('photo','document','manager_note')),
  storage_path text,
  note text,
  requested_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.recalculate_attendance_totals(p_shift_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  shift_record record;
  paid_minutes integer;
  recorded_break_minutes integer;
  unpaid_break_minutes integer;
  scheduled_minutes integer;
begin
  select * into shift_record from public.attendance_shifts where id = p_shift_id;
  if shift_record.id is null then return; end if;

  select
    coalesce(sum(greatest(0, floor(extract(epoch from (
      coalesce(b.ended_at, coalesce(shift_record.check_out_at, now())) - b.started_at
    )) / 60))::integer), 0),
    coalesce(sum(case when b.break_type = 'unpaid' then greatest(0, floor(extract(epoch from (
      coalesce(b.ended_at, coalesce(shift_record.check_out_at, now())) - b.started_at
    )) / 60))::integer else 0 end), 0)
  into recorded_break_minutes, unpaid_break_minutes
  from public.attendance_breaks b where b.shift_id = p_shift_id;

  paid_minutes := greatest(0, floor(extract(epoch from (
    coalesce(shift_record.check_out_at, now()) - shift_record.check_in_at
  )) / 60)::integer - unpaid_break_minutes);
  scheduled_minutes := case
    when shift_record.is_weekly_off or shift_record.is_holiday then 0
    when shift_record.scheduled_start_at is not null and shift_record.scheduled_end_at is not null
      then greatest(0, floor(extract(epoch from (shift_record.scheduled_end_at - shift_record.scheduled_start_at)) / 60)::integer
        - coalesce((select t.unpaid_break_minutes from public.attendance_shift_templates t where t.id = shift_record.shift_template_id), 0))
    else paid_minutes
  end;
  update public.attendance_shifts set
    break_minutes = recorded_break_minutes,
    worked_minutes = paid_minutes,
    overtime_minutes = greatest(0, paid_minutes - scheduled_minutes)
  where id = p_shift_id;
end
$$;

create or replace function public.start_attendance_break(p_break_type text default 'unpaid')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare open_shift uuid; break_id uuid;
begin
  if not public.has_permission('attendance.view_self') then raise exception 'You do not have permission to record a break'; end if;
  if p_break_type not in ('paid','unpaid') then raise exception 'A valid break type is required'; end if;
  select id into open_shift from public.attendance_shifts where employee_id = auth.uid() and check_out_at is null;
  if open_shift is null then raise exception 'Check in before starting a break'; end if;
  insert into public.attendance_breaks(shift_id,employee_id,break_type)
  values(open_shift,auth.uid(),p_break_type) returning id into break_id;
  return break_id;
end
$$;

create or replace function public.refresh_attendance_anomalies(p_shift_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare s record; limit_minutes integer;
begin
  select shift.*, coalesce(template.unpaid_break_minutes, 0) expected_break
  into s from public.attendance_shifts shift
  left join public.attendance_shift_templates template on template.id = shift.shift_template_id
  where shift.id = p_shift_id;
  if s.id is null then return; end if;
  limit_minutes := greatest(30, s.expected_break + 30);

  if s.attendance_status = 'Late' then
    insert into public.attendance_anomalies(shift_id,employee_id,anomaly_type,details)
    values(s.id,s.employee_id,'late_arrival',jsonb_build_object('checkInAt',s.check_in_at,'scheduledStartAt',s.scheduled_start_at)) on conflict do nothing;
  end if;
  if s.check_out_at is not null and s.scheduled_end_at is not null and s.check_out_at < s.scheduled_end_at - interval '15 minutes' then
    insert into public.attendance_anomalies(shift_id,employee_id,anomaly_type,details)
    values(s.id,s.employee_id,'early_departure',jsonb_build_object('checkOutAt',s.check_out_at,'scheduledEndAt',s.scheduled_end_at)) on conflict do nothing;
  end if;
  if s.break_minutes > limit_minutes then
    insert into public.attendance_anomalies(shift_id,employee_id,anomaly_type,details)
    values(s.id,s.employee_id,'excessive_break',jsonb_build_object('breakMinutes',s.break_minutes,'policyMinutes',limit_minutes)) on conflict do nothing;
  end if;
  if coalesce(s.check_out_at,now()) - s.check_in_at > interval '16 hours' then
    insert into public.attendance_anomalies(shift_id,employee_id,anomaly_type,severity,details)
    values(s.id,s.employee_id,'long_shift','high',jsonb_build_object('checkInAt',s.check_in_at,'checkOutAt',s.check_out_at)) on conflict do nothing;
  end if;
  if s.check_in_offline or s.check_out_offline then
    insert into public.attendance_anomalies(shift_id,employee_id,anomaly_type,details)
    values(s.id,s.employee_id,'offline_capture',jsonb_build_object('checkInOffline',s.check_in_offline,'checkOutOffline',s.check_out_offline)) on conflict do nothing;
  end if;
  if s.risk_flags ? 'multiple_device' then
    insert into public.attendance_anomalies(shift_id,employee_id,anomaly_type,severity,details)
    values(s.id,s.employee_id,'multiple_device','high',jsonb_build_object('riskFlags',s.risk_flags)) on conflict do nothing;
  end if;
  if s.risk_flags ? 'mock_location_reported' or s.risk_flags ? 'low_gps_accuracy' then
    insert into public.attendance_anomalies(shift_id,employee_id,anomaly_type,severity,details)
    values(s.id,s.employee_id,'unusual_location','high',jsonb_build_object('riskFlags',s.risk_flags)) on conflict do nothing;
  end if;
  if s.risk_flags ? 'impossible_travel' then
    insert into public.attendance_anomalies(shift_id,employee_id,anomaly_type,severity,details)
    values(s.id,s.employee_id,'impossible_travel','high',jsonb_build_object('riskFlags',s.risk_flags)) on conflict do nothing;
  end if;
end
$$;

create or replace function public.refresh_my_attendance_reminders()
returns integer language plpgsql security definer set search_path=public as $$
declare s record; b record; created_count integer := 0;
begin
  select shift.*, template.unpaid_break_minutes into s
  from public.attendance_shifts shift
  left join public.attendance_shift_templates template on template.id=shift.shift_template_id
  where shift.employee_id=auth.uid() and shift.check_out_at is null order by shift.check_in_at desc limit 1;
  if s.id is null then return 0; end if;
  if s.scheduled_end_at is not null and now() between s.scheduled_end_at-interval '15 minutes' and s.scheduled_end_at then
    insert into public.attendance_reminders(employee_id,shift_id,reminder_type,message,due_at)
    values(auth.uid(),s.id,'shift_ending','Your scheduled shift ends soon.',s.scheduled_end_at)
    on conflict do nothing; created_count:=created_count+1;
  end if;
  if s.scheduled_end_at is not null and now()>s.scheduled_end_at then
    insert into public.attendance_reminders(employee_id,shift_id,reminder_type,message,due_at)
    values(auth.uid(),s.id,'missed_checkout','Your scheduled shift has ended. Please check out.',s.scheduled_end_at)
    on conflict do nothing; created_count:=created_count+1;
  end if;
  select * into b from public.attendance_breaks where employee_id=auth.uid() and ended_at is null limit 1;
  if b.id is not null and now()>b.started_at+make_interval(mins=>greatest(30,coalesce(s.unpaid_break_minutes,30)+15)) then
    update public.attendance_breaks set policy_exceeded=true where id=b.id;
    insert into public.attendance_reminders(employee_id,shift_id,reminder_type,message,due_at)
    values(auth.uid(),s.id,'break_overdue','Your active break has exceeded the expected duration.',b.started_at+make_interval(mins=>greatest(30,coalesce(s.unpaid_break_minutes,30)+15)))
    on conflict do nothing; created_count:=created_count+1;
  end if;
  return created_count;
end $$;

create or replace function public.create_attendance_decision_reminder(p_employee_id uuid,p_message text)
returns uuid language plpgsql security definer set search_path=public as $$
declare reminder_id uuid;
begin
  if not (public.has_permission('attendance.approve') or public.has_permission('settings.manage'))
    or not public.can_manage_attendance_user(p_employee_id) then
    raise exception 'You do not have permission to notify this employee';
  end if;
  insert into public.attendance_reminders(employee_id,reminder_type,message,due_at,delivered_at)
  values(p_employee_id,'request_decision',left(p_message,500),now(),now()) returning id into reminder_id;
  return reminder_id;
end $$;

create or replace function public.apply_attendance_privacy_retention()
returns integer language plpgsql security definer set search_path=public as $$
declare retention_days integer; changed integer;
begin
  if not public.has_permission('settings.manage') then raise exception 'You do not have permission to apply attendance retention'; end if;
  select location_retention_days into retention_days from public.attendance_privacy_settings where singleton=true;
  update public.attendance_shifts set
    check_in_lat=null,check_in_lng=null,check_in_accuracy=null,check_in_distance_m=null,
    check_out_lat=null,check_out_lng=null,check_out_accuracy=null,check_out_distance_m=null
  where check_in_at < now()-make_interval(days=>coalesce(retention_days,90))
    and (check_in_lat is not null or check_out_lat is not null);
  get diagnostics changed=row_count;
  return changed;
end $$;

create or replace function public.auto_close_overdue_attendance(p_employee_id uuid default auth.uid())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare target_id uuid; closed_count integer := 0;
begin
  if p_employee_id <> auth.uid() and not (public.has_permission('attendance.approve') or public.has_permission('attendance.view_all')) then
    raise exception 'You do not have permission to auto-close this attendance';
  end if;
  for target_id in
    select s.id from public.attendance_shifts s
    join public.attendance_shift_templates t on t.id = s.shift_template_id
    where s.employee_id = p_employee_id and s.check_out_at is null and s.scheduled_end_at is not null
      and now() >= s.scheduled_end_at + make_interval(mins => t.auto_checkout_after_minutes)
  loop
    update public.attendance_breaks set ended_at = coalesce(ended_at, now()) where shift_id = target_id and ended_at is null;
    update public.attendance_shifts set check_out_at = now(), checkout_source = 'automatic' where id = target_id;
    perform public.recalculate_attendance_totals(target_id);
    insert into public.attendance_anomalies(shift_id,employee_id,anomaly_type,severity,details)
      select id,employee_id,'missed_checkout','warning',jsonb_build_object('autoClosedAt',check_out_at)
      from public.attendance_shifts where id = target_id on conflict do nothing;
    closed_count := closed_count + 1;
  end loop;
  return closed_count;
end
$$;

create or replace function public.auto_close_overdue_attendance_scope()
returns integer language plpgsql security definer set search_path=public as $$
declare employee uuid; total integer := 0;
begin
  if not (public.has_permission('attendance.approve') or public.has_permission('attendance.view_all')) then
    raise exception 'You do not have permission to auto-close scoped attendance';
  end if;
  for employee in
    select distinct s.employee_id from public.attendance_shifts s
    join public.attendance_shift_templates t on t.id=s.shift_template_id
    where s.check_out_at is null and s.scheduled_end_at is not null
      and now()>=s.scheduled_end_at+make_interval(mins=>t.auto_checkout_after_minutes)
      and (public.has_permission('attendance.view_all') or public.can_manage_attendance_user(s.employee_id))
  loop total:=total+public.auto_close_overdue_attendance(employee); end loop;
  return total;
end $$;

create or replace function public.set_attendance_capture_metadata(
  p_shift_id uuid, p_action text, p_client_event_id text, p_device_id text,
  p_captured_at timestamptz, p_offline boolean, p_risk_flags jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists(select 1 from public.attendance_shifts where id=p_shift_id and employee_id=auth.uid()) then
    raise exception 'Attendance record is outside your scope';
  end if;
  if p_captured_at > now() + interval '5 minutes' or p_captured_at < now() - interval '24 hours' then
    raise exception 'Offline attendance events must be synchronized within 24 hours';
  end if;
  if p_action = 'check-in' then
    update public.attendance_shifts set check_in_client_event_id=p_client_event_id,check_in_device_id=p_device_id,
      check_in_captured_at=p_captured_at,check_in_offline=p_offline,risk_flags=coalesce(p_risk_flags,'[]'::jsonb),
      risk_score=least(100,jsonb_array_length(coalesce(p_risk_flags,'[]'::jsonb))*25) where id=p_shift_id;
  elsif p_action = 'check-out' then
    update public.attendance_shifts set check_out_client_event_id=p_client_event_id,check_out_device_id=p_device_id,
      check_out_captured_at=p_captured_at,check_out_offline=p_offline,
      risk_flags=risk_flags || coalesce(p_risk_flags,'[]'::jsonb),risk_score=least(100,risk_score+jsonb_array_length(coalesce(p_risk_flags,'[]'::jsonb))*25) where id=p_shift_id;
  else raise exception 'A valid attendance action is required'; end if;
  perform public.refresh_attendance_anomalies(p_shift_id);
end
$$;

create or replace function public.attendance_shift_audit_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.attendance_audit_log(shift_id,employee_id,actor_id,event_type,event_data)
  values(new.id,new.employee_id,auth.uid(),case when tg_op='INSERT' then 'check_in' when old.check_out_at is null and new.check_out_at is not null then 'check_out' else 'attendance_updated' end,
    jsonb_build_object('checkoutSource',new.checkout_source,'status',new.attendance_status,'workedMinutes',new.worked_minutes,'riskScore',new.risk_score));
  return new;
end $$;
drop trigger if exists attendance_shift_audit on public.attendance_shifts;
create trigger attendance_shift_audit after insert or update on public.attendance_shifts
for each row execute function public.attendance_shift_audit_trigger();

create or replace function public.attendance_anomaly_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin perform public.refresh_attendance_anomalies(new.id); return new; end $$;
drop trigger if exists attendance_shift_anomaly_refresh on public.attendance_shifts;
create trigger attendance_shift_anomaly_refresh after insert or update of check_out_at,break_minutes,risk_flags on public.attendance_shifts
for each row execute function public.attendance_anomaly_trigger();

alter table public.attendance_anomalies enable row level security;
alter table public.attendance_audit_log enable row level security;
alter table public.attendance_reminders enable row level security;
alter table public.attendance_privacy_settings enable row level security;
alter table public.attendance_evidence enable row level security;

create policy attendance_anomalies_read on public.attendance_anomalies for select to authenticated using (
  employee_id=auth.uid() or public.can_manage_attendance_user(employee_id)
);
create policy attendance_anomalies_manage on public.attendance_anomalies for update to authenticated using (
  public.can_manage_attendance_user(employee_id)
) with check (public.can_manage_attendance_user(employee_id));
create policy attendance_audit_read on public.attendance_audit_log for select to authenticated using (
  employee_id=auth.uid() or public.can_manage_attendance_user(employee_id)
);
create policy attendance_reminders_read on public.attendance_reminders for select to authenticated using (employee_id=auth.uid());
create policy attendance_reminders_update on public.attendance_reminders for update to authenticated using (employee_id=auth.uid()) with check(employee_id=auth.uid());
create policy attendance_privacy_read on public.attendance_privacy_settings for select to authenticated using (true);
create policy attendance_privacy_manage on public.attendance_privacy_settings for all to authenticated using (public.has_permission('settings.manage')) with check(public.has_permission('settings.manage'));
create policy attendance_evidence_read on public.attendance_evidence for select to authenticated using (
  employee_id=auth.uid() or public.can_manage_attendance_user(employee_id)
);
create policy attendance_evidence_insert on public.attendance_evidence for insert to authenticated with check (
  employee_id=auth.uid() or public.can_manage_attendance_user(employee_id)
);

revoke all on public.attendance_anomalies,public.attendance_audit_log,public.attendance_reminders,public.attendance_privacy_settings,public.attendance_evidence from anon;
grant select on public.attendance_anomalies,public.attendance_audit_log,public.attendance_reminders,public.attendance_privacy_settings,public.attendance_evidence to authenticated;
grant update on public.attendance_anomalies,public.attendance_reminders to authenticated;
grant insert on public.attendance_evidence to authenticated;
grant insert,update,delete on public.attendance_privacy_settings to authenticated;
grant usage,select on sequence public.attendance_audit_log_id_seq to authenticated;

revoke all on function public.start_attendance_break(text),public.refresh_attendance_anomalies(uuid),public.refresh_my_attendance_reminders(),public.create_attendance_decision_reminder(uuid,text),public.apply_attendance_privacy_retention(),public.auto_close_overdue_attendance(uuid),public.auto_close_overdue_attendance_scope(),public.set_attendance_capture_metadata(uuid,text,text,text,timestamptz,boolean,jsonb) from public;
grant execute on function public.start_attendance_break(text),public.refresh_my_attendance_reminders(),public.create_attendance_decision_reminder(uuid,text),public.apply_attendance_privacy_retention(),public.auto_close_overdue_attendance(uuid),public.auto_close_overdue_attendance_scope(),public.set_attendance_capture_metadata(uuid,text,text,text,timestamptz,boolean,jsonb) to authenticated;
