-- Data correction: the live "Standard Employee" role has accumulated
-- activity.view_team, activity.view_all, and activity.policies.manage --
-- team/workspace-wide visibility and policy administration it was never
-- meant to have. The original seed (202607280001_employee_activity_tracking.sql)
-- only ever grants activity.view_self to Standard Employee; those three
-- extra grants are a live data anomaly, not something the app code
-- produces. This migration removes exactly those three grants and nothing
-- else -- Management and Owner keep their existing permissions untouched,
-- and activity.view_self is left in place so employees keep seeing their
-- own activity.

delete from public.role_permissions
where role_id in (
  select id from public.roles where lower(name) = 'standard employee'
)
and permission_id in (
  select id from public.permissions
  where key in ('activity.view_team', 'activity.view_all', 'activity.policies.manage')
);

notify pgrst, 'reload schema';
