# FieldFlow production setup

The application no longer uses demo authentication or in-memory API data. It requires a Supabase project.

## 1. Create and configure Supabase

1. Create a Supabase project.
2. Open the SQL editor and run `supabase/migrations/202607220001_initial_production.sql`.
3. In Authentication settings, configure the production Site URL and allowed redirect URLs.
4. Copy `.env.example` to `.env.local` and enter the project URL and anon key. Never expose the service-role key in a variable beginning with `NEXT_PUBLIC_`.

## 2. Bootstrap the first administrator

1. Use the FieldFlow administrator sign-up page to create the owner account.
2. Confirm the email if email confirmation is enabled.
3. Run this once in the Supabase SQL editor, replacing the email:

```sql
update public.profiles
set role = 'admin', requested_role = 'admin', approval_status = 'approved', active = true
where email = 'owner@company.com';
```

After this, the administrator can approve manager/admin account requests from **Admin → Employees**. Employee accounts are approved automatically after email confirmation.

## 3. Production checks

- Serve the application over HTTPS; browsers require it for reliable GPS access outside localhost.
- Test location permission and background/tab behavior on the actual employee phones you support.
- Set Supabase email templates and SMTP for sign-up and password reset.
- Keep Row Level Security enabled. Attendance timestamps are created by database functions using server time.
- Configure database backups, log retention, privacy policy, employee consent, and location-data retention before rollout.
- Run `npm run build`, deploy the Next.js application, and set the same environment variables in the hosting provider.

## Current architecture

- Supabase Auth: email/password authentication and password reset.
- PostgreSQL + RLS: profiles, role requests, tasks, attendance, reports, expenses, live/latest locations, location history, and SOS alerts.
- Bearer-authenticated Next.js APIs: every request validates the user and approved profile.
- Role controls: employees see/write their own operational records; managers and administrators see team records; only administrators approve privileged accounts.
