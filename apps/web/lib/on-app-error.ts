import { toast } from "sonner";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { toAppError } from "@/lib/errors";
import { tc } from "@/lib/i18n/client-locale";

export interface OnAppErrorOptions {
  /** Wallet to airdrop to, when the error's action is "airdrop". */
  airdropWallet?: string;
}

async function triggerAirdrop(wallet: string): Promise<void> {
  try {
    const res = await fetch("/api/airdrop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet }),
    });
    const body: unknown = await res.json().catch(() => null);
    const errorMessage =
      body && typeof body === "object" && "error" in body
        ? (body as { error: { message?: string } }).error.message
        : undefined;

    if (!res.ok || errorMessage) {
      toast.error(errorMessage ?? tc("wallet.airdropFailed"));
      return;
    }
    toast.success(tc("wallet.airdropSent"));
  } catch {
    toast.error(tc("wallet.airdropFailed"));
  }
}

/**
 * The single client-side error handler (webapp-architecture §4): every
 * mutation's catch block routes through this. `field` errors go to the RHF
 * form inline (never a toast); everything else becomes a toast with the
 * right tone and, where the error carries an action hint, a wired CTA
 * button — never a bare "Something went wrong".
 */
export function onAppError<T extends FieldValues>(
  err: unknown,
  form?: UseFormReturn<T>,
  options?: OnAppErrorOptions,
): void {
  const appError = toAppError(err);

  if (appError.field && form) {
    form.setError(appError.field as Path<T>, { message: appError.message });
    return;
  }

  if (appError.code === "CHAIN_REJECTED_BY_USER") {
    toast(appError.message);
    return;
  }

  if (appError.action === "airdrop" && options?.airdropWallet) {
    const wallet = options.airdropWallet;
    toast.error(appError.message, {
      action: {
        label: tc("wallet.airdrop"),
        onClick: () => void triggerAirdrop(wallet),
      },
    });
    return;
  }

  if (appError.action === "goto-me") {
    toast.error(appError.message, {
      action: {
        label: tc("error.viewMyCertificates"),
        onClick: () => {
          window.location.href = "/me";
        },
      },
    });
    return;
  }

  if (appError.retryable) {
    toast.error(appError.message, { description: tc("error.tryAgain") });
    return;
  }

  toast.error(appError.message);
}
