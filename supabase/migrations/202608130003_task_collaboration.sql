-- Task checklists, comments, and private attachments.

alter table public.tasks
  add column if not exists checklist jsonb not null default '[]'::jsonb;

alter table public.tasks drop constraint if exists tasks_checklist_array;
alter table public.tasks add constraint tasks_checklist_array
  check (jsonb_typeof(checklist) = 'array' and jsonb_array_length(checklist) <= 100);

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 3000),
  created_at timestamptz not null default now()
);

create table if not exists public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  object_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 255),
  content_type text not null,
  size_bytes bigint not null check (size_bytes between 1 and 20971520),
  created_at timestamptz not null default now()
);

create index if not exists task_comments_task_created_idx on public.task_comments(task_id, created_at);
create index if not exists task_attachments_task_created_idx on public.task_attachments(task_id, created_at);

alter table public.task_comments enable row level security;
alter table public.task_attachments enable row level security;

create or replace function public.can_access_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tasks task
    where task.id = p_task_id
      and (
        (task.employee_id = auth.uid() and public.has_permission('tasks.view_self'))
        or public.has_permission('tasks.manage_all')
        or (public.has_permission('tasks.assign') and public.is_team_supervisor_for(task.employee_id))
      )
  );
$$;

drop policy if exists task_comments_read on public.task_comments;
drop policy if exists task_comments_insert on public.task_comments;
create policy task_comments_read on public.task_comments for select to authenticated
using (public.can_access_task(task_id));
create policy task_comments_insert on public.task_comments for insert to authenticated
with check (author_id = auth.uid() and public.can_access_task(task_id));

drop policy if exists task_attachments_read on public.task_attachments;
drop policy if exists task_attachments_insert on public.task_attachments;
drop policy if exists task_attachments_delete on public.task_attachments;
create policy task_attachments_read on public.task_attachments for select to authenticated
using (public.can_access_task(task_id));
create policy task_attachments_insert on public.task_attachments for insert to authenticated
with check (uploaded_by = auth.uid() and public.can_access_task(task_id));
create policy task_attachments_delete on public.task_attachments for delete to authenticated
using (
  public.can_access_task(task_id)
  and (uploaded_by = auth.uid() or public.has_permission('tasks.manage_all') or public.has_permission('tasks.assign'))
);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('task-attachments','task-attachments',false,20971520,array['image/jpeg','image/png','image/webp','application/pdf','text/plain','application/zip','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists task_files_insert on storage.objects;
drop policy if exists task_files_read on storage.objects;
drop policy if exists task_files_delete on storage.objects;
create policy task_files_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'task-attachments' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy task_files_read on storage.objects for select to authenticated using (
  bucket_id = 'task-attachments' and exists (
    select 1 from public.task_attachments attachment
    where attachment.object_path = storage.objects.name and public.can_access_task(attachment.task_id)
  )
);
create policy task_files_delete on storage.objects for delete to authenticated using (
  bucket_id = 'task-attachments' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1 from public.task_attachments attachment
      where attachment.object_path = storage.objects.name
        and public.can_access_task(attachment.task_id)
        and (public.has_permission('tasks.manage_all') or public.has_permission('tasks.assign'))
    )
  )
);

create or replace function public.update_my_task_checklist(p_task_id uuid, p_completed_ids text[])
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_task public.tasks;
begin
  if not public.has_permission('tasks.view_self') then raise exception 'Task self access required'; end if;
  update public.tasks task
  set checklist = coalesce((
    select jsonb_agg(item || jsonb_build_object('completed', (item->>'id') = any(coalesce(p_completed_ids, array[]::text[]))))
    from jsonb_array_elements(task.checklist) item
  ), '[]'::jsonb), updated_at = now()
  where task.id = p_task_id and task.employee_id = auth.uid()
  returning task.* into updated_task;
  if not found then raise exception 'Task not found in your permitted scope'; end if;
  return updated_task;
end;
$$;

revoke all on function public.can_access_task(uuid) from public;
grant execute on function public.can_access_task(uuid) to authenticated;
revoke all on function public.update_my_task_checklist(uuid,text[]) from public;
grant execute on function public.update_my_task_checklist(uuid,text[]) to authenticated;
grant select, insert on public.task_comments to authenticated;
grant select, insert, delete on public.task_attachments to authenticated;
