import { invoke } from "@tauri-apps/api/core";

export const secureSessionStorage = {
  async getItem(key) {
    const countValue = await invoke("secure_read", { key: `${key}:chunks` });
    const count = Number(countValue);
    if (!Number.isInteger(count) || count < 1 || count > 20) return null;
    const chunks = await Promise.all(
      Array.from({ length: count }, (_, index) => invoke("secure_read", { key: `${key}:${index}` }))
    );
    return chunks.every(chunk => typeof chunk === "string") ? chunks.join("") : null;
  },
  async setItem(key, value) {
    const chunks = value.match(/[\s\S]{1,1500}/g) || [""];
    const previousCount = Number(await invoke("secure_read", { key: `${key}:chunks` })) || 0;
    await Promise.all(chunks.map((chunk, index) => invoke("secure_write", { key: `${key}:${index}`, value: chunk })));
    await invoke("secure_write", { key: `${key}:chunks`, value: String(chunks.length) });
    await Promise.all(
      Array.from({ length: Math.max(0, previousCount - chunks.length) }, (_, offset) =>
        invoke("secure_delete", { key: `${key}:${chunks.length + offset}` })
      )
    );
  },
  async removeItem(key) {
    const count = Number(await invoke("secure_read", { key: `${key}:chunks` })) || 0;
    await Promise.all(
      Array.from({ length: Math.min(count, 20) }, (_, index) => invoke("secure_delete", { key: `${key}:${index}` }))
    );
    await invoke("secure_delete", { key: `${key}:chunks` });
  }
};
