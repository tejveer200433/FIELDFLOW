package com.fieldflow.android;

import java.net.URI;
import java.util.Locale;

final class TrackingRules {
    static String httpsOrigin(String raw) {
        URI uri = URI.create(raw.trim());
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null
            || uri.getQuery() != null || uri.getFragment() != null || !(uri.getPath().isEmpty() || "/".equals(uri.getPath()))) {
            throw new IllegalArgumentException("Enter an HTTPS address without a path, credentials or query.");
        }
        return raw.trim().replaceAll("/+$", "");
    }
    static int interval(int configured, int minimum, int maximum) { return Math.max(minimum, Math.min(maximum, configured)); }
    static boolean policyFresh(long checkedAt, long now) { return checkedAt > 0 && now >= checkedAt && now - checkedAt <= 120_000; }
    static boolean excluded(String packageName, String appName, String entry) {
        String rule = entry.trim().toLowerCase(Locale.ROOT);
        return rule.equals(packageName.toLowerCase(Locale.ROOT)) || rule.equals(appName.toLowerCase(Locale.ROOT));
    }
    static boolean validFix(double latitude, double longitude, long ageMillis) {
        return Double.isFinite(latitude) && latitude >= -90 && latitude <= 90
            && Double.isFinite(longitude) && longitude >= -180 && longitude <= 180 && ageMillis >= 0 && ageMillis <= 90_000;
    }
    static boolean requestApplies(String owner, String user, String requestSession, String session, long expiresAt, long now) {
        return !user.isEmpty() && !session.isEmpty() && owner.equals(user) && requestSession.equals(session) && expiresAt > now;
    }
}
