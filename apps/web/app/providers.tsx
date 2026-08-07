"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getRpc, getRpcSubscriptions, rpcConfigured } from "@/lib/chain";

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

export function Providers({ children }: { children: React.ReactNode }) {
  if (!PRIVY_APP_ID) {
    // Never hard-crash on missing env — surface a clear inline message and
    // keep the rest of the app (query client, toaster) working.
    return (
      <AppProviders>
        <div className="p-4">
          <Alert variant="destructive">
            <AlertTitle>Autenticação indisponível</AlertTitle>
            <AlertDescription>
              NEXT_PUBLIC_PRIVY_APP_ID não está configurado. Defina essa
              variável de ambiente para habilitar o login.
            </AlertDescription>
          </Alert>
        </div>
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
      <AppProviders>{children}</AppProviders>
    </PrivyProvider>
  );
}
