package com.fieldflow.android;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import org.json.JSONObject;
import org.json.JSONArray;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.io.File;
import java.util.ArrayList;

/** Runs without employee credentials and never submits records to the live backend. */
public class DeviceSmokeTest extends Instrumentation {
    private int checks;
    @Override public void onCreate(Bundle arguments) { super.onCreate(arguments); start(); }
    private void check(boolean condition, String message) { if (!condition) throw new AssertionError(message); checks++; }
    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            var context = getTargetContext();
            SecureStore store = new SecureStore(context);
            byte[] secret = "synthetic-test-token-not-a-real-credential".getBytes(StandardCharsets.UTF_8);
            store.write("smoke.bin", secret);
            check(java.util.Arrays.equals(secret, store.read("smoke.bin")), "Keystore encryption must round-trip");
            byte[] disk = Files.readAllBytes(new File(context.getNoBackupFilesDir(), "smoke.bin").toPath());
            check(!new String(disk, StandardCharsets.UTF_8).contains("synthetic-test-token"), "Secret must not appear in stored ciphertext");
            store.remove("smoke.bin"); check(store.read("smoke.bin") == null, "Encrypted record removal");
            ApiClient api = new ApiClient(context, store);
            check(!api.signedIn(), "Run smoke tests on a fresh emulator without an employee signed in");
            SampleQueue queue = new SampleQueue(store); queue.clear();
            queue.add("test-owner", "test-device", "test-session", new JSONObject().put("localSampleId", "stable-id"));
            check(new SampleQueue(store).size() == 1, "Queue must survive recreation");
            String queued = new String(store.read("samples.bin"), StandardCharsets.UTF_8);
            check(queued.contains("stable-id") && queued.contains("test-owner") && queued.contains("test-session"), "Retry must retain sample id, owner and original session");
            check(queue.flush(api) == 0 && queue.size() == 0, "A different account must not send another employee's queue");
            Intent launch = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            Activity activity = startActivitySync(launch); waitForIdleSync();
            ArrayList<EditText> inputs = new ArrayList<>(); ArrayList<Button> buttons = new ArrayList<>();
            runOnMainSync(() -> walk(activity.getWindow().getDecorView(), inputs, buttons));
            check(inputs.size() == 2, "Login must contain email and password fields");
            Button signIn = buttons.stream().filter(button -> button.getText().toString().equals("Sign in")).findFirst().orElseThrow();
            runOnMainSync(signIn::performClick); waitForIdleSync();
            check(((FieldFlowApp) activity.getApplication()).status.contains("Enter your work email"), "Empty login must fail locally");
            check(!((FieldFlowApp) activity.getApplication()).tracking, "Launch must not start monitoring");
            check(!((FieldFlowApp) activity.getApplication()).capture, "Launch must not start screen capture");
            runOnMainSync(() -> context.startService(new Intent(context, CaptureService.class)));
            waitForIdleSync();
            check(!((FieldFlowApp) activity.getApplication()).capture, "Capture must fail closed without policy and consent");
            FieldFlowApp app = (FieldFlowApp) activity.getApplication();
            FakeApi backend = new FakeApi(context, store); app.api = backend;
            runOnMainSync(() -> context.startForegroundService(new Intent(context, TrackingService.class).putExtra("location", false)));
            await(() -> app.sentSamples > 0, "Native foreground service must send a sample through the backend contract");
            check(app.tracking && app.freshPolicy(), "Tracking needs a verified current policy");
            check(backend.heartbeats > 0, "Native service must send a device heartbeat");
            check(backend.sample.optInt("keyboardEventCount", -1) == 0 && backend.sample.optInt("mouseEventCount", -1) == 0, "Android must never fabricate desktop input counts");
            check(app.queue.size() == 0, "Acknowledged samples must leave the encrypted queue");
            check(backend.locations == 0, "Location must not be sent when the user leaves it off");
            backend.remotePending = true; app.requests = new RemoteRequests(app); app.requests.poll();
            check(app.requests.pending(), "A matching manager request reaches this work session");
            check(!app.capture, "A manager request cannot start screen capture");
            app.requests.decline();
            check(!app.requests.pending() && !backend.remotePending, "Employee can decline a manager request");
            backend.remotePending = true; backend.remoteOwner = "another-employee";
            app.requests = new RemoteRequests(app); app.requests.poll();
            check(!app.requests.pending(), "A request for another employee must be ignored");
            backend.remotePending = false;
            runOnMainSync(() -> context.startService(new Intent(context, CaptureService.class)));
            waitForIdleSync();
            check(!app.capture, "Even an enabled company policy must not replace Android capture consent");
            runOnMainSync(() -> context.stopService(new Intent(context, TrackingService.class)));
            await(() -> !app.tracking && !backend.active, "Stop must end local tracking and the server session");
            check(!app.capture, "Stopping tracking must stop screen capture");
            app.api = api;
            result.putString("stream", "\nPASS: " + checks + " Android device checks. No live records created.\n");
            finish(Activity.RESULT_OK, result);
        } catch (Throwable error) {
            result.putString("stream", "\nFAIL after " + checks + " checks: " + error + "\n"); finish(Activity.RESULT_CANCELED, result);
        }
    }
    interface Condition { boolean ready(); }
    private void await(Condition condition, String label) throws Exception {
        long deadline = System.currentTimeMillis() + 10_000;
        while (!condition.ready() && System.currentTimeMillis() < deadline) Thread.sleep(100);
        check(condition.ready(), label);
    }
    /** Only the separately installed test APK supplies this transport. No network calls. */
    static class FakeApi extends ApiClient {
        volatile boolean active;
        volatile int heartbeats, locations;
        volatile JSONObject sample;
        volatile boolean remotePending;
        volatile String remoteOwner = "11111111-1111-4111-8111-111111111111";
        FakeApi(android.content.Context context, SecureStore store) { super(context, store); }
        @Override boolean signedIn() { return true; }
        @Override String userId() { return "11111111-1111-4111-8111-111111111111"; }
        @Override String email() { return "synthetic-device-test@example.invalid"; }
        @Override JSONObject policy() throws Exception { return json("id", "22222222-2222-4222-8222-222222222222", "policy_version", 1, "tracking_enabled", true,
            "collect_application_names", true, "collect_screenshots", true, "screenshot_excluded_apps", new JSONArray(), "sample_interval_seconds", 60, "upload_interval_seconds", 30); }
        @Override JSONObject registerDevice() throws Exception { return json("id", "33333333-3333-4333-8333-333333333333", "status", "active"); }
        @Override JSONArray query(String query) throws Exception {
            if (query.startsWith("activity_screenshot_requests")) return remotePending
                ? new JSONArray().put(json("id", "55555555-5555-4555-8555-555555555555", "employee_id", remoteOwner,
                    "tracking_session_id", "44444444-4444-4444-8444-444444444444", "status", "pending", "expires_at", java.time.Instant.now().plusSeconds(300).toString())) : new JSONArray();
            if (query.startsWith("device_screenshot_settings") || query.contains("employee_id=eq.")) return new JSONArray();
            return new JSONArray().put(json("status", "active", "ended_at", null));
        }
        @Override Object rpc(String function, JSONObject body) throws Exception {
            return switch (function) {
                case "activity_start_session" -> { active = true; yield json("id", "44444444-4444-4444-8444-444444444444", "monitoring_policy_version", 1, "started_at", java.time.Instant.now().toString()); }
                case "activity_record_heartbeat" -> { heartbeats++; yield json(); }
                case "activity_ingest_samples" -> { sample = body.getJSONArray("p_samples").getJSONObject(0); yield json("acceptedCount", body.getJSONArray("p_samples").length(), "duplicateCount", 0, "rejectedCount", 0); }
                case "activity_stop_session" -> { active = false; yield json(); }
                case "activity_refresh_daily_summaries" -> json();
                case "activity_finish_screenshot_request" -> { remotePending = false; yield json("status", body.getString("p_status")); }
                default -> throw new AssertionError("Unexpected backend call: " + function);
            };
        }
        @Override JSONObject web(String path, JSONObject body) throws Exception { locations++; return json(); }
        @Override void upload(String path, byte[] bytes) { throw new AssertionError("No screenshot may upload without Android consent"); }
    }
    private void walk(View view, ArrayList<EditText> inputs, ArrayList<Button> buttons) {
        if (view instanceof EditText input) inputs.add(input);
        if (view instanceof Button button) buttons.add(button);
        if (view instanceof ViewGroup group) for (int i = 0; i < group.getChildCount(); i++) walk(group.getChildAt(i), inputs, buttons);
    }
}
