package com.fieldflow.android;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.SystemClock;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.Instant;

/** Commands are session-bound requests, never permission to start MediaProjection. */
final class RemoteRequests {
    private final FieldFlowApp app;
    volatile String id = "", status = "No screenshot request";
    private volatile long expiresAt;
    private volatile String outcome = "";
    private String screenshotId;
    private long nextPoll;
    RemoteRequests(FieldFlowApp app) { this.app = app; }
    boolean pending() { return !id.isEmpty() && outcome.isEmpty() && System.currentTimeMillis() < expiresAt && app.tracking; }
    synchronized void poll() {
        if (SystemClock.elapsedRealtime() < nextPoll) return;
        nextPoll = SystemClock.elapsedRealtime() + 15_000;
        try {
            if (!outcome.isEmpty()) {
                JSONObject completed = ApiClient.row(app.api.rpc("activity_finish_screenshot_request", ApiClient.json("p_request_id", id, "p_status", outcome, "p_screenshot_id", screenshotId)));
                clear("Screenshot request: " + completed.optString("status", outcome));
            }
            JSONArray requests = app.api.query("activity_screenshot_requests?select=id,employee_id,tracking_session_id,expires_at,status&device_id=eq." + app.deviceId
                + "&tracking_session_id=eq." + app.sessionId + "&status=eq.pending&expires_at=gt." + Instant.now() + "&order=requested_at.desc&limit=1");
            if (requests.length() == 0) { if (!id.isEmpty()) clear("Screenshot request ended or expired"); return; }
            JSONObject request = requests.getJSONObject(0);
            long expires = Instant.parse(request.getString("expires_at")).toEpochMilli();
            if (!TrackingRules.requestApplies(request.getString("employee_id"), app.api.userId(), request.getString("tracking_session_id"), app.sessionId, expires, System.currentTimeMillis())) return;
            if (!id.equals(request.getString("id"))) {
                id = request.getString("id"); expiresAt = expires;
                status = "Your manager requested a screenshot. Open FieldFlow to share or decline.";
                PendingIntent open = PendingIntent.getActivity(app, 3, new Intent(app, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
                app.getSystemService(NotificationManager.class).notify(103, new Notification.Builder(app, "requests")
                    .setSmallIcon(R.drawable.ic_fieldflow).setContentTitle("Manager requested a screenshot")
                    .setContentText(app.capture ? "An approved screen-sharing session can capture the next visible app." : "Open FieldFlow to approve screen sharing or decline.")
                    .setContentIntent(open).setAutoCancel(true).build());
                // This action can only adjust timing on an already running capture service.
                if (app.capture) app.startService(new Intent(app, CaptureService.class).setAction(CaptureService.NOW));
            }
        } catch (Exception error) {
            status = error instanceof ApiClient.ApiException apiError && apiError.status == 404
                ? "Remote requests need the database migration" : "Remote request sync: " + error.getMessage();
            if (error instanceof ApiClient.ApiException apiError && apiError.status == 404) nextPoll = SystemClock.elapsedRealtime() + 300_000;
        }
    }
    synchronized void finish(String requestId, String result, String shotId) {
        if (requestId.isEmpty() || !requestId.equals(id)) return;
        outcome = result; screenshotId = shotId; status = "Confirming screenshot request result…"; nextPoll = 0;
        poll();
    }
    synchronized void decline() { if (pending()) finish(id, "declined", null); }
    synchronized void clear(String message) {
        id = ""; expiresAt = 0; outcome = ""; screenshotId = null; status = message;
        app.getSystemService(NotificationManager.class).cancel(103);
    }
}
