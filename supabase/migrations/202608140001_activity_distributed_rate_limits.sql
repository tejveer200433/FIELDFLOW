-- Atomic activity API rate limiting shared by every application instance.
-- Callers can consume only their own authenticated buckets; the table is not
-- directly readable or writable through the public API.

create table if not exists public.activity_rate_limits (
  user_id uuid not null,
  bucket text not null check (char_length(bucket) between 2 and 120),
  request_count integer not null check (request_count > 0),
  reset_at timestamptz not null,
  primary key (user_id, bucket)
);

alter table public.activity_rate_limits enable row level security;
revoke all on public.activity_rate_limits from anon, authenticated;

create index if not exists activity_rate_limits_reset_idx
  on public.activity_rate_limits(reset_at);

create or replace function public.activity_consume_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := auth.uid();
  current_time timestamptz := clock_timestamp();
  current_count integer;
  current_reset timestamptz;
begin
  if caller_id is null then
    raise exception 'Authentication required';
  end if;
  if p_bucket is null or char_length(btrim(p_bucket)) not between 2 and 120 then
    raise exception 'Invalid rate-limit bucket';
  end if;
  if p_limit not between 1 and 10000 or p_window_seconds not between 1 and 86400 then
    raise exception 'Invalid rate-limit bounds';
  end if;

  insert into public.activity_rate_limits(user_id, bucket, request_count, reset_at)
  values (caller_id, btrim(p_bucket), 1, current_time + make_interval(secs => p_window_seconds))
  on conflict (user_id, bucket) do update
  set request_count = case
        when public.activity_rate_limits.reset_at <= current_time then 1
        else public.activity_rate_limits.request_count + 1
      end,
      reset_at = case
        when public.activity_rate_limits.reset_at <= current_time
          then current_time + make_interval(secs => p_window_seconds)
        else public.activity_rate_limits.reset_at
      end
  returning request_count, reset_at into current_count, current_reset;

  return jsonb_build_object(
    'allowed', current_count <= p_limit,
    'retryAfterSeconds', greatest(1, ceil(extract(epoch from (current_reset - current_time)))::integer)
  );
end;
$$;

revoke all on function public.activity_consume_rate_limit(text,integer,integer) from public, anon;
grant execute on function public.activity_consume_rate_limit(text,integer,integer) to authenticated, service_role;

comment on function public.activity_consume_rate_limit(text,integer,integer) is
  'Atomically consumes the authenticated user rate-limit bucket across all application instances.';
