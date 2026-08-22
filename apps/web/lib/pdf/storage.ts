import "server-only";

// The export cache. Lives in the existing `metadata` bucket under a
// `certs-pdf/` prefix rather than a bucket of its own, so no storage
// provisioning has to happen before this ships. Not under lib/db/**, so the
// @supabase fence applies: the service client comes from lib/db/mutations.

import { dbConfigured, getServiceClient } from "@/lib/db/mutations";
import type { Locale } from "@/lib/i18n/locales";
import { sealFingerprint } from "./seal";

const BUCKET = "metadata";

/**
 * Content-addressed by the artifact hash, plus everything else that changes the
 * bytes for the same certificate: the language of the audit trail, and — when
 * sealed — which key signed it. The key belongs in the path because a signature
 * is a function of it: without the fingerprint, rotating `SEAL_P12_BASE64`
 * (after an expiry, or a compromise) leaves every already-cached export served
 * under the retired key indefinitely, which is exactly the case rotation
 * exists to end. A cached object is therefore always the exact file the builder
 * would produce right now.
 */
export function pdfCachePath(
  artifactSha256Hex: string,
  locale: Locale,
  sealed: boolean,
): string {
  const seal = sealed ? `-sealed-${sealFingerprint()}` : "";
  return `certs-pdf/${artifactSha256Hex}-${locale}${seal}.pdf`;
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

/**
 * Sweeps every cached export for one artifact — all locales, sealed or not,
 * under any seal-key fingerprint (matching on the sha PREFIX catches the
 * pre-fingerprint name shape too). Runs on revoke: the route 404s the next
 * request by itself, but the cache lives in a PUBLIC bucket at a path
 * derivable from anon-readable data, so the object has to go, not just the
 * route. Returns how many objects went away, or -1 when the sweep itself
 * failed — the caller must surface that, a silent miss here leaves a revoked
 * certificate downloadable forever.
 */
export async function removeCachedPdfs(
  artifactSha256Hex: string,
): Promise<number> {
  if (!dbConfigured) return 0;

  const storage = getServiceClient().storage.from(BUCKET);
  const { data, error } = await storage.list("certs-pdf", {
    search: artifactSha256Hex,
  });
  if (error) {
    console.error(
      `[pdf] cache sweep list failed for ${artifactSha256Hex}: ${error.message}`,
    );
    return -1;
  }

  const paths = (data ?? [])
    .filter((object) => object.name.startsWith(artifactSha256Hex))
    .map((object) => `certs-pdf/${object.name}`);
  if (paths.length === 0) return 0;

  const { error: removeError } = await storage.remove(paths);
  if (removeError) {
    console.error(
      `[pdf] cache sweep remove failed for ${artifactSha256Hex}: ${removeError.message}`,
    );
    return -1;
  }
  return paths.length;
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
