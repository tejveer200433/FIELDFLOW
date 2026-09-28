package com.fieldflow.android;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.projection.MediaProjectionManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.InputType;
import android.view.View;
import android.view.WindowInsets;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;

public final class MainActivity extends Activity {
    private FieldFlowApp app;
    private LinearLayout content;
    private TextView status, diagnostics;
    private Button start, stop, share, stopShare, captureNow, declineRequest;
    private CheckBox location;
    private boolean working;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Runnable refresh = new Runnable() {
        @Override public void run() { updateStatus(); main.postDelayed(this, 1000); }
    };
    @Override public void onCreate(Bundle saved) { super.onCreate(saved); app = (FieldFlowApp) getApplication(); render(); }
    @Override protected void onResume() { super.onResume(); app.uiVisible = true; main.post(refresh); }
    @Override protected void onPause() { app.uiVisible = false; main.removeCallbacks(refresh); super.onPause(); }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private void render() {
        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true); scroll.setBackgroundColor(Color.rgb(245, 246, 250));
        content = new LinearLayout(this); content.setOrientation(LinearLayout.VERTICAL); content.setPadding(dp(22), dp(24), dp(22), dp(24)); scroll.addView(content);
        scroll.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                var bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime()); view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            } else view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        setContentView(scroll);
        if (Build.VERSION.SDK_INT >= 27) {
            getWindow().getDecorView().setSystemUiVisibility(getWindow().getDecorView().getSystemUiVisibility() | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        }
        text(content, "FIELDFLOW  /  ANDROID", 13, true, Color.rgb(101, 84, 192));
        text(content, "Your work, connected.", 29, true, Color.rgb(28, 32, 48));
        text(content, "Company work tracking with controls you can see.", 15, false, Color.DKGRAY);
        status = text(content, app.status, 15, true, Color.rgb(101, 84, 192));
        if (!app.api.signedIn()) loginForm(); else dashboard();
        text(content, "FieldFlow " + BuildConfig.VERSION_NAME + " · Android " + Build.VERSION.RELEASE + "\n" + Build.MANUFACTURER + " " + Build.MODEL, 12, false, Color.GRAY);
    }
    private LinearLayout card(String title) {
        LinearLayout box = new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL); box.setPadding(dp(18), dp(16), dp(18), dp(16));
        GradientDrawable background = new GradientDrawable(); background.setColor(Color.WHITE); background.setCornerRadius(dp(18)); box.setBackground(background);
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(-1, -2); layout.topMargin = dp(16); content.addView(box, layout);
        text(box, title, 19, true, Color.rgb(28, 32, 48)); return box;
    }
    private TextView text(LinearLayout parent, String value, int size, boolean bold, int color) {
        TextView view = new TextView(this); view.setText(value); view.setTextSize(size); view.setTextColor(color);
        if (bold) view.setTypeface(null, Typeface.BOLD); view.setPadding(0, dp(5), 0, dp(7)); parent.addView(view); return view;
    }
    private EditText input(LinearLayout parent, String label, int type) {
        EditText view = new EditText(this); view.setHint(label); view.setContentDescription(label); view.setTextSize(16); view.setInputType(type); view.setSingleLine(true); parent.addView(view, new LinearLayout.LayoutParams(-1, dp(56))); return view;
    }
    private Button button(LinearLayout parent, String label, Runnable action) {
        Button view = new Button(this); view.setText(label); view.setAllCaps(false); view.setTextSize(15);
        view.setOnClickListener(ignored -> action.run()); parent.addView(view, new LinearLayout.LayoutParams(-1, dp(52))); return view;
    }
    private void loginForm() {
        LinearLayout box = card("Sign in to your company account");
        EditText email = input(box, "Work email", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        EditText password = input(box, "Password", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        button(box, "Sign in", () -> {
            if (working) return;
            String mail = email.getText().toString().trim(), secret = password.getText().toString();
            if (mail.isEmpty() || secret.isEmpty()) { message("Enter your work email and password."); return; }
            work("Signing in…", () -> { app.api.login(mail, secret); app.queue.clear(); return "Signed in"; }, () -> { password.setText(""); render(); });
        });
        button(box, "Connection settings", this::connectionSettings);
        LinearLayout privacy = card("Before you start");
        text(privacy, "Tracking starts only when you choose Start work tracking. Location and app usage can be shared with authorized managers. Screenshots require a separate Android approval and show a screen-sharing notification.\n\nYou can stop tracking or screen sharing from this app or its notifications. No microphone, contacts, private chat database or accessibility access is requested.", 14, false, Color.DKGRAY);
    }
    private void dashboard() {
        LinearLayout account = card("Connected account"); text(account, app.api.email(), 15, false, Color.DKGRAY);
        text(account, app.api.apiUrl(), 12, false, Color.GRAY);
        button(account, "Open employee dashboard", () -> startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(app.api.apiUrl() + "/employee"))));
        LinearLayout tracking = card("Work tracking");
        text(tracking, "App usage reports show foreground app samples, not messages or typing. Live location requires an active attendance shift in FieldFlow.", 14, false, Color.DKGRAY);
        location = new CheckBox(this); location.setText("Share location during this work session"); location.setChecked(getPreferences(0).getBoolean("location", false)); tracking.addView(location);
        location.setOnCheckedChangeListener((view, checked) -> getPreferences(0).edit().putBoolean("location", checked).apply());
        button(tracking, "Enable / review Usage Access", () -> {
            try { startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS, Uri.parse("package:" + getPackageName()))); }
            catch (Exception ignored) { startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)); }
        });
        start = button(tracking, "Start work tracking", this::prepareStart);
        stop = button(tracking, "Stop work tracking", () -> { app.status("Tracking stopped"); stopService(new Intent(this, TrackingService.class)); updateStatus(); });
        LinearLayout screen = card("Screen sharing");
        text(screen, "Authorized managers can view saved screenshots of visible apps, including WhatsApp. Choose Entire screen in Android's prompt to share across apps. Protected content may appear blank.\n\nCapture follows your company's interval and excluded-app settings. Nothing is captured while this FieldFlow screen is visible.", 14, false, Color.DKGRAY);
        share = button(screen, "Approve screen sharing", this::requestCapture);
        captureNow = button(screen, "Capture next visible app", () -> {
            startService(new Intent(this, CaptureService.class).setAction(CaptureService.NOW));
            message("Switch to the app you want to capture. The next eligible frame will be uploaded.");
        });
        stopShare = button(screen, "Stop screen sharing", () -> stopService(new Intent(this, CaptureService.class)));
        declineRequest = button(screen, "Decline manager screenshot request", () -> work("Declining screenshot request…", () -> {
            app.requests.decline(); return app.requests.status;
        }, null));
        LinearLayout health = card("Device status"); diagnostics = text(health, "", 14, false, Color.DKGRAY);
        button(health, "Check connection / register device", () -> work("Checking connection…", () -> {
            JSONObject device = app.api.registerDevice(), policy = app.api.policy(); app.deviceId = device.getString("id");
            return "Device: " + device.getString("status") + " · policy v" + policy.getInt("policy_version") + "\n" + ("active".equals(device.getString("status")) ? "Ready for work tracking." : "An administrator must activate this device in Monitoring settings → Devices.");
        }, null));
        button(health, "Phone battery settings", () -> startActivity(new Intent(Settings.ACTION_SETTINGS)));
        button(account, "Sign out", () -> {
            if (working) return;
            if (app.tracking || app.capture) { message("Stop work tracking before signing out."); return; }
            work("Signing out…", () -> { app.queue.clear(); app.api.logout(); return "Signed out"; }, this::render);
        });
        updateStatus();
    }
    private void prepareStart() {
        if (working || app.tracking) return;
        if (!getSystemService(NotificationManager.class).areNotificationsEnabled()) {
            if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 10);
            } else startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName()));
            message("Enable FieldFlow notifications, then tap Start again."); return;
        }
        if (location.isChecked() && checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, 11);
            message("Choose a location permission, then tap Start again."); return;
        }
        work("Loading monitoring policy…", () -> { app.policy = app.api.policy(); return "Review your company's monitoring policy"; }, () -> {
            JSONObject policy = app.policy;
            if (!policy.optBoolean("tracking_enabled")) { message("Your administrator has disabled activity tracking."); return; }
            String disclosure = "Monitoring policy v" + policy.optInt("policy_version") + "\n\n"
                + "App names: " + (policy.optBoolean("collect_application_names") ? "collected when Usage Access is enabled" : "not collected")
                + "\nLocation: " + (location.isChecked() ? "shared during an active attendance shift" : "off for this session")
                + "\nScreenshots: " + (policy.optBoolean("collect_screenshots") ? "available after separate Android approval; every " + policy.optInt("screenshot_interval_seconds", 240) + " seconds" : "disabled")
                + "\nExcluded apps: " + policy.optJSONArray("screenshot_excluded_apps")
                + "\nRetention policy: " + policy.optInt("retention_days") + " days"
                + "\n\nAuthorized managers can view collected information. Tracking notifications remain visible. You can stop at any time.";
            new AlertDialog.Builder(this).setTitle("Start a visible work session?").setMessage(disclosure).setNegativeButton("Cancel", null)
                .setPositiveButton("Agree and start", (dialog, which) -> work("Acknowledging policy…", () -> {
                    app.api.rpc("activity_acknowledge_policy", ApiClient.json("p_policy_id", policy.getString("id"), "p_policy_version", policy.getInt("policy_version"), "p_acknowledgement_text_hash", ApiClient.hash(disclosure)));
                    return "Starting work tracking…";
                }, () -> {
                    if (isFinishing() || isDestroyed()) return;
                    try { startForegroundService(new Intent(this, TrackingService.class).putExtra("location", location.isChecked())); }
                    catch (Exception error) { message(error.getMessage()); }
                })).show();
        });
    }
    private void requestCapture() {
        if (!app.screenshotsAllowed()) { message("Start tracking first. Your administrator must enable screenshots for the policy and this device."); return; }
        if (!UsageCollector.allowed(this)) { message("Enable Usage Access first so FieldFlow can protect apps excluded by your company."); return; }
        startActivityForResult(getSystemService(MediaProjectionManager.class).createScreenCaptureIntent(), 20);
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == 20) {
            if (result != RESULT_OK || data == null) { app.captureStatus = "Screen sharing was not approved"; return; }
            if (!app.screenshotsAllowed()) { message("Tracking ended while approval was open. Start again."); return; }
            try { startForegroundService(new Intent(this, CaptureService.class).putExtra("result", result).putExtra("consent", data)); }
            catch (Exception error) { message(error.getMessage()); }
        }
    }
    private void updateStatus() {
        if (status != null) status.setText(app.status);
        if (diagnostics == null || !app.api.signedIn()) return;
        location.setEnabled(!app.tracking && !working);
        start.setEnabled(!app.tracking && !working); stop.setEnabled(app.tracking);
        share.setEnabled(app.screenshotsAllowed() && !app.capture); stopShare.setEnabled(app.capture); captureNow.setEnabled(app.capture);
        declineRequest.setEnabled(app.requests.pending() && !working);
        diagnostics.setText("Tracking: " + (app.tracking ? "on" : "off") + "\nUsage Access: " + (UsageCollector.allowed(this) ? "enabled" : "off")
            + "\nForeground app: " + app.appStatus + "\nLocation: " + app.locationStatus + "\nScreen: " + app.captureStatus
            + "\nManager request: " + app.requests.status
            + "\nSamples uploaded: " + app.sentSamples + " · queued: " + app.queue.size()
            + "\nLast sync: " + (app.lastSync == 0 ? "not yet" : new java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.getDefault()).format(new java.util.Date(app.lastSync)))
            + "\nDevice: " + (app.deviceId.isEmpty() ? "not registered yet" : app.deviceId));
    }
    private void connectionSettings() {
        if (working) return;
        LinearLayout box = new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL); box.setPadding(dp(20), dp(8), dp(20), dp(8));
        EditText api = input(box, "FieldFlow HTTPS address", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI); api.setText(app.api.apiUrl());
        EditText supabase = input(box, "Supabase HTTPS address", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI); supabase.setText(app.api.supabaseUrl());
        EditText key = input(box, "Supabase publishable / anon key", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD); key.setText(app.api.key());
        text(box, "Use your public client key only. Never enter a service-role or secret key. Local testing requires a trusted HTTPS address reachable from the phone.", 13, false, Color.DKGRAY);
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("Connection settings").setView(box).setNegativeButton("Cancel", null).setPositiveButton("Save", null).create();
        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
            try {
                String apiUrl = TrackingRules.httpsOrigin(api.getText().toString()), supabaseUrl = TrackingRules.httpsOrigin(supabase.getText().toString());
                String publicKey = key.getText().toString().trim();
                if (publicKey.startsWith("sb_secret_") || publicKey.isEmpty()) throw new IllegalArgumentException("Enter a publishable or anon key.");
                if (publicKey.startsWith("ey")) {
                    String[] parts = publicKey.split("\\.");
                    JSONObject claims = new JSONObject(new String(android.util.Base64.decode(parts[1], android.util.Base64.URL_SAFE | android.util.Base64.NO_WRAP | android.util.Base64.NO_PADDING), java.nio.charset.StandardCharsets.UTF_8));
                    if (!"anon".equals(claims.optString("role"))) throw new IllegalArgumentException("Only an anon JWT may be used as a client key.");
                } else if (!publicKey.startsWith("sb_publishable_")) throw new IllegalArgumentException("Enter a publishable or anon key.");
                getSharedPreferences("settings", 0).edit().putString("apiUrl", apiUrl).putString("supabaseUrl", supabaseUrl).putString("supabaseKey", publicKey).apply();
                message("Connection settings saved"); dialog.dismiss();
            } catch (Exception error) { message(error.getMessage()); }
        })); dialog.show();
    }
    interface Job { String run() throws Exception; }
    private void work(String progress, Job job, Runnable complete) {
        if (working) return; working = true; message(progress);
        app.io.execute(() -> {
            try { String result = job.run(); main.post(() -> { working = false; if (isFinishing() || isDestroyed()) return; message(result); if (complete != null) complete.run(); }); }
            catch (Exception error) { main.post(() -> { working = false; if (!isFinishing() && !isDestroyed()) message(error.getMessage()); }); }
        });
    }
    private void message(String value) { app.status(value == null ? "The operation could not be completed." : value); updateStatus(); }
}
