package com.fieldflow.android;

import android.app.Activity;
import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import android.util.DisplayMetrics;
import android.view.WindowManager;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

public final class CaptureService extends Service {
    static final String STOP = "com.fieldflow.android.STOP_CAPTURE";
    static final String NOW = "com.fieldflow.android.CAPTURE_NOW";
    private FieldFlowApp app;
    private MediaProjection projection;
    private VirtualDisplay display;
    private ImageReader reader;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final AtomicBoolean uploading = new AtomicBoolean();
    private long nextCapture;
    private long nextEligibilityCheck;
    private volatile boolean destroyed;
    private int width, height, density;
    @Override public void onCreate() { super.onCreate(); app = (FieldFlowApp) getApplication(); }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || STOP.equals(intent.getAction())) { stopSelf(); return START_NOT_STICKY; }
        if (NOW.equals(intent.getAction())) { if (projection != null) nextCapture = 0; else stopSelf(); return START_NOT_STICKY; }
        if (projection != null) return START_NOT_STICKY;
        try {
            if (!app.screenshotsAllowed()) throw new IllegalStateException("Screen capture is disabled by the monitoring policy or device setting.");
            if (!UsageCollector.allowed(this)) throw new IllegalStateException("Enable Usage Access so excluded apps can be protected.");
            if (Build.VERSION.SDK_INT >= 29) startForeground(102, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
            else startForeground(102, notification());
            Intent consent = intent.getParcelableExtra("consent");
            if (consent == null || intent.getIntExtra("result", 0) != Activity.RESULT_OK) throw new IllegalStateException("Screen-sharing approval is required.");
            projection = getSystemService(MediaProjectionManager.class).getMediaProjection(Activity.RESULT_OK, consent);
            projection.registerCallback(new MediaProjection.Callback() {
                @Override public void onStop() { app.captureStatus = "Screen sharing ended. Approve a new session to resume."; stopSelf(); }
                @Override public void onCapturedContentResize(int newWidth, int newHeight) { resize(newWidth, newHeight); }
            }, main);
            DisplayMetrics metrics = new DisplayMetrics();
            getSystemService(WindowManager.class).getDefaultDisplay().getRealMetrics(metrics);
            density = metrics.densityDpi;
            setSize(metrics.widthPixels, metrics.heightPixels);
            reader = newReader();
            // Exactly one virtual display is created for each consent token.
            display = projection.createVirtualDisplay("FieldFlow approved screen sharing", width, height, density,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, reader.getSurface(), null, main);
            app.capture = true; app.captureStatus = "Sharing approved · waiting for a visible app"; nextCapture = 0;
        } catch (Exception error) { app.captureStatus = error.getMessage(); stopSelf(); }
        return START_NOT_STICKY;
    }
    private void setSize(int sourceWidth, int sourceHeight) {
        double scale = Math.min(1.0, 1280.0 / Math.max(sourceWidth, sourceHeight));
        width = Math.max(1, (int) (sourceWidth * scale)); height = Math.max(1, (int) (sourceHeight * scale));
    }
    private ImageReader newReader() {
        ImageReader result = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2);
        result.setOnImageAvailableListener(this::frame, main); return result;
    }
    private void resize(int newWidth, int newHeight) {
        if (destroyed || display == null || newWidth < 1 || newHeight < 1) return;
        int previousWidth = width, previousHeight = height;
        setSize(newWidth, newHeight);
        if (previousWidth == width && previousHeight == height) return;
        display.setSurface(null);
        ImageReader old = reader; reader = newReader();
        display.resize(width, height, density); display.setSurface(reader.getSurface()); old.close();
    }
    @Override public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration);
        if (Build.VERSION.SDK_INT < 34) {
            DisplayMetrics metrics = new DisplayMetrics(); getSystemService(WindowManager.class).getDefaultDisplay().getRealMetrics(metrics);
            resize(metrics.widthPixels, metrics.heightPixels);
        }
    }
    private void frame(ImageReader source) {
        if (destroyed) return;
        try (Image image = source.acquireLatestImage()) {
            if (image == null || uploading.get() || SystemClock.elapsedRealtime() < nextCapture) return;
            if (SystemClock.elapsedRealtime() < nextEligibilityCheck) return;
            nextEligibilityCheck = SystemClock.elapsedRealtime() + 1000;
            if (!app.screenshotsAllowed() || !UsageCollector.allowed(this)) { app.captureStatus = "Capture paused: policy or Usage Access is unavailable"; return; }
            if (app.uiVisible || app.usage == null) return;
            UsageCollector.Foreground foreground = app.usage.current();
            if (foreground.locked() || foreground.packageName().isEmpty() || foreground.packageName().equals(getPackageName())) return;
            JSONArray exclusions = app.policy.optJSONArray("screenshot_excluded_apps");
            for (int i = 0; exclusions != null && i < exclusions.length(); i++) {
                if (TrackingRules.excluded(foreground.packageName(), foreground.label(), exclusions.optString(i))) { app.captureStatus = "Capture paused for an excluded app"; return; }
            }
            Image.Plane plane = image.getPlanes()[0];
            int imageWidth = image.getWidth(), imageHeight = image.getHeight();
            int padding = plane.getRowStride() - plane.getPixelStride() * imageWidth;
            Bitmap padded = Bitmap.createBitmap(imageWidth + padding / plane.getPixelStride(), imageHeight, Bitmap.Config.ARGB_8888);
            padded.copyPixelsFromBuffer(plane.getBuffer());
            Bitmap cropped = Bitmap.createBitmap(padded, 0, 0, imageWidth, imageHeight);
            if (cropped != padded) padded.recycle();
            ByteArrayOutputStream output = new ByteArrayOutputStream(); cropped.compress(Bitmap.CompressFormat.JPEG, 65, output); cropped.recycle();
            byte[] bytes = output.toByteArray();
            String session = app.sessionId, owner = app.api.userId(), capturedAt = Instant.now().toString();
            String requestId = app.requests.pending() ? app.requests.id : "";
            nextCapture = SystemClock.elapsedRealtime() + TrackingRules.interval(app.policy.optInt("screenshot_interval_seconds", 240), 180, 300) * 1000L;
            uploading.set(true);
            app.io.execute(() -> {
                try {
                    if (destroyed || !app.screenshotsAllowed() || !session.equals(app.sessionId) || !owner.equals(app.api.userId())) return;
                    if (!requestId.isEmpty() && (!app.requests.pending() || !requestId.equals(app.requests.id))) return;
                    JSONObject registered = ApiClient.row(app.api.rpc("activity_register_screenshot", ApiClient.json("p_tracking_session_id", session,
                        "p_local_sample_id", UUID.randomUUID().toString(), "p_captured_at", capturedAt, "p_active_application", foreground.packageName(), "p_byte_size", bytes.length)));
                    if (destroyed || !app.screenshotsAllowed() || !session.equals(app.sessionId) || !owner.equals(app.api.userId())) return;
                    app.api.upload(registered.getString("storagePath"), bytes);
                    app.sentScreenshots++; app.captureStatus = "Uploaded " + app.sentScreenshots + " screenshot(s) · " + java.time.LocalTime.now().withNano(0);
                    if (!requestId.isEmpty()) app.requests.finish(requestId, "captured", registered.getString("id"));
                } catch (Exception error) {
                    app.captureStatus = "Screenshot not uploaded: " + error.getMessage();
                    if (!requestId.isEmpty()) app.requests.finish(requestId, "failed", null);
                }
                finally { java.util.Arrays.fill(bytes, (byte) 0); uploading.set(false); }
            });
        } catch (Exception error) { app.captureStatus = "Capture error: " + error.getMessage(); }
    }
    private Notification notification() {
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent stop = PendingIntent.getService(this, 2, new Intent(this, CaptureService.class).setAction(STOP), PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this, "capture").setSmallIcon(R.drawable.ic_fieldflow).setContentTitle("FieldFlow is sharing your screen")
            .setContentText("Visible app content may be saved for authorized managers").setOngoing(true).setContentIntent(open)
            .addAction(new Notification.Action.Builder(null, "Stop sharing", stop).build()).build();
    }
    @Override public void onDestroy() {
        destroyed = true; app.capture = false;
        if (display != null) { display.release(); display = null; }
        if (reader != null) { reader.close(); reader = null; }
        if (projection != null) { projection.stop(); projection = null; }
        if (app.captureStatus.startsWith("Uploaded") || app.captureStatus.startsWith("Sharing approved")) app.captureStatus = "Screen sharing stopped";
        stopForeground(STOP_FOREGROUND_REMOVE); super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
