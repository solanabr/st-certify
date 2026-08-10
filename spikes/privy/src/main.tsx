import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { App } from "./App";

const appId = import.meta.env.VITE_PRIVY_APP_ID as string | undefined;

if (!appId) {
  throw new Error(
    "VITE_PRIVY_APP_ID is not set — copy it from the repo .env (NEXT_PUBLIC_PRIVY_APP_ID)",
  );
}

const DEVNET_RPC_URL = "https://api.devnet.solana.com";
const DEVNET_RPC_WS_URL = "wss://api.devnet.solana.com";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PrivyProvider
      appId={appId}
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
          rpcs: {
            "solana:devnet": {
              rpc: createSolanaRpc(DEVNET_RPC_URL),
              rpcSubscriptions: createSolanaRpcSubscriptions(DEVNET_RPC_WS_URL),
            },
          },
        },
      }}
    >
      <App />
    </PrivyProvider>
  </StrictMode>,
);
