import "server-only";

// The `create_edition` server flow, extracted from app/api/admin/editions'
// POST so the draft-first path (POST /api/studio/drafts/[id]/create-onchain)
// runs exactly the same sequence — layout -> spec hash -> on-chain create ->
// mirror -> signer rows. Two copies of this would be two ways for the mirror
// to disagree with the chain.

import { fail } from "@/lib/errors";
import type { EditionMetaInput } from "@/lib/schemas";
import {
  editionReadyLayoutSchema,
  layoutSchema,
  type Layout,
} from "@/lib/render/layout";
import { specHash, specHashBytes } from "@/lib/render/spec-hash";
import { dbConfigured, isSlugAvailable } from "@/lib/db/queries";
import { insertEditionMirror, insertEditionSigners } from "@/lib/db/mutations";
import { createEditionOnChain } from "@/lib/chain/server";
import rawDefaultLayout from "@/assets/templates/default-layout.json";

/** A signer as the layout binds it: wallet + the two strings that get printed. */
export interface EditionSignerBinding {
  wallet: string;
  name: string;
  role: string;
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
export function autoSignatureBoxes(count: number): Layout["signatures"] {
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

/**
 * Builds the final Layout for either template path. Both branches end by
 * overwriting `.signers` from the caller's own validated `signers` array
 * (never trusting a nested copy) — so there is exactly one source of truth for
 * signer bindings regardless of where the rest of the layout came from.
 */
export function buildEditionLayout(
  templatePath: "default" | "custom",
  customLayout: Layout | undefined,
  signers: EditionSignerBinding[],
): Layout {
  const boundSigners = signers.map((s) => ({
    wallet: s.wallet,
    name: s.name,
    role: s.role,
  }));

  if (templatePath === "custom") {
    // Re-validated here even though the client already parsed it — never trust
    // client input, per webapp-architecture's trust-boundary rule.
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

export interface CreateEditionInput {
  meta: EditionMetaInput;
  signers: EditionSignerBinding[];
  templatePath: "default" | "custom";
  customLayout?: Layout;
  /** Privy DID of the admin performing the create — recorded on the event. */
  actorDid: string;
}

export interface CreateEditionResult {
  address: string;
  slug: string;
}

/**
 * meta + signers + the chosen template -> canonical layout -> spec_hash ->
 * `create_edition` (OPERATOR-signed) -> mirror + signer rows. The edition
 * lands Paused: someone still has to review the sample and open it.
 *
 * Everything after the chain write is bookkeeping for an edition that already
 * exists on-chain, so a failure there needs repair, not a retry of the create.
 */
export async function createEditionFromWizard(
  input: CreateEditionInput,
): Promise<CreateEditionResult> {
  const { meta, signers, templatePath, customLayout, actorDid } = input;

  if (!dbConfigured) {
    fail("INTERNAL", "Supabase não configurado.");
  }

  if (!(await isSlugAvailable(meta.slug))) {
    fail("VALIDATION", "Este slug já está em uso.", { field: "slug" });
  }

  const editionLayout = buildEditionLayout(templatePath, customLayout, signers);
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
    actor: actorDid,
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
}
