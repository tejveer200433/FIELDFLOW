package com.fieldflow.android;

import android.content.Context;
import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.UUID;

class ApiClient {
    static final class ApiException extends Exception {
        final int status;
        ApiException(int status, String message) { super(message); this.status = status; }
    }
    private final Context context;
    private final SecureStore store;
    private volatile JSONObject auth;
    ApiClient(Context context, SecureStore store) {
        this.context = context; this.store = store;
        try { byte[] saved = store.read("auth.bin"); if (saved != null) auth = new JSONObject(new String(saved, StandardCharsets.UTF_8)); }
        catch (Exception ignored) { store.remove("auth.bin"); }
    }
    static JSONObject json(Object... pairs) throws Exception {
        JSONObject result = new JSONObject();
        for (int i = 0; i < pairs.length; i += 2) result.put((String) pairs[i], pairs[i + 1] == null ? JSONObject.NULL : pairs[i + 1]);
        return result;
    }
    static JSONObject row(Object payload) throws Exception {
        if (payload instanceof JSONArray array) {
            if (array.length() == 0) throw new ApiException(404, "The requested record was not found.");
            return array.getJSONObject(0);
        }
        return (JSONObject) payload;
    }
    String setting(String name, String fallback) { return context.getSharedPreferences("settings", 0).getString(name, fallback); }
    String apiUrl() { return setting("apiUrl", BuildConfig.API_URL); }
    String supabaseUrl() { return setting("supabaseUrl", BuildConfig.SUPABASE_URL); }
    String key() { return setting("supabaseKey", BuildConfig.SUPABASE_KEY); }
    boolean signedIn() { return auth != null; }
    String userId() { JSONObject current = auth; return current == null ? "" : current.optJSONObject("user").optString("id"); }
    String email() { JSONObject current = auth; return current == null ? "" : current.optJSONObject("user").optString("email"); }
    synchronized void login(String email, String password) throws Exception {
        TrackingRules.httpsOrigin(supabaseUrl()); TrackingRules.httpsOrigin(apiUrl());
        if (key().trim().isEmpty()) throw new IllegalArgumentException("Set the Supabase public key in Connection settings.");
        JSONObject next = row(raw(supabaseUrl() + "/auth/v1/token?grant_type=password", "POST", json("email", email, "password", password).toString().getBytes(StandardCharsets.UTF_8), null, "application/json", true));
        saveAuth(next);
        try {
            JSONArray profiles = query("profiles?select=id,active,approval_status&id=eq." + userId());
            if (profiles.length() != 1 || !profiles.getJSONObject(0).optBoolean("active") || !"approved".equals(profiles.getJSONObject(0).optString("approval_status")))
                throw new ApiException(403, "Your account must be active and approved.");
            JSONObject access = row(rpc("get_my_access_context", json()));
            JSONArray permissions = access.optJSONArray("permissions");
            if (!access.optBoolean("isOwner") && (permissions == null || !permissions.toString().contains("\"activity.view_self\"")))
                throw new ApiException(403, "Your role needs My Activity access.");
        } catch (Exception error) { logout(); throw error; }
    }
    private void saveAuth(JSONObject next) throws Exception {
        if (!next.has("expires_at")) next.put("expires_at", System.currentTimeMillis() / 1000 + next.optLong("expires_in", 3600));
        store.write("auth.bin", next.toString().getBytes(StandardCharsets.UTF_8)); auth = next;
    }
    synchronized void logout() { auth = null; store.remove("auth.bin"); store.remove("samples.bin"); }
    private String token(boolean refresh) throws Exception {
        if (auth == null) throw new ApiException(401, "Sign in to continue.");
        if (refresh || auth.optLong("expires_at") <= System.currentTimeMillis() / 1000 + 90) {
            JSONObject next = row(raw(supabaseUrl() + "/auth/v1/token?grant_type=refresh_token", "POST",
                json("refresh_token", auth.getString("refresh_token")).toString().getBytes(StandardCharsets.UTF_8), null, "application/json", true));
            if (!next.getJSONObject("user").getString("id").equals(userId())) throw new ApiException(401, "Account changed. Sign in again.");
            saveAuth(next);
        }
        return auth.getString("access_token");
    }
    private synchronized Object request(String url, String method, byte[] body, String type, boolean supabase) throws Exception {
        String access = token(false);
        try { return raw(url, method, body, access, type, supabase); }
        catch (ApiException error) {
            if (error.status != 401) throw error;
            return raw(url, method, body, token(true), type, supabase);
        }
    }
    private Object raw(String url, String method, byte[] body, String access, String type, boolean supabase) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(15_000); connection.setReadTimeout(20_000); connection.setInstanceFollowRedirects(false);
        connection.setRequestMethod(method); connection.setRequestProperty("Accept", "application/json");
        if (supabase) connection.setRequestProperty("apikey", key());
        if (access != null) connection.setRequestProperty("Authorization", "Bearer " + access);
        try {
            if (body != null) {
                connection.setDoOutput(true); connection.setRequestProperty("Content-Type", type);
                try (var output = connection.getOutputStream()) { output.write(body); }
            }
            int status = connection.getResponseCode();
            InputStream stream = status < 400 ? connection.getInputStream() : connection.getErrorStream();
            String text;
            try (InputStream input = stream; var output = new java.io.ByteArrayOutputStream()) {
                if (input != null) {
                    byte[] buffer = new byte[8192]; int count;
                    while ((count = input.read(buffer)) != -1) {
                        if (output.size() + count > 2_000_000) throw new ApiException(502, "Response is too large.");
                        output.write(buffer, 0, count);
                    }
                }
                text = new String(output.toByteArray(), StandardCharsets.UTF_8);
            }
            Object payload;
            try { payload = text.isEmpty() ? new JSONObject() : new JSONTokener(text).nextValue(); }
            catch (Exception ignored) { payload = new JSONObject(); }
            if (status < 200 || status >= 300) {
                JSONObject error = payload instanceof JSONObject object ? object : new JSONObject();
                Object nested = error.opt("error");
                String message = nested instanceof JSONObject object ? object.optString("message") : error.optString("msg", error.optString("message", error.optString("error_description", "Request failed (" + status + ").")));
                throw new ApiException(status, message.trim().isEmpty() ? "Request failed (" + status + ")." : message);
            }
            return payload;
        } finally { connection.disconnect(); }
    }
    Object rpc(String function, JSONObject body) throws Exception { return request(supabaseUrl() + "/rest/v1/rpc/" + function, "POST", body.toString().getBytes(StandardCharsets.UTF_8), "application/json", true); }
    JSONArray query(String query) throws Exception { return (JSONArray) request(supabaseUrl() + "/rest/v1/" + query, "GET", null, "application/json", true); }
    JSONObject web(String path, JSONObject body) throws Exception { return row(request(apiUrl() + path, "POST", body.toString().getBytes(StandardCharsets.UTF_8), "application/json", false)); }
    void upload(String path, byte[] bytes) throws Exception {
        if (!path.startsWith(userId() + "/") || !path.matches("[a-zA-Z0-9/_\\.-]+") || path.contains("..")) throw new IllegalArgumentException("Invalid private screenshot path.");
        request(supabaseUrl() + "/storage/v1/object/activity-screenshots/" + path, "POST", bytes, "image/jpeg", true);
    }
    JSONObject policy() throws Exception { return row(query("monitoring_policies?select=*&is_active=eq.true")); }
    JSONObject registerDevice() throws Exception {
        var preferences = context.getSharedPreferences("device", 0);
        String installation = preferences.getString("installation", "");
        if (installation.isEmpty()) { installation = UUID.randomUUID().toString(); preferences.edit().putString("installation", installation).commit(); }
        JSONObject device = row(rpc("activity_register_device", json("p_device_name", "Android · " + android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL,
            "p_platform", "other", "p_operating_system_version", "Android " + android.os.Build.VERSION.RELEASE + " (API " + android.os.Build.VERSION.SDK_INT + ")",
            "p_agent_version", "android-" + BuildConfig.VERSION_NAME, "p_device_identifier_hash", hash(installation + ":" + userId()))));
        if (!device.optString("agent_version").equals("android-" + BuildConfig.VERSION_NAME)) {
            device = row(rpc("activity_update_device", json("p_device_id", device.getString("id"), "p_action", "update-agent", "p_agent_version", "android-" + BuildConfig.VERSION_NAME)));
        }
        return device;
    }
    static String hash(String input) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(input.getBytes(StandardCharsets.UTF_8));
        StringBuilder result = new StringBuilder(); for (byte item : digest) result.append(String.format("%02x", item)); return result.toString();
    }
}
