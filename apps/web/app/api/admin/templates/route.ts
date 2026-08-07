export const runtime = "nodejs";

import { createHash } from "node:crypto";
import sharp from "sharp";
import { apiRoute } from "@/lib/api";
import { requireSysadmin } from "@/lib/auth";
import { fail } from "@/lib/errors";
import { storeTemplate } from "@/lib/render/storage";

const MAX_BYTES = 8 * 1024 * 1024;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface UploadTemplateResponse {
  sha256: string;
  width: number | null;
  height: number | null;
  stored: boolean;
  url: string | null;
  reason?: string;
}

/**
 * Wizard step 4 (Designer): accepts the already client-downscaled (<=2400px
 * long edge) template PNG and stores it content-addressed via
 * `storeTemplate` (`templates/{sha256}.png`, same helper `lib/chain/claim.ts`
 * already uses for the default template). Deliberately does NOT re-encode
 * the bytes (sharp is used read-only, for validation/metadata only): the
 * client already computed this exact sha256 and will embed it in the
 * layout it emits, so the server must store precisely what it hashed —
 * re-encoding here would silently break that content-address.
 *
 * Degrades cleanly: `{ stored: false, reason }` is a normal 200 response
 * (Supabase unconfigured), not an error — the designer keeps working off
 * the in-memory preview either way (see `use-template-upload.ts`).
 */
export async function POST(request: Request): Promise<Response> {
  return apiRoute(async (): Promise<UploadTemplateResponse> => {
    await requireSysadmin();

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof Blob)) {
      fail("VALIDATION", "Envie um arquivo PNG.", { field: "file" });
    }
    if (file.size === 0 || file.size > MAX_BYTES) {
      fail("VALIDATION", "A imagem deve ter no máximo 8MB.", {
        field: "file",
      });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!buffer.subarray(0, 8).equals(PNG_MAGIC)) {
      fail("VALIDATION", "O arquivo enviado não é um PNG válido.", {
        field: "file",
      });
    }

    let width: number | null = null;
    let height: number | null = null;
    try {
      const metadata = await sharp(buffer).metadata();
      width = metadata.width ?? null;
      height = metadata.height ?? null;
    } catch {
      fail("VALIDATION", "Não foi possível ler a imagem enviada.", {
        field: "file",
      });
    }

    const sha256Hex = createHash("sha256").update(buffer).digest("hex");
    const result = await storeTemplate(buffer);

    return {
      sha256: sha256Hex,
      width,
      height,
      stored: result.stored,
      url: result.stored ? result.url : null,
      reason: result.stored ? undefined : result.reason,
    };
  });
}
