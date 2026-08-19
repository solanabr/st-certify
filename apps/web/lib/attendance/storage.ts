import "server-only";

// Mirrors lib/render/storage.ts's content-addressed upload, but for the
// `attendance` bucket. Unlike render's best-effort `{stored: false}` return
// (a cert can be re-rendered later), event creation cannot proceed without a
// stored image/metadata URL — so failures throw STORAGE_FAILED instead.
// Not under lib/db/**, so the @supabase fence applies here: get the service
// client via getServiceClient rather than importing @supabase/supabase-js.

import { createHash } from "node:crypto";
import { fail } from "@/lib/errors";
import { dbConfigured, getServiceClient } from "@/lib/db/mutations";

const NOT_CONFIGURED_DETAIL =
  "Supabase não configurado (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes).";

const IMAGE_EXTENSION: Record<
  "image/png" | "image/jpeg" | "image/webp",
  string
> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/**
 * Uploads an event image, content-addressed by its own sha256
 * (`{sha256}.png|jpg|webp`, upsert: true — idempotent re-upload ⇒ same bytes
 * ⇒ same path).
 */
export async function storeAttendanceImage(
  bytes: Buffer,
  contentType: "image/png" | "image/jpeg" | "image/webp",
): Promise<string> {
  if (!dbConfigured) {
    fail("STORAGE_FAILED", "Falha ao enviar imagem do evento.", {
      retryable: true,
      detail: NOT_CONFIGURED_DETAIL,
    });
  }
  const supabase = getServiceClient();
  const sha256Hex = createHash("sha256").update(bytes).digest("hex");
  const imagePath = `${sha256Hex}.${IMAGE_EXTENSION[contentType]}`;

  const { error } = await supabase.storage
    .from("attendance")
    .upload(imagePath, bytes, { contentType, upsert: true });
  if (error) {
    fail("STORAGE_FAILED", "Falha ao enviar imagem do evento.", {
      retryable: true,
      detail: error.message,
    });
  }

  return supabase.storage.from("attendance").getPublicUrl(imagePath).data
    .publicUrl;
}

/** Uploads the event metadata JSON, content-addressed by its own sha256 (`{sha256}.json`). */
export async function storeAttendanceMetadata(json: unknown): Promise<string> {
  if (!dbConfigured) {
    fail("STORAGE_FAILED", "Falha ao enviar metadata do evento.", {
      retryable: true,
      detail: NOT_CONFIGURED_DETAIL,
    });
  }
  const supabase = getServiceClient();
  const bytes = Buffer.from(JSON.stringify(json, null, 2), "utf8");
  const sha256Hex = createHash("sha256").update(bytes).digest("hex");
  const metadataPath = `${sha256Hex}.json`;

  const { error } = await supabase.storage
    .from("attendance")
    .upload(metadataPath, bytes, {
      contentType: "application/json",
      upsert: true,
    });
  if (error) {
    fail("STORAGE_FAILED", "Falha ao enviar metadata do evento.", {
      retryable: true,
      detail: error.message,
    });
  }

  return supabase.storage.from("attendance").getPublicUrl(metadataPath).data
    .publicUrl;
}
