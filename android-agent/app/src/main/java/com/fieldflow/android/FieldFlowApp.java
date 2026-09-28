package com.fieldflow.android;

import android.app.Application;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.SystemClock;
import org.json.JSONObject;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;

public final class FieldFlowApp extends Application {
    final ExecutorService io = Executors.newSingleThreadExecutor();
    ApiClient api;
    SecureStore store;
    SampleQueue queue;
    RemoteRequests requests;
    volatile boolean tracking, capture, locationEnabled;
    volatile boolean uiVisible;
    volatile UsageCollector usage;
    volatile String sessionId = "", deviceId = "", status = "Ready", locationStatus = "Location is off", captureStatus = "Screen sharing is off", appStatus = "Usage access not enabled";
    volatile JSONObject policy;
    volatile long policyCheckedAt;
    volatile int policyVersion;
    volatile long lastSync;
    volatile int sentSamples, sentScreenshots;
    @Override public void onCreate() {
        super.onCreate(); store = new SecureStore(this); api = new ApiClient(this, store); queue = new SampleQueue(store); requests = new RemoteRequests(this);
        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.createNotificationChannel(new NotificationChannel("tracking", "Work tracking", NotificationManager.IMPORTANCE_LOW));
        manager.createNotificationChannel(new NotificationChannel("capture", "Screen sharing", NotificationManager.IMPORTANCE_LOW));
        manager.createNotificationChannel(new NotificationChannel("requests", "Manager screenshot requests", NotificationManager.IMPORTANCE_DEFAULT));
    }
    boolean freshPolicy() { return tracking && policy != null && policy.optBoolean("tracking_enabled") && TrackingRules.policyFresh(policyCheckedAt, SystemClock.elapsedRealtime()); }
    boolean screenshotsAllowed() { return freshPolicy() && policy.optBoolean("collect_screenshots") && policy.optBoolean("device_capture_enabled", true); }
    void status(String value) { status = value; }
}
