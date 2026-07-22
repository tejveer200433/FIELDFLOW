create extension if not exists pgcrypto;

create type public.app_role as enum ('employee', 'manager', 'admin');
create type public.approval_state as enum ('pending', 'approved', 'rejected');
create type public.task_state as enum ('Assigned', 'On The Way', 'In Progress', 'Completed', 'Blocked');
create type public.review_state as enum ('Submitted', 'Approved', 'Rejected', 'Needs Update');
create type public.expense_state as enum ('Pending', 'Approved', 'Rejected');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  role public.app_role not null default 'employee',
  requested_role public.app_role not null default 'employee',
  approval_status public.approval_state not null default 'approved',
  department text not null default 'Field Operations',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 160),
  employee_id uuid references public.profiles(id) on delete set null,
  created_by uuid not null references public.profiles(id),
  client text not null,
  address text not null,
  priority text not null check (priority in ('Low','Medium','High','Urgent')) default 'Medium',
  status public.task_state not null default 'Assigned',
  scheduled_at timestamptz,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.attendance_shifts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null,
  time_zone text not null,
  check_in_at timestamptz not null default now(),
  check_out_at timestamptz,
  check_in_lat double precision not null check (check_in_lat between -90 and 90),
  check_in_lng double precision not null check (check_in_lng between -180 and 180),
  check_in_accuracy double precision,
  check_out_lat double precision,
  check_out_lng double precision,
  check_out_accuracy double precision,
  attendance_status text not null default 'On time' check (attendance_status in ('On time','Late')),
  created_at timestamptz not null default now(),
  constraint checkout_after_checkin check (check_out_at is null or check_out_at >= check_in_at)
);
create unique index one_open_shift_per_employee on public.attendance_shifts(employee_id) where check_out_at is null;
create index attendance_employee_date on public.attendance_shifts(employee_id, work_date desc);

create table public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  task_title text not null,
  report_date date not null default current_date,
  hours numeric(5,2) not null check (hours > 0 and hours <= 24),
  work_completed text not null,
  problems text,
  tomorrow_plan text,
  status public.review_state not null default 'Submitted',
  manager_comment text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  expense_date date not null default current_date,
  type text not null,
  amount numeric(12,2) not null check (amount > 0),
  note text not null,
  receipt_url text,
  status public.expense_state not null default 'Pending',
  manager_comment text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.employee_locations (
  employee_id uuid primary key references public.profiles(id) on delete cascade,
  latitude double precision,
  longitude double precision,
  accuracy double precision,
  sharing boolean not null default false,
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.location_history (
  id bigint generated always as identity primary key,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  accuracy double precision,
  recorded_at timestamptz not null default now()
);
create index location_history_employee_time on public.location_history(employee_id, recorded_at desc);

create table public.sos_alerts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  latitude double precision,
  longitude double precision,
  message text,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create or replace function public.current_role() returns public.app_role language sql stable security definer set search_path = public as $$ select role from public.profiles where id = auth.uid() and active and approval_status = 'approved' $$;
create or replace function public.is_management() returns boolean language sql stable security definer set search_path = public as $$ select coalesce(public.current_role() in ('manager','admin'), false) $$;

create or replace function public.check_in_with_gps(p_time_zone text, p_lat double precision, p_lng double precision, p_accuracy double precision default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare shift_id uuid; local_time timestamp; work_day date; status text;
begin
  if public.current_role() <> 'employee' then raise exception 'Only employees can check in'; end if;
  if p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'Invalid GPS coordinates'; end if;
  local_time := now() at time zone p_time_zone; work_day := local_time::date; status := case when extract(hour from local_time) >= 9 then 'Late' else 'On time' end;
  insert into public.attendance_shifts(employee_id,work_date,time_zone,check_in_at,check_in_lat,check_in_lng,check_in_accuracy,attendance_status)
  values(auth.uid(),work_day,p_time_zone,now(),p_lat,p_lng,p_accuracy,status) returning id into shift_id;
  return shift_id;
end $$;
create or replace function public.check_out_with_gps(p_lat double precision, p_lng double precision, p_accuracy double precision default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare shift_id uuid;
begin
  if public.current_role() <> 'employee' then raise exception 'Only employees can check out'; end if;
  if p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'Invalid GPS coordinates'; end if;
  update public.attendance_shifts set check_out_at=now(),check_out_lat=p_lat,check_out_lng=p_lng,check_out_accuracy=p_accuracy where employee_id=auth.uid() and check_out_at is null returning id into shift_id;
  if shift_id is null then raise exception 'No active check-in was found'; end if;
  return shift_id;
end $$;
create or replace function public.update_my_task_status(p_task_id uuid,p_status public.task_state)
returns uuid language plpgsql security definer set search_path=public as $$
begin
  update public.tasks set status=p_status,updated_at=now() where id=p_task_id and employee_id=auth.uid();
  if not found then raise exception 'Task not found'; end if;
  return p_task_id;
end $$;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare requested public.app_role;
begin
  requested := case when new.raw_user_meta_data->>'requested_role' in ('employee','manager','admin') then (new.raw_user_meta_data->>'requested_role')::public.app_role else 'employee' end;
  insert into public.profiles (id,email,full_name,role,requested_role,approval_status)
  values (new.id,coalesce(new.email,''),coalesce(nullif(new.raw_user_meta_data->>'full_name',''),split_part(coalesce(new.email,'user'),'@',1)),'employee',requested,case when requested='employee' then 'approved' else 'pending' end);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

-- Backfill profiles for accounts that were created before this migration ran.
insert into public.profiles (id,email,full_name,role,requested_role,approval_status)
select
  users.id,
  coalesce(users.email,''),
  coalesce(nullif(users.raw_user_meta_data->>'full_name',''),split_part(coalesce(users.email,'user'),'@',1)),
  'employee'::public.app_role,
  case
    when coalesce(users.raw_user_meta_data->>'requested_role',users.raw_user_meta_data->>'role') in ('employee','manager','admin')
      then coalesce(users.raw_user_meta_data->>'requested_role',users.raw_user_meta_data->>'role')::public.app_role
    else 'employee'::public.app_role
  end,
  case
    when coalesce(users.raw_user_meta_data->>'requested_role',users.raw_user_meta_data->>'role','employee') = 'employee'
      then 'approved'::public.approval_state
    else 'pending'::public.approval_state
  end
from auth.users as users
on conflict (id) do nothing;

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.attendance_shifts enable row level security;
alter table public.daily_reports enable row level security;
alter table public.expenses enable row level security;
alter table public.employee_locations enable row level security;
alter table public.location_history enable row level security;
alter table public.sos_alerts enable row level security;

create policy profiles_self_or_management_select on public.profiles for select using (id=auth.uid() or public.is_management());
create policy profiles_admin_update on public.profiles for update using (public.current_role()='admin') with check (public.current_role()='admin');
create policy tasks_employee_or_management_select on public.tasks for select using (employee_id=auth.uid() or public.is_management());
create policy tasks_management_insert on public.tasks for insert with check (public.is_management() and created_by=auth.uid());
create policy tasks_management_update on public.tasks for update using (public.is_management()) with check (public.is_management());
create policy attendance_select on public.attendance_shifts for select using (employee_id=auth.uid() or public.is_management());
create policy reports_select on public.daily_reports for select using (employee_id=auth.uid() or public.is_management());
create policy reports_employee_insert on public.daily_reports for insert with check (employee_id=auth.uid());
create policy reports_management_update on public.daily_reports for update using (public.is_management()) with check (public.is_management());
create policy expenses_select on public.expenses for select using (employee_id=auth.uid() or public.is_management());
create policy expenses_employee_insert on public.expenses for insert with check (employee_id=auth.uid());
create policy expenses_management_update on public.expenses for update using (public.is_management()) with check (public.is_management());
create policy locations_select on public.employee_locations for select using (employee_id=auth.uid() or public.is_management());
create policy locations_employee_write on public.employee_locations for all using (employee_id=auth.uid()) with check (employee_id=auth.uid());
create policy location_history_select on public.location_history for select using (employee_id=auth.uid() or public.is_management());
create policy location_history_employee_insert on public.location_history for insert with check (employee_id=auth.uid());
create policy sos_select on public.sos_alerts for select using (employee_id=auth.uid() or public.is_management());
create policy sos_employee_insert on public.sos_alerts for insert with check (employee_id=auth.uid());
create policy sos_management_update on public.sos_alerts for update using (public.is_management()) with check (public.is_management());

revoke insert, update, delete on public.attendance_shifts from authenticated;
grant execute on function public.check_in_with_gps(text,double precision,double precision,double precision) to authenticated;
grant execute on function public.check_out_with_gps(double precision,double precision,double precision) to authenticated;
grant execute on function public.update_my_task_status(uuid,public.task_state) to authenticated;

-- Bootstrap the first administrator after they sign up:
-- update public.profiles set role='admin', requested_role='admin', approval_status='approved' where email='owner@company.com';
