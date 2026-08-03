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
  return {
    async getItem(key) {
      try {
        const countValue = await invokeImpl("secure_read", { key: `${key}:chunks` });
        const count = Number(countValue);
        if (!Number.isInteger(count) || count < 1 || count > MAX_SECURE_CHUNKS) return null;
        const chunks = await Promise.all(
          Array.from({ length: count }, (_, index) => invokeImpl("secure_read", { key: `${key}:${index}` }))
        );
        return chunks.every(chunk => typeof chunk === "string") ? chunks.join("") : null;
      } catch (error) {
        throw storageError("read", error);
      }
    },
    async setItem(key, value) {
      try {
        const chunks = splitSecureValue(value);
        if (chunks.length > MAX_SECURE_CHUNKS) {
          throw new Error("The session is larger than the secure storage limit.");
        }
        const previousCount = Number(await invokeImpl("secure_read", { key: `${key}:chunks` })) || 0;
        await Promise.all(
          chunks.map((chunk, index) => invokeImpl("secure_write", { key: `${key}:${index}`, value: chunk }))
        );
        await invokeImpl("secure_write", { key: `${key}:chunks`, value: String(chunks.length) });
        await Promise.all(
          Array.from({ length: Math.max(0, previousCount - chunks.length) }, (_, offset) =>
            invokeImpl("secure_delete", { key: `${key}:${chunks.length + offset}` })
          )
        );
      } catch (error) {
        throw storageError("save", error);
      }
    },
    async removeItem(key) {
      try {
        const count = Number(await invokeImpl("secure_read", { key: `${key}:chunks` })) || 0;
        await Promise.all(
          Array.from(
            { length: Math.min(Math.max(count, 0), MAX_SECURE_CHUNKS) },
            (_, index) => invokeImpl("secure_delete", { key: `${key}:${index}` })
          )
        );
        await invokeImpl("secure_delete", { key: `${key}:chunks` });
      } catch (error) {
        throw storageError("remove", error);
      }
    }
  };
}

export const secureSessionStorage = createSecureSessionStorage();
