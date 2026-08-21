import "server-only";

// The export cache. Lives in the existing `metadata` bucket under a
// `certs-pdf/` prefix rather than a bucket of its own, so no storage
// provisioning has to happen before this ships. Not under lib/db/**, so the
// @supabase fence applies: the service client comes from lib/db/mutations.

import { dbConfigured, getServiceClient } from "@/lib/db/mutations";
import type { Locale } from "@/lib/i18n/locales";

const BUCKET = "metadata";

/**
 * Content-addressed by the artifact hash, plus the two things that change the
 * bytes for the same certificate: the language of the audit trail, and whether
 * a seal was applied. A cached object is therefore always the exact file the
 * builder would produce right now.
 */
export function pdfCachePath(
  artifactSha256Hex: string,
  locale: Locale,
  sealed: boolean,
): string {
  return `certs-pdf/${artifactSha256Hex}-${locale}${sealed ? "-sealed" : ""}.pdf`;
}

/** The cached export, or null on any miss — a cache is never worth a 500. */
export async function readCachedPdf(path: string): Promise<Uint8Array | null> {
  if (!dbConfigured) return null;

  const { data, error } = await getServiceClient()
    .storage.from(BUCKET)
    .download(path);
  if (error || !data) return null;

  return new Uint8Array(await data.arrayBuffer());
}

/** Best-effort write-through; a failed upload costs a rebuild, not a request. */
export async function writeCachedPdf(
  path: string,
  pdf: Uint8Array,
): Promise<void> {
  if (!dbConfigured) return;

  const { error } = await getServiceClient()
    .storage.from(BUCKET)
    .upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (error) {
    console.warn(`[pdf] cache write failed for ${path}: ${error.message}`);
  }
}
