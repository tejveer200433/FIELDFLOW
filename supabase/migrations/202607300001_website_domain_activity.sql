-- Domain-only browser activity. Full URLs, paths, queries and page content are never accepted.
create table public.website_activity_samples (
  id uuid primary key default gen_random_uuid(),
  local_sample_id text not null,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  tracking_session_id uuid not null references public.tracking_sessions(id) on delete cascade,
  captured_at timestamptz not null,
  domain text not null check (char_length(domain) between 1 and 253 and domain = lower(domain) and domain !~ '[/?:#@]'),
  browser_name text not null check (char_length(browser_name) between 1 and 40),
  duration_seconds integer not null check (duration_seconds between 1 and 300),
  created_at timestamptz not null default now(),
  unique(employee_id, local_sample_id)
);
create index website_activity_employee_time_idx on public.website_activity_samples(employee_id, captured_at desc);
alter table public.website_activity_samples enable row level security;
create policy website_activity_read on public.website_activity_samples for select to authenticated using (
  employee_id = auth.uid() or public.has_permission('activity.view_all') or public.is_owner(auth.uid())
  or (public.has_permission('activity.view_team') and public.is_team_supervisor_for(employee_id))
);
revoke insert, update, delete on public.website_activity_samples from authenticated;
grant select on public.website_activity_samples to authenticated;

create function public.activity_ingest_website_samples(p_tracking_session_id uuid, p_samples jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  active_session public.tracking_sessions; item jsonb; accepted integer := 0; affected integer;
  local_id text; hostname text; captured timestamptz; browser text; duration integer;
begin
  if auth.uid() is null or not public.has_permission('activity.view_self') then raise exception 'Activity self access required'; end if;
  if jsonb_typeof(p_samples) <> 'array' or jsonb_array_length(p_samples) not between 1 and 100 then raise exception 'Invalid website sample batch'; end if;
  select s.* into active_session from public.tracking_sessions s where s.id=p_tracking_session_id
    and s.employee_id=auth.uid() and s.status='active' and s.ended_at is null;
  if not found then raise exception 'Active tracking session not found'; end if;
  for item in select value from jsonb_array_elements(p_samples) loop
    if item::text ~* '"(url|path|query|title|text|content|password|token|coordinates)"[[:space:]]*:'
      then raise exception 'Forbidden website activity field'; end if;
    local_id:=btrim(item->>'localSampleId'); captured:=(item->>'capturedAt')::timestamptz;
    hostname:=lower(btrim(item->>'domain')); browser:=lower(btrim(item->>'browserName'));
    duration:=coalesce((item->>'durationSeconds')::integer,60);
    if local_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'
      or hostname !~ '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'
      or char_length(hostname)>253 or char_length(browser) not between 1 and 40
      or duration not between 1 and 300 or captured<active_session.started_at or captured>now()+interval '5 minutes'
    then raise exception 'Invalid website activity sample'; end if;
    insert into public.website_activity_samples(local_sample_id,employee_id,tracking_session_id,captured_at,domain,browser_name,duration_seconds)
    values(local_id,auth.uid(),active_session.id,captured,hostname,browser,duration)
    on conflict(employee_id,local_sample_id) do nothing;
    get diagnostics affected = row_count; accepted:=accepted+affected;
  end loop;
  return jsonb_build_object('acceptedCount',accepted,'serverTime',now());
end $$;
revoke all on function public.activity_ingest_website_samples(uuid,jsonb) from public;
grant execute on function public.activity_ingest_website_samples(uuid,jsonb) to authenticated;
notify pgrst, 'reload schema';
