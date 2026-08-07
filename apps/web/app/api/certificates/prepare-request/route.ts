import { createHash, randomBytes } from "node:crypto";
import type { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { fail } from "@/lib/errors";
import { requestCertificateSchema, walletAddressSchema } from "@/lib/schemas";
import { dbConfigured, getEditionByAddress } from "@/lib/db/queries";
import { insertPendingCertificate } from "@/lib/db/mutations";
import { deriveCertificatePda } from "@/lib/chain";

export interface PrepareRequestResponse {
  certificateAddress: string;
  nameCommitmentHex: string;
}

/**
 * Sanitizes the name (server-enforced, same zod transform as the client
 * preview), generates a random salt, and computes
 * `name_commitment = sha256(salt ‖ NFC(name))` — the only form of the name
 * that ever reaches the chain. The plaintext name + salt land in the
 * certificates mirror here, before the on-chain tx is even built.
 */
export async function POST(request: Request): Promise<NextResponse> {
  return apiRoute(async (): Promise<PrepareRequestResponse> => {
    const session = await requireUser();

    const body: unknown = await request.json().catch(() => null);
    const parsed = requestCertificateSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      fail("VALIDATION", issue?.message ?? "Dados inválidos.", {
        field: issue?.path.join("."),
      });
    }

    const rawWallet = (body as { studentWallet?: unknown } | null)
      ?.studentWallet;
    const walletParsed = walletAddressSchema.safeParse(rawWallet);
    if (!walletParsed.success || !session.wallets.includes(walletParsed.data)) {
      fail(
        "FORBIDDEN",
        "Conecte a carteira que fará a solicitação antes de continuar.",
      );
    }
    const studentWallet = walletParsed.data;

    if (!dbConfigured) {
      fail("INTERNAL", "Supabase não configurado.");
    }

    const edition = await getEditionByAddress(parsed.data.editionAddress);
    if (!edition) {
      fail("NOT_FOUND", "Edição não encontrada.");
    }
    if (edition.status !== "Open") {
      fail(
        "EDITION_NOT_OPEN",
        "Esta edição não está aberta para solicitações.",
      );
    }

    const certificateAddress = await deriveCertificatePda(
      parsed.data.editionAddress,
      studentWallet,
    );

    const salt = randomBytes(32);
    const commitment = createHash("sha256")
      .update(salt)
      .update(Buffer.from(parsed.data.name, "utf8"))
      .digest();

    await insertPendingCertificate({
      address: certificateAddress,
      editionAddress: parsed.data.editionAddress,
      ownerWallet: studentWallet,
      ownerDid: session.did,
      studentName: parsed.data.name,
      nameSalt: salt.toString("hex"),
    });

    return {
      certificateAddress,
      nameCommitmentHex: commitment.toString("hex"),
    };
  });
}
