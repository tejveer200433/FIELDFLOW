-- Fix the distributed activity rate limiter after PostgreSQL resolved the
-- previous `current_time` variable as its built-in `current_time` value
-- (time with time zone) inside the upsert expression.

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
  v_caller_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_request_count integer;
  v_reset_at timestamptz;
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;
  if p_bucket is null or char_length(btrim(p_bucket)) not between 2 and 120 then
    raise exception 'Invalid rate-limit bucket';
  end if;
  if p_limit not between 1 and 10000 or p_window_seconds not between 1 and 86400 then
    raise exception 'Invalid rate-limit bounds';
  end if;

  insert into public.activity_rate_limits(user_id, bucket, request_count, reset_at)
  values (
    v_caller_id,
    btrim(p_bucket),
    1,
    v_now + make_interval(secs => p_window_seconds)
  )
  on conflict (user_id, bucket) do update
  set request_count = case
        when public.activity_rate_limits.reset_at <= v_now then 1
        else public.activity_rate_limits.request_count + 1
      end,
      reset_at = case
        when public.activity_rate_limits.reset_at <= v_now
          then v_now + make_interval(secs => p_window_seconds)
        else public.activity_rate_limits.reset_at
      end
  returning
    public.activity_rate_limits.request_count,
    public.activity_rate_limits.reset_at
  into v_request_count, v_reset_at;

  return jsonb_build_object(
    'allowed', v_request_count <= p_limit,
    'retryAfterSeconds', greatest(
      1,
      ceil(extract(epoch from (v_reset_at - v_now)))::integer
    )
  );
end;
$$;

revoke all on function public.activity_consume_rate_limit(text,integer,integer) from public, anon;
grant execute on function public.activity_consume_rate_limit(text,integer,integer) to authenticated, service_role;

comment on function public.activity_consume_rate_limit(text,integer,integer) is
  'Atomically consumes the authenticated user rate-limit bucket across all application instances.';
