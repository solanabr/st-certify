import type { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { fail } from "@/lib/errors";
import { getInviteByToken } from "@/lib/db/draft-queries";
import { configuredIssuer } from "@/lib/issuer";
import { toInviteView, type InviteView } from "@/lib/invite/view";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

/**
 * Resolves a signer's magic link. Unauthenticated on purpose: the token IS the
 * capability, and the invited person must be able to read who invited them and
 * to what before deciding whether to log in at all. Acceptance is the step that
 * requires a session — see ./accept/route.ts.
 *
 * Every non-`invited` status still returns 200 with its status: the page turns
 * "already accepted" and "expired" into distinct, contactable dead-states, and
 * a 404 would collapse both into "this link never existed".
 */
export async function GET(
  _request: Request,
  { params }: Params,
): Promise<NextResponse> {
  return apiRoute(async (): Promise<InviteView> => {
    const { token } = await params;

    const invite = await getInviteByToken(token);
    if (!invite) {
      fail("NOT_FOUND", "Convite não encontrado.");
    }

    return toInviteView(invite, invite.draft, configuredIssuer());
  });
}
