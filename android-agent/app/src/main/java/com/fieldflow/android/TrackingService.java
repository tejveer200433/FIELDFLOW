package com.fieldflow.android;

import android.Manifest;
import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

public final class TrackingService extends Service implements LocationListener {
    static final String STOP = "com.fieldflow.android.STOP";
    private FieldFlowApp app;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final AtomicBoolean busy = new AtomicBoolean();
    private UsageCollector usage;
    static volatile UsageCollector.Foreground foreground = new UsageCollector.Foreground("", "", false);
    private long nextPolicy, nextSample, nextHeartbeat, nextUpload, lastLocation;
    private volatile boolean destroyed;
    private final Runnable pulse = new Runnable() {
        @Override public void run() {
            if (destroyed) return;
            if (busy.compareAndSet(false, true)) app.io.execute(() -> {
                try { tick(); } catch (Exception error) {
                    app.status("Sync paused: " + error.getMessage());
                    if (error instanceof ApiClient.ApiException apiError && (apiError.status == 401 || apiError.status == 403)) main.post(TrackingService.this::stopSelf);
                } finally { busy.set(false); }
            });
            main.postDelayed(this, 5000);
        }
    };
    @Override public void onCreate() { super.onCreate(); app = (FieldFlowApp) getApplication(); }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || STOP.equals(intent.getAction())) { stopSelf(); return START_NOT_STICKY; }
        if (app.tracking) return START_NOT_STICKY;
        app.locationEnabled = intent.getBooleanExtra("location", false);
        int type = Build.VERSION.SDK_INT >= 34 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE : 0;
        if (app.locationEnabled && Build.VERSION.SDK_INT >= 29) type |= ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION;
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(101, notification(), type); else startForeground(101, notification());
        } catch (Exception error) { app.status("Cannot start tracking: " + error.getMessage()); stopSelf(); return START_NOT_STICKY; }
        app.tracking = true; app.status("Starting work tracking…");
        app.io.execute(() -> {
            try {
                JSONObject device = app.api.registerDevice(); app.deviceId = device.getString("id");
                if (!"active".equals(device.optString("status"))) throw new IllegalStateException("An administrator must activate this Android device in Monitoring settings → Devices.");
                JSONArray open = app.api.query("tracking_sessions?select=id,device_id,status&employee_id=eq." + app.api.userId() + "&status=eq.active&ended_at=is.null");
                if (open.length() > 0) {
                    JSONObject previous = open.getJSONObject(0);
                    if (!app.deviceId.equals(previous.getString("device_id"))) throw new IllegalStateException("Stop the active session on your other device first.");
                    app.api.rpc("activity_stop_session", ApiClient.json("p_session_id", previous.getString("id"), "p_end_source", "agent"));
                }
                if (destroyed) return;
                JSONObject session = ApiClient.row(app.api.rpc("activity_start_session", ApiClient.json("p_device_id", app.deviceId, "p_start_source", "agent")));
                String id = session.getString("id");
                if (destroyed) { app.api.rpc("activity_stop_session", ApiClient.json("p_session_id", id, "p_end_source", "agent")); return; }
                app.sessionId = id;
                app.policyVersion = session.getInt("monitoring_policy_version");
                usage = new UsageCollector(this, Instant.parse(session.getString("started_at")).toEpochMilli());
                app.usage = usage;
                app.status("Work tracking is on");
                main.post(() -> { if (!destroyed) { startLocation(); pulse.run(); } });
            } catch (Exception error) { app.status(error.getMessage()); main.post(this::stopSelf); }
        });
        return START_NOT_STICKY;
    }
    private Notification notification() {
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent stop = PendingIntent.getService(this, 1, new Intent(this, TrackingService.class).setAction(STOP), PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this, "tracking").setSmallIcon(com.fieldflow.android.R.drawable.ic_fieldflow)
            .setContentTitle("FieldFlow work tracking is on").setContentText(app.locationEnabled ? "Location and permitted app usage · Tap to review" : "Permitted app usage · Tap to review")
            .setContentIntent(open).setOngoing(true).addAction(new Notification.Action.Builder(null, "Stop tracking", stop).build()).build();
    }
    private void tick() throws Exception {
        if (destroyed || app.sessionId.isEmpty()) return;
        if (!getSystemService(android.app.NotificationManager.class).areNotificationsEnabled()) {
            app.status("Tracking stopped because notifications were disabled."); main.post(this::stopSelf); return;
        }
        long now = SystemClock.elapsedRealtime();
        if (now >= nextPolicy) {
            nextPolicy = now + 30_000;
            JSONObject policy = app.api.policy();
            JSONArray device = app.api.query("employee_devices?select=status&id=eq." + app.deviceId);
            JSONArray sessions = app.api.query("tracking_sessions?select=status,ended_at&id=eq." + app.sessionId);
            if (destroyed) return;
            if (device.length() == 0 || !"active".equals(device.getJSONObject(0).optString("status")) || sessions.length() == 0 || !"active".equals(sessions.getJSONObject(0).optString("status"))) {
                app.status("Device or session is no longer active."); main.post(this::stopSelf); return;
            }
            if (!policy.optBoolean("tracking_enabled") || policy.optInt("policy_version") != app.policyVersion) {
                app.status("Monitoring policy changed. Review it before restarting."); main.post(this::stopSelf); return;
            }
            JSONArray settings = app.api.query("device_screenshot_settings?select=capture_enabled&device_id=eq." + app.deviceId);
            policy.put("device_capture_enabled", settings.length() == 0 || settings.getJSONObject(0).optBoolean("capture_enabled"));
            app.policy = policy; app.policyCheckedAt = SystemClock.elapsedRealtime();
            if (!app.screenshotsAllowed() && app.capture) main.post(() -> stopService(new Intent(this, CaptureService.class)));
        }
        if (!app.freshPolicy() || destroyed) { app.status("Tracking paused until the monitoring policy can be verified."); return; }
        app.requests.poll();
        foreground = usage.current();
        app.appStatus = UsageCollector.allowed(this) ? (foreground.locked() ? "Screen locked" : foreground.packageName().isEmpty() ? "Waiting for an app change" : foreground.label()) : "Usage Access is off";
        JSONObject policy = app.policy;
        if (now >= nextHeartbeat) {
            nextHeartbeat = now + TrackingRules.interval(policy.optInt("heartbeat_interval_seconds", 60), 15, 3600) * 1000L;
            int battery = getSystemService(BatteryManager.class).getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY);
            app.api.rpc("activity_record_heartbeat", ApiClient.json("p_device_id", app.deviceId, "p_tracking_session_id", app.sessionId,
                "p_agent_version", "android-" + BuildConfig.VERSION_NAME, "p_online_status", foreground.locked() ? "idle" : "online", "p_battery_level", battery >= 0 && battery <= 100 ? battery : null));
        }
        if (destroyed) return;
        if (now >= nextSample) {
            nextSample = now + TrackingRules.interval(policy.optInt("sample_interval_seconds", 60), 10, 3600) * 1000L;
            // Android does not expose global keyboard/touch counts. Never fabricate them.
            String name = policy.optBoolean("collect_application_names") && UsageCollector.allowed(this) && !foreground.packageName().isEmpty() ? foreground.packageName() : null;
            JSONObject sample = ApiClient.json("localSampleId", UUID.randomUUID().toString(), "capturedAt", Instant.now().toString(),
                "keyboardEventCount", 0, "mouseEventCount", 0, "idleSeconds", foreground.locked() ? policy.optInt("idle_threshold_seconds", 300) : 0,
                "activeApplication", name, "screenLocked", foreground.locked());
            app.queue.add(app.api.userId(), app.deviceId, app.sessionId, sample);
        }
        if (now >= nextUpload) {
            nextUpload = now + TrackingRules.interval(policy.optInt("upload_interval_seconds", 60), 30, 86400) * 1000L;
            app.sentSamples += app.queue.flush(app.api); app.lastSync = System.currentTimeMillis();
        }
        app.status("Work tracking is on");
    }
    private void startLocation() {
        if (!app.locationEnabled) { app.locationStatus = "Location is off"; return; }
        if (checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) { app.locationStatus = "Location permission is missing"; return; }
        LocationManager manager = getSystemService(LocationManager.class);
        int providers = 0;
        for (String provider : new String[]{LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER}) {
            try {
                if (manager.getAllProviders().contains(provider)) {
                    manager.requestLocationUpdates(provider, 30_000L, 10f, this, Looper.getMainLooper());
                    if (manager.isProviderEnabled(provider)) providers++;
                }
            } catch (SecurityException ignored) { /* Approximate-only permission may exclude GPS. */ }
        }
        app.locationStatus = providers == 0 ? "Turn on the phone's Location setting" : "Waiting for a fresh location fix";
    }
    @Override public void onLocationChanged(Location location) {
        if (destroyed || !app.freshPolicy() || !app.locationEnabled) return;
        long now = SystemClock.elapsedRealtime();
        long age = now - location.getElapsedRealtimeNanos() / 1_000_000;
        if (!TrackingRules.validFix(location.getLatitude(), location.getLongitude(), age) || now - lastLocation < 30_000) return;
        lastLocation = now;
        app.io.execute(() -> {
            if (destroyed || !app.freshPolicy()) return;
            try {
                // Only fresh fixes go to the live endpoint; stale offline fixes never become "live".
                if (SystemClock.elapsedRealtime() - location.getElapsedRealtimeNanos() / 1_000_000 > 90_000) return;
                app.api.web("/api/locations", ApiClient.json("latitude", location.getLatitude(), "longitude", location.getLongitude(), "accuracy", location.hasAccuracy() ? location.getAccuracy() : null, "sharing", true));
                app.locationStatus = "Shared at " + java.time.LocalTime.now().withNano(0) + " · accuracy " + Math.round(location.getAccuracy()) + " m";
            } catch (Exception error) { app.locationStatus = error.getMessage(); }
        });
    }
    @Override public void onProviderDisabled(String provider) { app.locationStatus = "Location provider disabled"; }
    @Override public void onProviderEnabled(String provider) { app.locationStatus = "Waiting for a fresh location fix"; }
    @Override public void onDestroy() {
        destroyed = true; main.removeCallbacks(pulse);
        getSystemService(LocationManager.class).removeUpdates(this);
        stopService(new Intent(this, CaptureService.class));
        app.tracking = false; app.policyCheckedAt = 0;
        String session = app.sessionId; app.sessionId = "";
        boolean sharedLocation = app.locationEnabled; app.locationEnabled = false;
        if (app.status.equals("Work tracking is on")) app.status("Tracking stopped");
        app.locationStatus = "Location is off";
        app.io.execute(() -> {
            app.requests.clear("Tracking stopped; pending requests will expire");
            try { if (!session.isEmpty()) app.queue.flush(app.api); } catch (Exception ignored) { /* Retain encrypted samples for the same account. */ }
            try { if (!session.isEmpty()) app.api.rpc("activity_stop_session", ApiClient.json("p_session_id", session, "p_end_source", "agent")); }
            catch (Exception error) { app.status("Stopped on this phone. Server session will be reconciled on restart: " + error.getMessage()); }
            try { if (sharedLocation && app.api.signedIn()) app.api.web("/api/locations", ApiClient.json("sharing", false)); }
            catch (Exception ignored) { /* The manager map expires the last location after two minutes. */ }
        });
        stopForeground(STOP_FOREGROUND_REMOVE); super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
