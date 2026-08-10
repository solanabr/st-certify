import { getCertifyErrorName } from "@certify/client";
import { fail, type AppErrorCode } from "@/lib/errors";

/**
 * Raw chain/RPC failure -> AppError, the human-meaning map (webapp-architecture
 * §4). Heuristic string matching over exact error-class shapes: kit's
 * `SolanaError` variants and simulation-log wording are numerous and
 * version-sensitive, while the substrings below are stable across RPC
 * implementations and are what every Solana client-side error mapper in
 * practice keys off.
 */

const CERTIFY_ERROR_TO_APP: Partial<
  Record<ReturnType<typeof getCertifyErrorName> & string, AppErrorCode>
> = {
  EditionNotOpen: "EDITION_NOT_OPEN",
  SupplyExhausted: "SUPPLY_EXHAUSTED",
  InvalidCertStatus: "CERT_STATE_CONFLICT",
};

/**
 * Detects a wallet-declined-the-request error across Privy embedded wallets and
 * wallet-standard adapters (Phantom/Solflare) — their rejection error messages
 * aren't standardized, so this is a substring heuristic like the rest of this
 * file. Shared by every hook that catches a user-facing sign/send rejection
 * (useRequestCertificate, useClaim, useMassSign, useReject) so the wording only
 * needs to be right in one place.
 */
export function isUserRejection(err: unknown): boolean {
  const message = err instanceof Error ? err.message.toLowerCase() : "";
  return (
    message.includes("reject") ||
    message.includes("declin") ||
    message.includes("cancel") ||
    message.includes("closed")
  );
}

function extractCustomProgramErrorCode(message: string): number | null {
  const match = message.match(/custom program error:\s*0x([0-9a-f]+)/i);
  if (!match) {
    return null;
  }
  return Number.parseInt(match[1], 16);
}

/**
 * Normalizes a caught chain/RPC error (from a `sendTransaction`,
 * `confirmTransaction`, or simulation call) and throws the matching
 * `AppError`. Never returns — call at the point where the raw error is
 * caught, so the throw-site keeps full context (webapp-architecture rule).
 */
export function failFromChainError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const lower = message.toLowerCase();

  if (
    lower.includes("insufficient") ||
    lower.includes("no record of a prior credit")
  ) {
    fail("CHAIN_INSUFFICIENT_FUNDS", "Saldo insuficiente para a taxa.", {
      detail: message,
      retryable: true,
      action: "airdrop",
    });
  }

  if (
    lower.includes("blockhash not found") ||
    lower.includes("block height exceeded") ||
    (lower.includes("blockhash") && lower.includes("expired"))
  ) {
    fail("CHAIN_BLOCKHASH_EXPIRED", "Transação expirou. Tente novamente.", {
      detail: message,
      retryable: true,
      action: "retry",
    });
  }

  if (
    lower.includes("user rejected") ||
    lower.includes("rejected the request") ||
    lower.includes("declined")
  ) {
    fail("CHAIN_REJECTED_BY_USER", "Assinatura cancelada.", {
      detail: message,
      retryable: false,
    });
  }

  if (
    lower.includes("already in use") ||
    lower.includes("already been processed")
  ) {
    fail("ALREADY_REQUESTED", "Você já solicitou este certificado.", {
      detail: message,
      retryable: false,
      action: "goto-me",
    });
  }

  const customCode = extractCustomProgramErrorCode(message);
  if (customCode !== null) {
    const errorName = getCertifyErrorName(customCode);
    const mapped = errorName ? CERTIFY_ERROR_TO_APP[errorName] : undefined;
    if (mapped) {
      const messages: Partial<Record<AppErrorCode, string>> = {
        EDITION_NOT_OPEN: "Esta edição não está aberta para solicitações.",
        SUPPLY_EXHAUSTED: "Esta edição atingiu o limite de certificados.",
        CERT_STATE_CONFLICT:
          "O estado deste certificado mudou. Atualize a página.",
      };
      fail(mapped, messages[mapped] ?? "Erro do programa.", {
        detail: `${errorName} (${customCode})`,
        retryable: false,
      });
    }
    fail("CHAIN_PROGRAM_ERROR", "O programa recusou esta transação.", {
      detail: `custom program error ${customCode}${errorName ? ` (${errorName})` : ""}`,
      retryable: false,
    });
  }

  if (
    lower.includes("429") ||
    lower.includes("timeout") ||
    lower.includes("fetch failed") ||
    lower.includes("network")
  ) {
    fail(
      "CHAIN_RPC_UNAVAILABLE",
      "RPC indisponível no momento. Tente novamente.",
      {
        detail: message,
        retryable: true,
      },
    );
  }

  fail("CHAIN_PROGRAM_ERROR", "Transação falhou. Tente novamente.", {
    detail: message,
    retryable: true,
  });
}
