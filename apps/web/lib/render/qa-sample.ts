import "server-only";

// The wizard's QA sample render, shared by the created-edition route
// (/api/admin/editions/[address]/qa-sample) and the draft route
// (/api/studio/drafts/[id]/qa-sample). The draft variant is what lets step 5
// show a real preview without writing anything on-chain first.

import { Resvg } from "@resvg/resvg-js";
import { toAppError } from "@/lib/errors";
import { renderCertificate } from "./render";
import { getTemplateBytes } from "./storage";
import type { Layout } from "./layout";

const UNAVAILABLE_MESSAGE =
  "Pré-visualização indisponível: template personalizado sem Supabase configurado.";

/**
 * A dark placeholder frame with a centered message, sized to the edition's
 * own canvas — degradation for a custom template whose bytes can't be
 * resolved (Supabase not configured). Returned as a real PNG (not JSON)
 * because the wizard embeds these routes directly as an `<img src>` with no
 * response-body handling of its own.
 */
function renderUnavailablePlaceholder(canvas: Layout["canvas"]): Buffer {
  const fontSize = Math.round(canvas.height * 0.032);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}">
<rect width="100%" height="100%" fill="#11131A"/>
<text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="${fontSize}" fill="#B7C0D8">${UNAVAILABLE_MESSAGE}</text>
</svg>`;
  return Buffer.from(new Resvg(svg).render().asPng());
}

export interface QaSampleSigner {
  name: string;
  role: string;
}

/**
 * Renders `layout` with obviously-fake student data so the admin can eyeball
 * the composition before anyone real is on it. `signers` is passed separately
 * from `layout.signers` because a draft's seats may not have wallets bound
 * yet — only the printed name and role matter to the render.
 */
export async function renderQaSamplePng(
  layout: Layout,
  signers: QaSampleSigner[],
): Promise<Buffer> {
  let templatePng: Buffer;
  try {
    templatePng = await getTemplateBytes(layout.template.sha256);
  } catch (err) {
    if (toAppError(err).code === "STORAGE_FAILED") {
      return renderUnavailablePlaceholder(layout.canvas);
    }
    throw err;
  }

  const dateText = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const { png } = await renderCertificate({
    templatePng,
    layout,
    values: {
      studentName: "Maria da Silva (exemplo)",
      dateText,
      certId: "CERT-QA-SAMPLE",
      verifyUrl: `${appUrl}/verify/qa-sample`,
    },
    signers,
  });

  return png;
}
