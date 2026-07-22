# FieldFlow

FieldFlow is a Next.js field-workforce management application built with React, JavaScript, Tailwind CSS, Node.js API routes, Supabase-ready authentication/database support, Recharts, and Leaflet.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Main routes

- `/login/employee`, `/login/manager`, `/login/admin`
- `/employee`, `/employee/tasks`, `/employee/attendance`, `/employee/reports`, `/employee/expenses`
- `/manager`, `/manager/tasks`, `/manager/employees`, `/manager/map`, `/manager/analytics`
- `/admin`, `/admin/employees`, `/admin/clients`, `/admin/departments`, `/admin/roles`, `/admin/settings`

## Environment variables

Copy `.env.example` to `.env.local` and add your Supabase credentials before connecting real authentication and data.

## Current data mode

The interface starts in demo-data mode. The Node API examples are in `src/app/api`, and `src/lib/supabase.js` is ready for your Supabase connection.

## Live-location demo

- Employees explicitly start and stop sharing from their dashboard.
- Managers see active positions at `/manager/map`; the map refreshes every 10 seconds.
- Browser location requires HTTPS in production (localhost is allowed for development).
- Location records currently use server memory and reset when the server restarts.

Before production use, replace demo login and memory storage with Supabase Auth and database tables, enforce row-level security by organization and role, and define consent, working-hours, retention, and deletion policies.

## Authentication

When `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are configured, FieldFlow uses Supabase Auth for sign-up, sign-in, email confirmation, session persistence, password recovery, role checks, and sign-out. Without those values, the interface runs in clearly labelled demo-authentication mode.

Add the deployed application URL and `/reset-password` to the allowed redirect URLs in Supabase Authentication settings. Manager and administrator registration should be invitation-controlled before production launch.
