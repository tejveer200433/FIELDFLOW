-- User-owned saved report filters and delivery schedules.

create table if not exists public.report_presets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  kind text not null check (kind in ('view','schedule')),
  filters jsonb not null default '{}'::jsonb check (jsonb_typeof(filters) = 'object'),
  recipient_email text,
  frequency text check (frequency is null or frequency in ('daily','weekly','monthly')),
  active boolean not null default true,
  last_sent_at timestamptz,
  next_send_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'view' and recipient_email is null and frequency is null) or (kind = 'schedule' and recipient_email is not null and frequency is not null))
);

create index if not exists report_presets_owner_kind_idx on public.report_presets(owner_id, kind, created_at desc);
alter table public.report_presets enable row level security;
drop policy if exists report_presets_owner_all on public.report_presets;
create policy report_presets_owner_all on public.report_presets for all to authenticated
using (owner_id = auth.uid() and public.has_permission('reports.review'))
with check (owner_id = auth.uid() and public.has_permission('reports.review'));
grant select, insert, update, delete on public.report_presets to authenticated;
