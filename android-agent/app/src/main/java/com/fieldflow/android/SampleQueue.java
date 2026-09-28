package com.fieldflow.android;

import org.json.JSONArray;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;

/** Bounded encrypted queue. Every item retains its original owner, session and id. */
final class SampleQueue {
    private final SecureStore store;
    private JSONArray items = new JSONArray();
    private volatile int count;
    SampleQueue(SecureStore store) {
        this.store = store;
        try { byte[] data = store.read("samples.bin"); if (data != null) items = new JSONArray(new String(data, StandardCharsets.UTF_8)); }
        catch (Exception ignored) { store.remove("samples.bin"); }
        count = items.length();
    }
    int size() { return count; }
    synchronized void clear() { items = new JSONArray(); count = 0; store.remove("samples.bin"); }
    synchronized void add(String owner, String device, String session, JSONObject sample) throws Exception {
        if (items.length() >= 1000) items.remove(0);
        items.put(ApiClient.json("owner", owner, "device", device, "session", session, "sample", sample)); save();
    }
    synchronized int flush(ApiClient api) throws Exception {
        int sent = 0;
        // One bounded batch per tick prevents a backlog starving policy/stop requests.
        if (items.length() == 0) return 0;
        JSONObject first = items.getJSONObject(0);
        if (!first.getString("owner").equals(api.userId())) { clear(); return 0; }
        JSONArray batch = new JSONArray();
        for (int i = 0; i < items.length() && batch.length() < 100; i++) {
            JSONObject item = items.getJSONObject(i);
            if (!item.getString("session").equals(first.getString("session")) || !item.getString("owner").equals(first.getString("owner"))) break;
            batch.put(item.getJSONObject("sample"));
        }
        JSONObject result = ApiClient.row(api.rpc("activity_ingest_samples", ApiClient.json("p_device_id", first.getString("device"), "p_tracking_session_id", first.getString("session"), "p_samples", batch)));
        int accounted = result.optInt("acceptedCount") + result.optInt("duplicateCount") + result.optInt("rejectedCount");
        if (accounted != batch.length()) throw new IllegalStateException("Incomplete sample acknowledgement. Saved samples will retry.");
        sent = result.optInt("acceptedCount");
        for (int i = 0; i < batch.length(); i++) items.remove(0);
        save();
        String firstDate = batch.getJSONObject(0).getString("capturedAt").substring(0, 10);
        String lastDate = batch.getJSONObject(batch.length() - 1).getString("capturedAt").substring(0, 10);
        api.rpc("activity_refresh_daily_summaries", ApiClient.json("p_start_date", firstDate, "p_end_date", lastDate));
        return sent;
    }
    private void save() throws Exception { count = items.length(); store.write("samples.bin", items.toString().getBytes(StandardCharsets.UTF_8)); }
}
