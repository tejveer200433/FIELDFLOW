# FieldFlow Website Activity extension

This Manifest V3 extension sends only active tab hostnames to the local FieldFlow desktop agent. The extension never signs in to Supabase or FieldFlow and stores no employee authentication token. It records a hostname when the employee changes websites and continues sampling once per minute while desktop tracking is active.

Before loading it:

1. Install and run a Stage 2 compatible FieldFlow desktop agent.
2. Open `chrome://extensions`, enable Developer mode, and choose **Load unpacked**.
3. Select this `browser-extension` folder and confirm version `0.2.0`.

No extension login, Supabase configuration, Vercel extension-ID allowlist, or browser-held refresh token is required. The local agent must be running on `127.0.0.1:38473`.

The extension does not run in incognito mode and never sends full URLs, paths, query strings, page titles, page content, form values, or passwords.
