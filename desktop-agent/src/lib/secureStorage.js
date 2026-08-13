import { invoke } from "@tauri-apps/api/core";

// Windows Credential Manager limits a generic credential blob to 2,560 bytes.
// keyring stores passwords as UTF-16 on Windows, so stay comfortably below the
// 1,280 UTF-16-code-unit ceiling.
export const SECURE_CHUNK_CODE_UNITS = 1000;
const MAX_SECURE_CHUNKS = 20;

export function splitSecureValue(value) {
  if (!value) return [""];
  const chunks = [];
  let start = 0;
  while (start < value.length) {
    let end = Math.min(start + SECURE_CHUNK_CODE_UNITS, value.length);
    const finalCodeUnit = value.charCodeAt(end - 1);
    if (end < value.length && finalCodeUnit >= 0xD800 && finalCodeUnit <= 0xDBFF) {
      end -= 1;
    }
    chunks.push(value.slice(start, end));
    start = end;
  }
  return chunks;
}

function storageError(operation, error) {
  const detail = typeof error === "string" ? error : error?.message;
  return new Error(
    detail
      ? `Windows Credential Manager could not ${operation} the secure session: ${detail}`
      : `Windows Credential Manager could not ${operation} the secure session.`
  );
}

export function createSecureSessionStorage(invokeImpl = invoke) {
  let operation = Promise.resolve();

  function exclusive(callback) {
    const result = operation.then(callback, callback);
    operation = result.catch(() => {});
    return result;
  }

  async function readLegacy(key) {
    const countValue = await invokeImpl("secure_read", { key: `${key}:chunks` });
    const count = Number(countValue);
    if (!Number.isInteger(count) || count < 1 || count > MAX_SECURE_CHUNKS) return null;
    const chunks = [];
    for (let index = 0; index < count; index += 1) {
      const chunk = await invokeImpl("secure_read", { key: `${key}:${index}` });
      if (typeof chunk !== "string") return null;
      chunks.push(chunk);
    }
    return chunks.join("");
  }

  function generationKey(key, generation, suffix) {
    return `${key}:g:${generation}:${suffix}`;
  }

  async function readGeneration(key, generation) {
    if (!generation) return null;
    const countValue = await invokeImpl("secure_read", { key: generationKey(key, generation, "chunks") });
    const count = Number(countValue);
    if (!Number.isInteger(count) || count < 1 || count > MAX_SECURE_CHUNKS) return null;
    const chunks = [];
    for (let index = 0; index < count; index += 1) {
      const chunk = await invokeImpl("secure_read", { key: generationKey(key, generation, index) });
      if (typeof chunk !== "string") return null;
      chunks.push(chunk);
    }
    return chunks.join("");
  }

  async function readManifest(key) {
    const value = await invokeImpl("secure_read", { key: `${key}:manifest` });
    if (!value) return { active: null, backup: null };
    try {
      const parsed = JSON.parse(value);
      return {
        active: typeof parsed.active === "string" ? parsed.active : null,
        backup: typeof parsed.backup === "string" ? parsed.backup : null
      };
    } catch {
      return { active: null, backup: null };
    }
  }

  async function deleteGeneration(key, generation) {
    if (!generation) return;
    const count = Number(await invokeImpl("secure_read", { key: generationKey(key, generation, "chunks") })) || 0;
    for (let index = 0; index < Math.min(Math.max(count, 0), MAX_SECURE_CHUNKS); index += 1) {
      await invokeImpl("secure_delete", { key: generationKey(key, generation, index) });
    }
    await invokeImpl("secure_delete", { key: generationKey(key, generation, "chunks") });
  }

  return {
    async getItem(key) {
      return exclusive(async () => {
        try {
          const manifest = await readManifest(key);
          const active = await readGeneration(key, manifest.active);
          if (active !== null) return active;
          const backup = await readGeneration(key, manifest.backup);
          if (backup !== null) return backup;
          return readLegacy(key);
        } catch (error) {
          throw storageError("read", error);
        }
      });
    },
    async setItem(key, value) {
      return exclusive(async () => {
        const generation = globalThis.crypto?.randomUUID?.().replaceAll("-", "").slice(0, 16)
          || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        let chunkCount = 0;
        let committed = false;
        let obsoleteGeneration = null;
        try {
          const chunks = splitSecureValue(value);
          chunkCount = chunks.length;
          if (chunks.length > MAX_SECURE_CHUNKS) {
            throw new Error("The session is larger than the secure storage limit.");
          }
          const previous = await readManifest(key);
          for (let index = 0; index < chunks.length; index += 1) {
            await invokeImpl("secure_write", { key: generationKey(key, generation, index), value: chunks[index] });
          }
          await invokeImpl("secure_write", { key: generationKey(key, generation, "chunks"), value: String(chunks.length) });
          if (await readGeneration(key, generation) !== value) {
            throw new Error("The secure session could not be verified after saving.");
          }
          await invokeImpl("secure_write", {
            key: `${key}:manifest`,
            value: JSON.stringify({ active: generation, backup: previous.active || previous.backup || null })
          });
          committed = true;
          obsoleteGeneration = previous.backup && previous.backup !== previous.active
            ? previous.backup
            : null;
        } catch (error) {
          if (!committed) {
            for (let index = 0; index < chunkCount; index += 1) {
              await invokeImpl("secure_delete", { key: generationKey(key, generation, index) }).catch(() => {});
            }
            await invokeImpl("secure_delete", { key: generationKey(key, generation, "chunks") }).catch(() => {});
          }
          throw storageError("save", error);
        }
        if (obsoleteGeneration) {
          await deleteGeneration(key, obsoleteGeneration).catch(() => {});
        }
      });
    },
    async removeItem(key) {
      return exclusive(async () => {
        try {
          const manifest = await readManifest(key);
          await deleteGeneration(key, manifest.active);
          if (manifest.backup !== manifest.active) await deleteGeneration(key, manifest.backup);
          await invokeImpl("secure_delete", { key: `${key}:manifest` });
          const legacyCount = Number(await invokeImpl("secure_read", { key: `${key}:chunks` })) || 0;
          for (let index = 0; index < Math.min(Math.max(legacyCount, 0), MAX_SECURE_CHUNKS); index += 1) {
            await invokeImpl("secure_delete", { key: `${key}:${index}` });
          }
          await invokeImpl("secure_delete", { key: `${key}:chunks` });
        } catch (error) {
          throw storageError("remove", error);
        }
      });
    }
  };
}

export const secureSessionStorage = createSecureSessionStorage();
