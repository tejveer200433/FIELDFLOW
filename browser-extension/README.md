# FieldFlow Website Activity extension

This cross-browser Manifest V3 extension supports Chrome, Edge, Brave, Firefox, Opera, Vivaldi, and other compatible Chromium browsers. It sends only active-tab hostnames to the local FieldFlow desktop agent. It never signs in to Supabase or FieldFlow and stores no employee authentication token.

Collection is automatic after installation: it samples when the browser starts, when the active tab or website changes, when the focused browser window changes, and once per minute while desktop tracking is active. Employees do not need to press a check button.

## Development installation

1. Install and run a Stage 3 compatible FieldFlow desktop agent.
2. For Chrome, Edge, Brave, or another Chromium browser, open its extensions page, enable Developer mode, choose **Load unpacked**, and select this folder.
3. For Firefox testing, open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select `manifest.json` from this folder.
4. Confirm extension version `0.3.0`.

No extension login, Supabase configuration, Vercel extension-ID allowlist, or browser-held refresh token is required. The local agent must be running on `127.0.0.1:38473`.

The extension does not run in private/incognito mode and never sends full URLs, paths, query strings, page titles, page content, form values, or passwords. Store signing or managed-browser policy deployment is required for permanent unattended installation; that packaging is intentionally deferred until the final installer stage.
