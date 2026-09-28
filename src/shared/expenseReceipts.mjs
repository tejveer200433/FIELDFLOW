export const RECEIPT_BUCKET = "expense-receipts";
export const MAX_RECEIPT_BYTES = 4 * 1024 * 1024;
export const RECEIPT_TYPES = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

export function receiptFileError(file) {
  if (!file || !file.size) return "Choose a non-empty receipt photo or PDF.";
  if (!Object.hasOwn(RECEIPT_TYPES, file.type)) return "Use a PDF, JPG, PNG, or WebP receipt.";
  if (file.size > MAX_RECEIPT_BYTES) return "The receipt must be 4 MB or smaller.";
  return null;
}

export function receiptSignatureMatches(bytes, type) {
  const begins = signature => signature.every((byte, index) => bytes[index] === byte);
  if (type === "application/pdf") return begins([0x25, 0x50, 0x44, 0x46, 0x2d]);
  if (type === "image/jpeg") return begins([0xff, 0xd8, 0xff]);
  if (type === "image/png") return begins([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (type === "image/webp") return begins([0x52, 0x49, 0x46, 0x46]) && [0x57, 0x45, 0x42, 0x50].every((byte, index) => bytes[index + 8] === byte);
  return false;
}

export function isPrivateReceiptPath(path) {
  return typeof path === "string" && /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/.test(path);
}
