import { fail } from "@/lib/errors";
import { base64ToBytes } from "@/lib/bytes";
import { isSiwsFresh, parseSiwsMessage, type SiwsPurpose } from "./siws";
import { verifyWalletSignature } from "./verify-signature";

export interface ProofInput {
  wallet: string;
  message?: string;
  signatureBase64?: string;
}

export interface ProofDeps {
  consumeNonce: (nonce: string, wallet: string) => Promise<boolean>;
  getSessionWallets: () => Promise<string[]>;
  expectedDomain: string;
  now?: Date;
}

/**
 * The ONE trust boundary for wallet ownership: either a SIWS-signed message
 * (wallet-standard signMessage) or a Privy session that links the wallet.
 */
export async function resolveProvedWallet(
  input: ProofInput,
  purpose: SiwsPurpose,
  deps: ProofDeps,
): Promise<string> {
  if (input.message !== undefined && input.signatureBase64 !== undefined) {
    const fields = parseSiwsMessage(input.message);
    if (
      !fields ||
      fields.purpose !== purpose ||
      fields.wallet !== input.wallet ||
      fields.domain !== deps.expectedDomain
    ) {
      fail("SIWS_INVALID_SIGNATURE", "Mensagem de assinatura inválida.");
    }
    if (!isSiwsFresh(fields.issuedAt, deps.now)) {
      fail("SIWS_NONCE_EXPIRED", "Assinatura expirada. Tente novamente.", {
        retryable: true,
      });
    }
    if (!(await deps.consumeNonce(fields.nonce, input.wallet))) {
      fail(
        "SIWS_NONCE_EXPIRED",
        "Nonce expirado ou já utilizado. Tente novamente.",
        {
          retryable: true,
        },
      );
    }
    const ok = verifyWalletSignature(
      input.wallet,
      new TextEncoder().encode(input.message),
      base64ToBytes(input.signatureBase64),
    );
    if (!ok) {
      fail("SIWS_INVALID_SIGNATURE", "Assinatura inválida para esta carteira.");
    }
    return input.wallet;
  }

  const sessionWallets = await deps.getSessionWallets();
  if (sessionWallets.includes(input.wallet)) {
    return input.wallet;
  }
  fail("UNAUTHORIZED", "Conecte e assine com sua carteira para continuar.", {
    action: "login",
  });
}
