import type { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { requireSysadmin } from "@/lib/auth";
import { fail } from "@/lib/errors";
import { editionWizardSchema } from "@/lib/schemas";
import { dbConfigured, listEditionsAdmin } from "@/lib/db/queries";
import {
  createEditionFromWizard,
  type CreateEditionResult,
} from "@/lib/editions/create";
import type { EditionWithSigners } from "@/lib/db/types";

/** Every edition regardless of status, for the studio Edições tab. */
export async function GET(): Promise<NextResponse> {
  return apiRoute(async (): Promise<EditionWithSigners[]> => {
    await requireSysadmin();
    if (!dbConfigured) {
      return [];
    }
    return listEditionsAdmin();
  });
}

export type CreateEditionResponse = CreateEditionResult;

/**
 * The pre-overhaul one-shot create: the whole wizard state arrives in one
 * body and goes straight on-chain. The draft-first path (POST
 * /api/studio/drafts/[id]/create-onchain) is the same flow with the signers
 * resolved from accepted invites instead; both share
 * `createEditionFromWizard`.
 */
export async function POST(request: Request): Promise<NextResponse> {
  return apiRoute(async (): Promise<CreateEditionResult> => {
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

    return createEditionFromWizard({
      meta,
      signers,
      templatePath,
      customLayout,
      actorDid: session.did,
    });
  });
}
