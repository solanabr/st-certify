import { z } from "zod";
import type { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { fail } from "@/lib/errors";
import { acceptInvite } from "@/lib/db/draft-mutations";
import { getInviteByToken } from "@/lib/db/draft-queries";
import { configuredIssuer } from "@/lib/issuer";
import { walletAddressSchema } from "@/lib/schemas";
import { toInviteView, type InviteView } from "@/lib/invite/view";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

const acceptSchema = z.object({ wallet: walletAddressSchema });

/**
 * A seat may only be confirmed by the person it was addressed to.
 *
 * The session proving *someone* is logged in is not enough: a forwarded
 * invite e-mail would otherwise let any account bind its own wallet to the
 * seat and sign in that Signatário's name. Privy verifies the e-mail it
 * reports, so comparing it to the address the invite was sent to is what ties
 * the two identities together. A wallet-only login carries no e-mail at all
 * and is refused for the same reason — there is nothing to compare.
 *
 * Seats created through the manual-wallet escape hatch carry no e-mail
 * (`email: ''`) and are born accepted, so they never reach this check.
 */
function requireInvitedIdentity(
  invitedEmail: string,
  sessionEmail: string | null,
): void {
  const invited = invitedEmail.trim().toLowerCase();
  if (invited === "") {
    return;
  }
  if ((sessionEmail ?? "").trim().toLowerCase() !== invited) {
    fail(
      "INVITE_EMAIL_MISMATCH",
      "Este convite foi enviado para outro e-mail. Entre com a conta que recebeu o convite para confirmar este assento.",
    );
  }
}

/**
 * Binds the signer's chosen wallet to their seat.
 *
 * The token proves which seat is being claimed; the Privy session proves who
 * is claiming it. Both are required — a leaked link alone must not be enough
 * to write a wallet onto someone else's seat, and the wallet written has to be
 * one Privy has actually verified as belonging to the caller (same
 * `session.wallets` linkage check `prepareClaim` uses to gate a claim). Without
 * it the caller could bind any address, including another signer's, and every
 * later signature would be attributed to a wallet they don't control.
 *
 * The status guard is stated twice on purpose: once here for a message that
 * names the actual state, and once inside `acceptInvite`'s `eq("status",
 * "invited")` — the atomic half, which is what settles two tabs racing.
 */
export async function POST(
  request: Request,
  { params }: Params,
): Promise<NextResponse> {
  return apiRoute(async (): Promise<InviteView> => {
    const session = await requireUser();
    const { token } = await params;

    const raw: unknown = await request.json().catch(() => null);
    const parsed = acceptSchema.safeParse(raw);
    if (!parsed.success) {
      fail("VALIDATION", "Escolha uma carteira válida para assinar.", {
        field: "wallet",
      });
    }
    const { wallet } = parsed.data;

    const invite = await getInviteByToken(token);
    if (!invite) {
      fail("NOT_FOUND", "Convite não encontrado.");
    }
    if (invite.status === "accepted") {
      fail("CONFLICT", "Este convite já foi confirmado.");
    }
    if (invite.status === "expired") {
      fail(
        "CONFLICT",
        "Este convite expirou. Peça um novo link a quem organizou a edição.",
      );
    }
    if (invite.draft.chain_address) {
      fail(
        "CONFLICT",
        "Esta edição já foi criada on-chain e não aceita mais confirmações.",
      );
    }
    requireInvitedIdentity(invite.email, session.email);
    if (!session.wallets.includes(wallet)) {
      fail("FORBIDDEN", "Esta carteira não está vinculada à sua conta.", {
        field: "wallet",
      });
    }

    const seat = await acceptInvite(invite.id, wallet);
    return toInviteView(seat, invite.draft, configuredIssuer());
  });
}
