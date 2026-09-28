# Android test build verification

APK verified on 13 September 2026; live database verified on 14 September 2026.

## Completed

- `assembleDebug`: passed. Universal APK, package `com.fieldflow.android`, version `0.1.1`, minimum API 26, target API 36. No native ABI-specific libraries or Google Play Services dependency.
- `testDebugUnitTest`: 6 tests passed (HTTPS destination validation; policy freshness/clock rollback; excluded app matching; invalid/stale GPS rejection; bounded collection intervals; screenshot-request owner/session/expiry validation).
- `lintDebug`: passed with **0 errors and 7 warnings**. Remaining warnings concern a deliberate synchronous preference commit on the background worker, the pinned Gradle version, and English-only UI text. The Usage Access permission lint suppression is scoped to that one manifest entry; access is still checked through Android's app-op at runtime.
- Configuration preparation script: ESLint passed; only public Supabase URL/key copied into the ignored build configuration. No service-role or other server secrets were bundled.
- Android 16 / API 36, AOSP x86_64 emulator: application and test APK installation succeeded.
- Actual login screen inspected at a narrow 320 × 640 emulator size: headings, form, buttons and scrolling render correctly.
- Device instrumentation: **25 checks passed**, including actual Android Keystore encryption/ciphertext inspection, encrypted queue persistence, preservation of owner/session/sample IDs, prevention of cross-account upload, login UI validation, no automatic monitoring at launch, and capture refusal without authorization. An in-memory test backend exercised the native foreground tracking service, heartbeat/sample protocol, zero fabricated desktop input counts, queue acknowledgement, location disabled by default, and stop-session cleanup. Remote-request checks cover delivery to the matching session, no automatic screen-capture authorization, decline reporting, and rejection of another employee’s request.
- APK signing verification: valid APK Signature Scheme v2 using the workstation's Android debug certificate. This is a signed test APK, not a production release.

No real employee credentials were used in Android tests. No Android test activity, locations or screenshots were sent to the live Supabase database. The approved screenshot-request migration is now applied to the connected Supabase database. Dashboard deployment status is tracked separately.

## Web and database verification

- Web tests: **237 passed**. Production Next.js build and targeted ESLint passed.
- Screenshot-request migration: **18 checks passed** against isolated PostgreSQL 16 using synthetic users and storage objects. Covers scope, RLS, prohibited direct writes, duplicate requests, expiry, cooldown, audit records and completion only after a matching upload. This fixture does not replace testing against the live Supabase schema.
- A read-only live schema probe confirmed the missing `employee_devices.agent_mode` column. The web compatibility fix retries only known missing management fields and retains the original scope. Three tests cover old/new schemas and ensure permission errors are never swallowed. The corporate-management migration itself remains unapplied.

- Live Supabase verification: **14/14 checks passed** on 14 September 2026. Confirmed request table, RLS, anonymous read/RPC denial, authenticated direct-write denial, scoped reads, both RPC grants, unique pending index, and screenshot/session dependencies. Existing company policies and employee records were not changed by activation.

## Still requires physical-device acceptance testing

1. Sign in with an authorized employee; register and activate the Android device in the manager dashboard. Confirm permission and disabled/revoked-account failures.
2. Check in through attendance, grant location permission, and confirm live GPS points and map expiry after stopping/disconnecting.
3. Grant Usage Access and switch between test apps. Verify package-name samples in the manager activity view. Samples are approximate usage observations, not exact per-app duration or desktop input productivity scores.
4. Enable company/device screenshot collection, approve Android screen sharing, and capture synthetic WhatsApp/test-app content. Confirm upload and manager authorization. Verify excluded foreground app IDs, screen lock, consent refusal, rotation, switching capture target, and stopping from both notification and application.
5. Keep monitoring active for a work shift on each intended phone brand. Test battery saver, loss of connectivity, permission revocation and process termination. Confirm the app pauses collection when policy verification becomes stale and requires a new user start after termination/reboot.
6. Complete the dashboard deployment before testing remote requests; the database migration is applied. Test requests with screen sharing both stopped and already approved, decline, expiry, disabled device/policy, and access from another team.
7. Confirm screenshot retention cleanup in the deployed environment. Request-history automatic retention and the earlier corporate-management migration remain separate follow-ups.

The installable output is `dist/FieldFlow-Android-0.1.1-test.apk`; its adjacent `.sha256` file identifies the exact generated binary. Transfer that APK to the test phones. Do not distribute the separate instrumentation test APK to employees.
