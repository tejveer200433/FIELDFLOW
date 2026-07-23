-- FieldFlow project -> module -> employee assignment workflow.
-- Run once after 202607220001_initial_production.sql.

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 180),
  client_company text,
  contact_person text,
  contact_phone text,
  site_address text,
  site_lat double precision check (site_lat is null or site_lat between -90 and 90),
  site_lng double precision check (site_lng is null or site_lng between -180 and 180),
  category text not null default 'Other' check (category in ('Visit','Installation','Service','Sales','Collection','Software','Other')),
  description text,
  expected_outcome text,
  start_date date,
  deadline date,
  priority text not null default 'Medium' check (priority in ('Low','Medium','High','Urgent')),
  status text not null default 'Planning' check (status in ('Planning','Active','On Hold','Completed','Cancelled')),
  owner_id uuid not null references public.profiles(id),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (deadline is null or start_date is null or deadline >= start_date)
);

create table if not exists public.project_modules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 180),
  description text,
  checklist jsonb not null default '[]'::jsonb check (jsonb_typeof(checklist) = 'array'),
  sort_order integer not null default 0,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_assignments (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.project_modules(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id),
  start_date date not null,
  deadline timestamptz not null,
  priority text not null default 'Medium' check (priority in ('Low','Medium','High','Urgent')),
  employee_notes text,
  status text not null default 'Not Started' check (status in ('Not Started','In Progress','Submitted for Review','Needs Changes','Completed')),
  checklist_progress jsonb not null default '[]'::jsonb check (jsonb_typeof(checklist_progress) = 'array'),
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(module_id, employee_id)
);

create table if not exists public.work_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.work_assignments(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  version integer not null check (version > 0),
  summary text not null check (char_length(summary) between 2 and 10000),
  work_status text not null default 'Submitted for Review' check (work_status in ('Submitted for Review','Needs Changes','Approved')),
  external_link text,
  employee_comment text,
  reviewer_comment text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(assignment_id, version)
);

create table if not exists public.submission_files (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.work_submissions(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  object_path text not null unique,
  file_name text not null,
  content_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  created_at timestamptz not null default now()
);

create index if not exists projects_status_deadline_idx on public.projects(status, deadline);
create index if not exists modules_project_idx on public.project_modules(project_id, sort_order);
create index if not exists assignments_employee_status_idx on public.work_assignments(employee_id, status, deadline);
create index if not exists assignments_reviewer_status_idx on public.work_assignments(reviewer_id, status, deadline);
create index if not exists submissions_assignment_idx on public.work_submissions(assignment_id, version desc);

alter table public.projects enable row level security;
alter table public.project_modules enable row level security;
alter table public.work_assignments enable row level security;
alter table public.work_submissions enable row level security;
alter table public.submission_files enable row level security;

-- Keep this migration self-contained. Some existing FieldFlow databases were
-- created before the management helper was added to the initial migration.
create or replace function public.is_management()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role::text in ('manager', 'admin')
      and active = true
      and approval_status::text = 'approved'
  )
$$;

drop policy if exists projects_management_all on public.projects;
drop policy if exists projects_employee_select on public.projects;
create policy projects_management_all on public.projects for all using (public.is_management()) with check (public.is_management());
create policy projects_employee_select on public.projects for select using (
  exists (
    select 1 from public.project_modules module
    join public.work_assignments assignment on assignment.module_id = module.id
    where module.project_id = projects.id and assignment.employee_id = auth.uid()
  )
);

drop policy if exists modules_management_all on public.project_modules;
drop policy if exists modules_employee_select on public.project_modules;
create policy modules_management_all on public.project_modules for all using (public.is_management()) with check (public.is_management());
create policy modules_employee_select on public.project_modules for select using (
  exists (select 1 from public.work_assignments assignment where assignment.module_id = project_modules.id and assignment.employee_id = auth.uid())
);

drop policy if exists assignments_management_all on public.work_assignments;
drop policy if exists assignments_employee_select on public.work_assignments;
create policy assignments_management_all on public.work_assignments for all using (public.is_management()) with check (public.is_management());
create policy assignments_employee_select on public.work_assignments for select using (employee_id = auth.uid());

drop policy if exists submissions_management_all on public.work_submissions;
drop policy if exists submissions_employee_select on public.work_submissions;
drop policy if exists submissions_employee_insert on public.work_submissions;
create policy submissions_management_all on public.work_submissions for all using (public.is_management()) with check (public.is_management());
create policy submissions_employee_select on public.work_submissions for select using (employee_id = auth.uid());
create policy submissions_employee_insert on public.work_submissions for insert with check (
  employee_id = auth.uid()
  and work_status = 'Submitted for Review'
  and reviewed_by is null
  and reviewed_at is null
  and exists (select 1 from public.work_assignments assignment where assignment.id = assignment_id and assignment.employee_id = auth.uid())
);

drop policy if exists submission_files_management_all on public.submission_files;
drop policy if exists submission_files_employee_select on public.submission_files;
drop policy if exists submission_files_employee_insert on public.submission_files;
create policy submission_files_management_all on public.submission_files for all using (public.is_management()) with check (public.is_management());
create policy submission_files_employee_select on public.submission_files for select using (uploaded_by = auth.uid());
create policy submission_files_employee_insert on public.submission_files for insert with check (
  uploaded_by = auth.uid() and exists (select 1 from public.work_submissions submission where submission.id = submission_id and submission.employee_id = auth.uid())
);

create or replace function public.update_my_assignment(
  p_assignment_id uuid,
  p_status text,
  p_checklist_progress jsonb default null
) returns uuid language plpgsql security definer set search_path=public as $$
begin
  if p_status not in ('Not Started','In Progress','Submitted for Review') then
    raise exception 'Employees cannot set this assignment status';
  end if;
  update public.work_assignments
  set status=p_status,
      checklist_progress=coalesce(p_checklist_progress,checklist_progress),
      started_at=case when p_status='In Progress' then coalesce(started_at,now()) else started_at end,
      updated_at=now()
  where id=p_assignment_id and employee_id=auth.uid();
  if not found then raise exception 'Assignment not found'; end if;
  return p_assignment_id;
end $$;

grant execute on function public.update_my_assignment(uuid,text,jsonb) to authenticated;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('work-submissions','work-submissions',false,20971520,array['image/jpeg','image/png','image/webp','application/pdf','text/plain','application/zip','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists work_files_employee_insert on storage.objects;
drop policy if exists work_files_authorized_select on storage.objects;
drop policy if exists work_files_employee_delete on storage.objects;
create policy work_files_employee_insert on storage.objects for insert to authenticated with check (
  bucket_id='work-submissions' and (storage.foldername(name))[1]=auth.uid()::text
);
create policy work_files_authorized_select on storage.objects for select to authenticated using (
  bucket_id='work-submissions' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_management())
);
create policy work_files_employee_delete on storage.objects for delete to authenticated using (
  bucket_id='work-submissions' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_management())
);
