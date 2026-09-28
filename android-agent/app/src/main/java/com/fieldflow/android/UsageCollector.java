package com.fieldflow.android;

import android.app.AppOpsManager;
import android.app.KeyguardManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.os.PowerManager;

final class UsageCollector {
    record Foreground(String packageName, String label, boolean locked) {}
    private String foreground = "";
    private long since;
    private final Context context;
    UsageCollector(Context context, long start) { this.context = context; since = start; }
    static boolean allowed(Context context) {
        AppOpsManager manager = context.getSystemService(AppOpsManager.class);
        return manager.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, android.os.Process.myUid(), context.getPackageName()) == AppOpsManager.MODE_ALLOWED;
    }
    synchronized Foreground current() {
        boolean locked = !context.getSystemService(PowerManager.class).isInteractive() || context.getSystemService(KeyguardManager.class).isKeyguardLocked();
        if (!allowed(context)) { foreground = ""; return new Foreground("", "", locked); }
        long now = System.currentTimeMillis();
        UsageEvents events = context.getSystemService(UsageStatsManager.class).queryEvents(since, now);
        since = now;
        if (events != null) {
            UsageEvents.Event event = new UsageEvents.Event();
            while (events.hasNextEvent()) {
                events.getNextEvent(event);
                if (event.getEventType() == UsageEvents.Event.MOVE_TO_FOREGROUND) foreground = event.getPackageName();
                else if (event.getEventType() == UsageEvents.Event.MOVE_TO_BACKGROUND && foreground.equals(event.getPackageName())) foreground = "";
            }
        }
        String label = foreground;
        try { label = context.getPackageManager().getApplicationLabel(context.getPackageManager().getApplicationInfo(foreground, 0)).toString(); }
        catch (Exception ignored) { /* Package visibility can limit labels; package IDs remain useful. */ }
        return new Foreground(locked ? "" : foreground, locked ? "" : label, locked);
    }
}
