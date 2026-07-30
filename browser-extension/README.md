# FieldFlow Website Activity extension

This Manifest V3 extension supports Chrome, Edge, and Brave. It samples only the active tab hostname once per minute while the signed-in employee has an active FieldFlow tracking session.

Before loading it:

1. Set the two public Supabase values in `config.js`.
2. Open `chrome://extensions`, enable Developer mode, and choose **Load unpacked**.
3. Copy the resulting extension ID into Vercel environment variable `ACTIVITY_BROWSER_EXTENSION_IDS` (comma-separated), redeploy FieldFlow, then reload the extension.

The extension does not run in incognito mode and never sends full URLs, paths, query strings, page titles, page content, form values, or passwords.
