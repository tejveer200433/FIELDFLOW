# FieldFlow Android test app

One universal APK for Android phones and tablets running **Android 8.0 / API 26 or newer**, targeting Android 16 / API 36. The app uses native Android APIs, with no Samsung-specific SDK or Google Play Services dependency. Manufacturer battery controls and Android permissions still affect operation. This is a test build, not a claim that every device has been physically certified.

## Install and test

1. Transfer `dist/FieldFlow-Android-0.1.1-test.apk` to a test phone and open it. If Android asks, permit installation from the particular browser or file manager used for this APK. Return that permission to its previous setting after installation. Keep Play Protect enabled.
2. Sign in using an active, approved FieldFlow employee account with `activity.view_self`. The supplied build uses the project's public Supabase configuration and `https://fieldflow-henna.vercel.app` for the website. Connection settings are available before sign-in for another environment; HTTPS is required.
3. Tap **Check connection / register device**. New devices are pending until an authorized administrator activates them through **Monitoring settings → Devices**. They are named `Android · <manufacturer> <model>`.
4. Enable **Usage Access** in Android settings. This is a separate Android permission, not granted merely by installing the APK.
5. For GPS, check in through the employee dashboard first, select **Share location**, and grant Android location permission. The app does not silently create attendance records.
6. Tap **Start work tracking**, allow notifications, and read/accept the current company monitoring policy. The company policy must have tracking enabled. An employee can have only one active tracking session across their devices; stop desktop tracking before testing Android.
7. Enable screenshot collection in the company's monitoring policy and for the device. Tap **Approve screen sharing** and accept Android's prompt. Choose **Entire screen** to capture across apps. Switch to a test app, or a WhatsApp conversation containing only synthetic test content. Protected content can appear blank.
8. Review **Device status** in the app. Check the existing manager activity/screenshot views and live location map. **Capture next visible app** requests a frame locally; periodic capture uses the company's 180–300 second setting.
9. Stop screen sharing or all tracking using the app or its notification. Android can also end projection when the screen locks. A new projection session always requires a fresh Android approval.

## Included

- Native email/password sign-in and refresh-token renewal; no passwords are saved.
- Android Keystore AES-GCM protection for persisted authentication and queued activity samples; backup and device transfer excluded.
- Random installation identifier scoped to the signed-in employee, hashed before device registration.
- Explicit policy acknowledgement, device activation/revocation checks, and visible foreground-service notifications with stop actions.
- Foreground application package-name samples, screen-lock state, battery heartbeat and existing activity summaries. No global keyboard/touch counts are invented.
- GPS fixes from Android's location providers during a selected work session. The existing web endpoint enforces an open attendance shift. Old offline fixes are not replayed as live locations.
- Encrypted bounded activity queue, stable sample IDs for retry deduplication, and account isolation. Samples retain their original session. The queue holds up to 1,000 samples; the oldest is removed when full. Policy validation fails closed after two minutes without a successful check, so collection then pauses. Server-side rejection of expired samples removes them from the retry batch.
- Employee-approved MediaProjection screenshots, compressed JPEG (maximum long edge 1,280 pixels), private storage, and the existing manager authorization rules. Captures exclude FieldFlow's own UI and policy-excluded apps. Set exclusions using Android package IDs, such as `com.whatsapp` or `com.whatsapp.w4b`, because app display names are not always available.
- Screenshot bytes are not persisted on the phone and are discarded after the upload attempt. A failed upload is shown in Device status; screenshots are not queued for offline replay. Existing backend registration-before-upload can leave a screenshot metadata record if the storage upload fails.
- A browser link to the existing employee dashboard for attendance, tasks and expenses. Those screens remain web screens and may require a separate browser sign-in.

## Deliberate limits

This is a normal, visibly operating Android app. It does not enroll phones in Android Enterprise, prevent uninstall, bypass screen-capture consent, read WhatsApp databases, intercept messages/calls, record microphones, or use accessibility services. It has no boot receiver and does not silently resume after process death or reboot. The employee must start again; the same device's previous server session is reconciled at that point.

App usage is sampled, not an exact record of every tap or every short app visit. Desktop keyboard/mouse-based productivity percentages do not measure Android productivity. Screen sharing captures visible pixels, not hidden chat history or communication recipients through an API. Authorized administrators can request a screenshot from **Monitoring settings → Devices** after the new migration and dashboard update are deployed. Requests expire after five minutes and appear as a notification on the phone. The employee can decline, or approve Android screen sharing if it is not already running. During an already approved screen-sharing session, a request schedules the next eligible frame; it never grants capture permission. There is no live video viewer.

Location sharing stops when tracking stops. A lost connection can leave the last server point visible until the existing two-minute map timeout. Repeated GPS history for an offline period is not included in this version. Test battery settings and GPS behavior on the actual devices you intend to issue.

## Backend compatibility

The Android client calls the existing Supabase authenticated RPCs for registration, acknowledgement, tracking sessions, heartbeats, sample ingestion, summaries and screenshot registration. It uses the signed-in employee's bearer token and public client key, never a service-role key. Storage uploads still enforce the existing private bucket policies. Location calls the existing `/api/locations` route.

The Android screenshot-request migration is applied to the connected Supabase project; 14 live schema and access checks passed on 14 September 2026. Dashboard deployment is being completed separately. The current database platform constraint accepts `windows`, `macos`, `linux`, and `other`, so the Android client registers under `other` and records the actual Android version in `operating_system_version`. Device names explicitly identify Android.

The local dashboard now retries scoped device reads without the seven optional corporate-management columns when the database reports that they are absent. Existing authorization and employee filters are preserved. Windows corporate-management controls remain unavailable until their separate migration is installed; Android cards show Android controls. This compatibility fix requires deploying the updated web app.

Manager screenshot requests additionally require `supabase/migrations/202609130001_android_screenshot_requests.sql`. It creates a private, RLS-protected request table and two audited RPCs. Requests require policy-management permission plus access to the employee, active tracking and enabled screenshot policy. Only the owning employee can report completion; a captured result must reference a matching uploaded screenshot. History is retained until a linked device/session is deleted; automatic request-history retention is not included. The migration passed 18 isolated PostgreSQL checks and is applied to the connected database. Live verification passed all 14 checks for schema dependencies, RLS, table grants and RPC access.

The required existing RPCs are `get_my_access_context`, `activity_register_device`, `activity_acknowledge_policy`, `activity_start_session`, `activity_stop_session`, `activity_record_heartbeat`, `activity_ingest_samples`, `activity_refresh_daily_summaries`, and `activity_register_screenshot`. Monitoring policy, device and session reads use the existing RLS policies.

## Build

Requirements: JDK 17, Android SDK platform 36, build-tools 35.0.0, and network access for the pinned Gradle/Android build dependencies. Open this directory in Android Studio, or use the included Gradle wrapper.

From the repository root on this Windows workstation:

```powershell
.\android-agent\build.ps1 -Test
```

The script locates the task-local tools at `%LOCALAPPDATA%\FieldFlowAndroidTools` if `JAVA_HOME`/`ANDROID_HOME` are unset. On another machine, set those variables to your own JDK 17 and Android SDK paths. `node scripts/prepare-android-config.mjs` copies only the public Supabase settings from `.env.local` into the ignored `android-agent/fieldflow.local.properties`. Set `FIELDFLOW_ANDROID_API_URL` before running it to target a different HTTPS web deployment.

Manual build:

```powershell
node scripts/prepare-android-config.mjs
cd android-agent
.\gradlew.bat assembleDebug testDebugUnitTest lintDebug assembleDebugAndroidTest
```

The debug APK is installable and signed using the workstation's Android debug key. Use it only for testing. Production distribution needs a company-controlled signing key, release build and distribution setup; no production signing key was generated by this work. Keep the same signing key to install upgrades over the existing application.

The device smoke test must run on a fresh emulator with no employee signed in. It checks Android Keystore encryption, encrypted queue persistence/account isolation and the actual login activity. It then substitutes an in-memory backend supplied only by the separate test APK to exercise the real tracking service, heartbeats, sample delivery, consent denial, manager-request delivery/decline/account isolation, and stop lifecycle without sending records to the live database:

```powershell
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb shell pm grant com.fieldflow.android android.permission.POST_NOTIFICATIONS
adb shell appops set com.fieldflow.android GET_USAGE_STATS allow
adb shell am instrument -w com.fieldflow.android.test/com.fieldflow.android.DeviceSmokeTest
```

Run `.\scripts\test-android-migration.ps1` from the repository root to repeat the 18 SQL authorization and lifecycle checks using a disposable PostgreSQL Docker container with no network or host ports.

See `TEST_RESULTS.md` for the checks actually completed and the remaining physical-device checklist.

The two permission-setup commands above are for the disposable emulator test only. Employees enable notifications and Usage Access through the Android UI. On pre-Android-13 emulators omit the notification-permission command.

## Android references

- [MediaProjection consent and lifecycle](https://developer.android.com/media/grow/media-projection)
- [UsageStatsManager and Usage Access](https://developer.android.com/reference/android/app/usage/UsageStatsManager)
- [Foreground service types](https://developer.android.com/develop/background-work/services/fgs/service-types)
- [Android Gradle Plugin 8.13 compatibility](https://developer.android.com/build/releases/agp-8-13-0-release-notes)
