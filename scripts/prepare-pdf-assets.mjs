import { cp, mkdir, readFile } from "node:fs/promises";

// Serve the worker and font/decoder assets locally; no receipt data or signed
// URL is sent to a third-party PDF viewer or CDN.
const source = new URL("../node_modules/pdfjs-dist/", import.meta.url);
const { version } = JSON.parse(await readFile(new URL("package.json", source), "utf8"));
const destination = new URL(`../public/pdfjs/${version}/`, import.meta.url);
await mkdir(destination, { recursive: true });
await cp(new URL("build/pdf.worker.min.mjs", source), new URL("pdf.worker.min.mjs", destination));
for (const directory of ["cmaps", "standard_fonts", "wasm"]) {
  await cp(new URL(directory, source), new URL(directory, destination), { recursive: true });
}
console.log(`Prepared local PDF viewer assets (${version}).`);
