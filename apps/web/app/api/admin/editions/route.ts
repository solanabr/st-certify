import type { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { requireSysadmin } from "@/lib/auth";
import { fail } from "@/lib/errors";
import { editionWizardSchema, type EditionWizardInput } from "@/lib/schemas";
import {
  editionReadyLayoutSchema,
  layoutSchema,
  type Layout,
} from "@/lib/render/layout";
import { specHash, specHashBytes } from "@/lib/render/spec-hash";
import {
  dbConfigured,
  isSlugAvailable,
  listEditionsAdmin,
} from "@/lib/db/queries";
import { insertEditionMirror, insertEditionSigners } from "@/lib/db/mutations";
import { createEditionOnChain } from "@/lib/chain/server";
import type { EditionWithSigners } from "@/lib/db/types";
import rawDefaultLayout from "@/assets/templates/default-layout.json";

/** Every edition regardless of status, for the admin Edições tab. */
export async function GET(): Promise<NextResponse> {
  return apiRoute(async (): Promise<EditionWithSigners[]> => {
    await requireSysadmin();
    if (!dbConfigured) {
      return [];
    }
    return listEditionsAdmin();
  });
}

/**
 * No-designer fallback layout for the default-template path: the committed
 * default-layout.json ships `signatures: []` (positions are normally bound
 * by the M6 drag designer) — evenly distributes N signature boxes in a
 * single row so the default one-click path can render without it.
 *
 * Bounds per the renderer track (m2-renderer): the default template's QR
 * code sits at x 0.8813-0.9626, y 0.672-0.7869, so the safe signature band
 * is x in [0.06, 0.85], y: 0.725, h: 0.1415 — NOT a full-width [0.05, 0.95]
 * distribution, which would put the rightmost box's right edge at 0.95 and
 * overlap the QR for any signer count.
 */
function autoSignatureBoxes(count: number): Layout["signatures"] {
  const marginX = 0.06;
  const rightBound = 0.85;
  const gapX = 0.02;
  const usableWidth = rightBound - marginX;
  const boxW = (usableWidth - gapX * (count - 1)) / count;
  return Array.from({ length: count }, (_, i) => ({
    x: marginX + i * (boxW + gapX),
    y: 0.725,
    w: boxW,
    h: 0.1415,
    align: "center" as const,
  }));
}

export interface CreateEditionResponse {
  address: string;
  slug: string;
}

/**
 * Builds the final Layout for either template path. Both branches end by
 * overwriting `.signers` from the wizard's own validated `signers` array
 * (never trusting a nested copy) — the default path already did this; the
 * custom path (M6) mirrors it so there is exactly one source of truth for
 * signer bindings regardless of where the rest of the layout came from.
 */
function buildEditionLayout(
  templatePath: "default" | "custom",
  customLayout: Layout | undefined,
  signers: EditionWizardInput["signers"],
): Layout {
  const boundSigners = signers.map((s) => ({
    wallet: s.wallet,
    name: s.name,
    role: s.role,
  }));

  if (templatePath === "custom") {
    // Schema-validated by the client already (editionWizardSchema requires
    // `customLayout` when templatePath is "custom"); re-validate here too —
    // never trust client input, per webapp-architecture's trust-boundary rule.
    const parsedCustom = layoutSchema.safeParse(customLayout);
    if (!parsedCustom.success) {
      fail("VALIDATION", "Layout do template personalizado inválido.", {
        field: "customLayout",
      });
    }
    if (parsedCustom.data.signatures.length !== signers.length) {
      fail(
        "VALIDATION",
        "O número de caixas de assinatura não corresponde ao número de signatários.",
        { field: "customLayout" },
      );
    }
    return editionReadyLayoutSchema.parse({
      ...parsedCustom.data,
      signers: boundSigners,
    });
  }

  const baseLayout = layoutSchema.parse(rawDefaultLayout);
  return editionReadyLayoutSchema.parse({
    ...baseLayout,
    signers: boundSigners,
    signatures: autoSignatureBoxes(signers.length),
  });
}

/**
 * Step 5 of the wizard (QA): meta + signers + the chosen template (default
 * one-click, or the M6 designer's custom layout) -> canonical layout ->
 * spec_hash -> `create_edition` (OPERATOR-signed) -> mirror. Returns Paused
 * — the admin still has to click "Abrir edição" (POST .../status) after
 * reviewing the QA sample render.
 */
export async function POST(request: Request): Promise<NextResponse> {
  return apiRoute(async (): Promise<CreateEditionResponse> => {
    const session = await requireSysadmin();

    const raw: unknown = await request.json().catch(() => null);
    const parsed = editionWizardSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      fail("VALIDATION", issue?.message ?? "Dados inválidos.", {
        field: issue?.path.join("."),
      });
    }
    const { meta, signers, templatePath, customLayout } = parsed.data;

    if (!dbConfigured) {
      fail("INTERNAL", "Supabase não configurado.");
    }

    if (!(await isSlugAvailable(meta.slug))) {
      fail("VALIDATION", "Este slug já está em uso.", { field: "slug" });
    }

    const editionLayout = buildEditionLayout(
      templatePath,
      customLayout,
      signers,
    );
    const specHashHex = specHash(editionLayout);

    // Optional in the wizard (product intent: blank = effectively uncapped);
    // 0 is NOT used as an "unlimited" sentinel — the program's supply check
    // is `requested - closed < max_supply`, so 0 would mean zero capacity.
    const maxSupply = meta.maxSupply ? BigInt(meta.maxSupply) : 1_000_000n;

    const created = await createEditionOnChain({
      name: meta.name,
      specHash: specHashBytes(editionLayout),
      maxSupply,
      signers,
      actor: session.did,
    });

    await insertEditionMirror({
      address: created.address,
      slug: meta.slug,
      name: meta.name,
      description: meta.description ?? null,
      templateSha256: editionLayout.template.sha256,
      layout: editionLayout,
      specHash: specHashHex,
      maxSupply,
      completionDate: meta.completionDate || null,
      txSig: created.signature,
    });

    await insertEditionSigners(
      signers.map((s, index) => ({
        editionAddress: created.address,
        position: index,
        wallet: s.wallet,
        name: s.name,
        role: s.role,
      })),
    );

    return { address: created.address, slug: meta.slug };
  });
}
