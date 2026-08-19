"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthSync } from "@/components/auth-sync";
import { getRpc, getRpcSubscriptions, rpcConfigured } from "@/lib/chain";
import { useT } from "@/lib/i18n";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

function buildSolanaRpcs() {
  // Reuses the lib/chain singletons rather than calling @solana/kit here
  // directly — kit is fenced to lib/chain/** by ESLint. If either RPC env is
  // missing, omit `solana.rpcs` entirely and let Privy fall back to its own
  // defaults rather than throwing.
  if (!rpcConfigured) {
    return undefined;
  }

  return {
    "solana:devnet": {
      rpc: getRpc(),
      rpcSubscriptions: getRpcSubscriptions(),
      blockExplorerUrl: "https://explorer.solana.com?cluster=devnet",
    },
  } as const;
}

function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            retry: 1,
            refetchOnWindowFocus: true,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>{children}</TooltipProvider>
      <Toaster richColors />
    </QueryClientProvider>
  );
}

function AuthUnavailable() {
  const { t } = useT();
  return (
    <div className="p-4">
      <Alert variant="destructive">
        <AlertTitle>{t("providers.authUnavailableTitle")}</AlertTitle>
        <AlertDescription>
          {t("providers.authUnavailableDesc")}
        </AlertDescription>
      </Alert>
    </div>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  if (!PRIVY_APP_ID) {
    // Never hard-crash on missing env — surface a clear inline message and
    // keep the rest of the app (query client, toaster) working.
    return (
      <AppProviders>
        <AuthUnavailable />
        {children}
      </AppProviders>
    );
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["email", "wallet"],
        appearance: {
          walletChainType: "solana-only",
        },
        externalWallets: {
          solana: {
            connectors: toSolanaWalletConnectors(),
          },
        },
        embeddedWallets: {
          solana: {
            createOnLogin: "users-without-wallets",
          },
          showWalletUIs: false,
        },
        solana: {
          rpcs: buildSolanaRpcs(),
        },
      }}
    >
      <AppProviders>
        <AuthSync />
        {children}
      </AppProviders>
    </PrivyProvider>
  );
}
