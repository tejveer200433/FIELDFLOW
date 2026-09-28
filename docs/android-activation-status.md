# Android activation status

Updated 14 September 2026.

## Database: activated

The user approved applying `supabase/migrations/202609130001_android_screenshot_requests.sql` to the existing FieldFlow Supabase project. The SQL Editor reported **Success. No rows returned** after the transaction committed.

Live read-only verification passed **14/14 checks**: the request table exists, RLS is enabled, anonymous reads are denied, direct authenticated inserts/updates/deletes are denied, authenticated reads remain scoped by RLS, anonymous access to both RPCs is denied, both authenticated RPC grants exist, the one-pending-request index exists, and screenshot/session dependencies exist.

Three additional public REST checks returned the expected HTTP 401 / PostgreSQL 42501 for anonymous table reads, request creation and request completion. No test requests, employee activity or screenshots were created in production. Activation did not enable a company monitoring policy or start tracking on any phone.

## Android: test build ready

`android-agent/dist/FieldFlow-Android-0.1.1-test.apk` is signed with the workstation's Android debug certificate and supports Android 8+ (API 26 minimum). It passed 6 unit tests, 25 emulator checks, lint with no errors, and APK signature validation. Physical-phone acceptance testing remains required.

SHA-256: `5942fa51fce56be8f143370e65049f4261fc1a05e648acee365ac24bfee27d02`.

## Dashboard: release preparation in progress

The existing production website is `https://fieldflow-henna.vercel.app`, connected to the `tejveer200433/FIELDFLOW` GitHub repository. A dry-run push succeeded using the existing Git credential manager. No new credentials were created.

The Android screenshot-request dashboard route is not live yet. The release will be prepared separately from unrelated uncommitted expense, AI-guide and corporate-management work. Update this section after the hosted release has been verified.

## Phone acceptance

Install the test APK on an authorized test phone, sign in as an active employee, activate the registered device, enable Usage Access and start work tracking. Location additionally requires an open attendance shift and Android location permission. Screenshot capture requires company/device screenshot policy and employee approval of Android's screen-sharing prompt.

An authorized administrator can request a screenshot only during an active session. The request is visible on the phone, can be declined, expires after five minutes and cannot grant screen-sharing permission. Test with synthetic content before using the app on issued phones.
