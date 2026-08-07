import "server-only";

import { createHash } from "node:crypto";
import { dbConfigured, getServiceClient } from "../db/mutations";

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
