// Browser-only helpers for the template upload step. No server code, no
// Node APIs — everything here runs in the admin's tab, which is what lets
// the designer degrade cleanly when Supabase isn't configured (the client
// already has bytes, dimensions, and a hash before it ever calls the API).

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export type ImageErrorCode =
  "canvas-unavailable" | "encode-failed" | "read-failed";

/**
 * Failures here carry a stable code, not a message: this module has no
 * locale (it isn't a React component and can't call `useT`), so
 * `use-template-upload.ts` maps the code to a translated string.
 */
export class ImageProcessingError extends Error {
  readonly code: ImageErrorCode;

  constructor(code: ImageErrorCode) {
    super(code);
    this.name = "ImageProcessingError";
    this.code = code;
  }
}

/** Checks the 8-byte PNG signature — a cheap client-side pre-check; the server re-checks the same bytes (never trust the client). */
export async function isPngFile(file: File): Promise<boolean> {
  const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  return PNG_MAGIC.every((byte, i) => header[i] === byte);
}

export interface DownscaledImage {
  blob: Blob;
  width: number;
  height: number;
}

/**
 * Re-encodes `file` as a PNG no larger than `maxLongEdge` on its long edge
 * (no-op resize if already smaller). Runs entirely via `<canvas>` — the
 * output bytes are what gets hashed and uploaded, so the hash the admin
 * sees in the designer is the hash that ends up on-chain.
 */
export async function downscaleImageFile(
  file: File,
  maxLongEdge: number,
): Promise<DownscaledImage> {
  const bitmap = await createImageBitmap(file);
  try {
    const longEdge = Math.max(bitmap.width, bitmap.height);
    const scale = longEdge > maxLongEdge ? maxLongEdge / longEdge : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new ImageProcessingError("canvas-unavailable");
    }
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) {
      throw new ImageProcessingError("encode-failed");
    }
    return { blob, width, height };
  } finally {
    bitmap.close();
  }
}

/** WebCrypto sha256, lowercase hex — matches `lib/render/layout.ts`'s server-side hex format so a client-computed hash and the server's are directly comparable. */
export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Data URI (not an object URL): survives independent of blob lifetime, matching the brief's "hold bytes in memory + data-URI preview" degrade path. */
export function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () =>
      reject(reader.error ?? new ImageProcessingError("read-failed"));
    reader.readAsDataURL(blob);
  });
}
