import "server-only";

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { dbConfigured, getServiceClient } from "../db/mutations";
import { fail } from "../errors";

export interface StoredArtifact {
  stored: true;
  sha256Hex: string;
  pngUrl: string;
  metadataUrl: string;
}

export interface StoredTemplate {
  stored: true;
  sha256Hex: string;
  url: string;
}

export interface StorageUnavailable {
  stored: false;
  reason: string;
}

const NOT_CONFIGURED_REASON =
  "Supabase não configurado (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes).";

/**
 * Uploads a rendered certificate + its metadata JSON to Supabase Storage,
 * content-addressed by the PNG's own sha256 (`certs/{sha256}.png`,
 * `metadata/{sha256}.json`, upsert:true — idempotent re-render ⇒ same
 * bytes ⇒ same path). Never throws when Supabase isn't configured; callers
 * decide how to handle `{ stored: false }`.
 */
export async function storeArtifact(
  png: Buffer,
  metadataJson: unknown,
): Promise<StoredArtifact | StorageUnavailable> {
  if (!dbConfigured) {
    return { stored: false, reason: NOT_CONFIGURED_REASON };
  }

  const sha256Hex = createHash("sha256").update(png).digest("hex");
  const supabase = getServiceClient();

  const pngPath = `${sha256Hex}.png`;
  const { error: pngError } = await supabase.storage
    .from("certs")
    .upload(pngPath, png, { contentType: "image/png", upsert: true });
  if (pngError) {
    return {
      stored: false,
      reason: `Falha ao enviar imagem: ${pngError.message}`,
    };
  }

  const metadataPath = `${sha256Hex}.json`;
  const metadataBuffer = Buffer.from(
    JSON.stringify(metadataJson, null, 2),
    "utf8",
  );
  const { error: metadataError } = await supabase.storage
    .from("metadata")
    .upload(metadataPath, metadataBuffer, {
      contentType: "application/json",
      upsert: true,
    });
  if (metadataError) {
    return {
      stored: false,
      reason: `Falha ao enviar metadata: ${metadataError.message}`,
    };
  }

  const pngUrl = supabase.storage.from("certs").getPublicUrl(pngPath)
    .data.publicUrl;
  const metadataUrl = supabase.storage
    .from("metadata")
    .getPublicUrl(metadataPath).data.publicUrl;

  return { stored: true, sha256Hex, pngUrl, metadataUrl };
}

/** Uploads a template PNG, content-addressed by its own sha256 (`templates/{sha256}.png`). */
export async function storeTemplate(
  png: Buffer,
): Promise<StoredTemplate | StorageUnavailable> {
  if (!dbConfigured) {
    return { stored: false, reason: NOT_CONFIGURED_REASON };
  }

  const sha256Hex = createHash("sha256").update(png).digest("hex");
  const supabase = getServiceClient();
  const templatePath = `${sha256Hex}.png`;

  const { error } = await supabase.storage
    .from("templates")
    .upload(templatePath, png, { contentType: "image/png", upsert: true });
  if (error) {
    return {
      stored: false,
      reason: `Falha ao enviar template: ${error.message}`,
    };
  }

  const url = supabase.storage.from("templates").getPublicUrl(templatePath)
    .data.publicUrl;
  return { stored: true, sha256Hex, url };
}

const DEFAULT_TEMPLATE_PATH = path.join(
  process.cwd(),
  "assets",
  "templates",
  "default-superteam-br.png",
);

let defaultTemplate: { sha256Hex: string; bytes: Buffer } | null = null;

/** Loads + hashes the committed default template once per process. */
function loadDefaultTemplate(): { sha256Hex: string; bytes: Buffer } {
  if (!defaultTemplate) {
    const bytes = readFileSync(DEFAULT_TEMPLATE_PATH);
    defaultTemplate = {
      bytes,
      sha256Hex: createHash("sha256").update(bytes).digest("hex"),
    };
  }
  return defaultTemplate;
}

/**
 * Resolves a template's PNG bytes by content-address — the hash embedded in
 * an edition's `layout.template.sha256`. The committed default template
 * (the common case) is read locally with zero Supabase dependency; any
 * other hash is a custom-uploaded template and is fetched from Supabase
 * Storage (`templates/{sha256}.png`, the same bucket `storeTemplate` writes
 * to).
 *
 * Always verifies the resolved bytes hash to the requested sha256 before
 * returning — this is the integrity check the old (broken) equality-assert
 * used to provide for the default-only path, now preserved for both paths.
 */
export async function getTemplateBytes(sha256: string): Promise<Buffer> {
  const def = loadDefaultTemplate();
  if (sha256 === def.sha256Hex) {
    return def.bytes;
  }

  if (!dbConfigured) {
    fail(
      "STORAGE_FAILED",
      "Template personalizado indisponível — Supabase não configurado.",
      { retryable: true },
    );
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase.storage
    .from("templates")
    .download(`${sha256}.png`);
  if (error || !data) {
    fail(
      "STORAGE_FAILED",
      `Falha ao baixar template personalizado: ${error?.message ?? "arquivo não encontrado"}.`,
      { retryable: true },
    );
  }

  const bytes = Buffer.from(await data.arrayBuffer());
  const actualSha256 = createHash("sha256").update(bytes).digest("hex");
  if (actualSha256 !== sha256) {
    fail(
      "RENDER_FAILED",
      "Os bytes do template não correspondem ao hash esperado.",
    );
  }

  return bytes;
}
