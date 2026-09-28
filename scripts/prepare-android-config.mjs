import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const environment = await readFile(new URL(".env.local", root), "utf8").catch(() => "");
const publicValues = {};
for (const line of environment.split(/\r?\n/)) {
  const match = line.match(/^(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY)\s*=\s*(.*)$/);
  if (match) publicValues[match[1]] = match[2].trim().replace(/^(["'])(.*)\1$/, "$2");
}
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || publicValues.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || publicValues.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const apiUrl = process.env.FIELDFLOW_ANDROID_API_URL || "https://fieldflow-henna.vercel.app";
if (!supabaseUrl || !supabaseKey) throw new Error("Set the public Supabase URL and publishable/anon key before building.");
if (supabaseKey.startsWith("sb_secret_")) throw new Error("A secret key must never be bundled in an Android app.");
if (!supabaseKey.startsWith("sb_publishable_")) {
  const claims = JSON.parse(Buffer.from(supabaseKey.split(".")[1] || "", "base64url").toString());
  if (claims.role !== "anon") throw new Error("Only the public anon role may be bundled in an Android app.");
}
const escape = value => value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll("\r", "\\r").replaceAll("=", "\\=").replaceAll(":", "\\:");
const destination = new URL("android-agent/fieldflow.local.properties", root);
await writeFile(destination, `apiUrl=${escape(apiUrl)}\nsupabaseUrl=${escape(supabaseUrl)}\nsupabaseKey=${escape(supabaseKey)}\n`);
console.log(`Prepared public Android connection settings in ${fileURLToPath(destination)}. No server secrets copied.`);
