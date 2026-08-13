-- Ensure abandoned desktop-agent sessions cannot block automatic recovery on a
-- restarted or replacement device. Supabase Cron executes this server-only
-- maintenance function every minute; the function itself remains unavailable
-- to authenticated clients.

create extension if not exists pg_cron;

select cron.schedule(
  'fieldflow-close-stale-activity-sessions',
  '* * * * *',
  $cron$select public.activity_close_stale_sessions();$cron$
);
