import { useCallback, useState } from "react";
import "./App.css";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets, useStandardWallets } from "@privy-io/react-auth/solana";
import type { Base64EncodedWireTransaction } from "@solana/kit";
import {
  address,
  appendTransactionMessageInstruction,
  compileTransaction,
  createSolanaRpc,
  createTransactionMessage,
  getBase64Decoder,
  getTransactionEncoder,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import { getAddMemoInstruction } from "@solana-program/memo";

const DEVNET_RPC_URL = "https://api.devnet.solana.com";
const rpc = createSolanaRpc(DEVNET_RPC_URL);

type LogLevel = "info" | "success" | "error";
type LogEntry = { level: LogLevel; text: string };

const base64Decoder = getBase64Decoder();
const transactionEncoder = getTransactionEncoder();

/** Builds one memo-only devnet transaction, compiled and wire-encoded (unsigned). */
function buildUnsignedMemoTx(
  feePayer: ReturnType<typeof address>,
  blockhash: { blockhash: string; lastValidBlockHeight: bigint } & Record<
    string,
    unknown
  >,
  memoText: string,
): Uint8Array {
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(feePayer, m),
    (m) =>
      setTransactionMessageLifetimeUsingBlockhash(
        blockhash as Parameters<
          typeof setTransactionMessageLifetimeUsingBlockhash
        >[0],
        m,
      ),
    (m) =>
      appendTransactionMessageInstruction(
        getAddMemoInstruction({ memo: memoText }),
        m,
      ),
  );
  const compiled = compileTransaction(message);
  return transactionEncoder.encode(compiled) as Uint8Array;
}

export function App() {
  const { ready, authenticated, login, logout, user, error } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { wallets: standardWallets } = useStandardWallets();
  const [log, setLog] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState(false);

  const appendLog = useCallback((level: LogLevel, text: string) => {
    setLog((prev) => [...prev, { level, text }]);
  }, []);

  const loginWithTestAccount = useCallback((): void => {
    login({ prefill: { type: "email", value: "test@privy.io" } });
  }, [login]);

  const batchSignThreeMemos = useCallback(async (): Promise<void> => {
    setBusy(true);
    setLog([]);
    try {
      const wallet = wallets[0];
      if (!wallet) throw new Error("No connected Solana wallet.");

      const standardWallet = standardWallets.find((w) =>
        w.accounts.some((a) => a.address === wallet.address),
      );
      if (!standardWallet)
        throw new Error("No matching wallet-standard wallet for this account.");

      const account = standardWallet.accounts.find(
        (a) => a.address === wallet.address,
      );
      if (!account) throw new Error("No matching wallet-standard account.");

      const signFeature = standardWallet.features["solana:signTransaction"];
      if (!signFeature)
        throw new Error("Wallet does not expose solana:signTransaction.");

      appendLog("info", `Using wallet ${wallet.address}`);

      const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
      appendLog("info", `Fetched blockhash ${latestBlockhash.blockhash}`);

      const feePayer = address(wallet.address);
      const unsigned = [1, 2, 3].map((n) =>
        buildUnsignedMemoTx(
          feePayer,
          latestBlockhash,
          `st-certify spike memo ${n}/3 — ${Date.now()}`,
        ),
      );
      appendLog("info", `Built ${unsigned.length} unsigned transactions.`);

      // Single variadic call — one wallet-standard round trip signs all 3, silently
      // (embedded wallet + showWalletUIs:false means no per-tx popup).
      const signed = await signFeature.signTransaction(
        ...unsigned.map((transaction) => ({
          account,
          transaction,
          chain: "solana:devnet" as const,
        })),
      );
      appendLog(
        "success",
        `Signed ${signed.length} transactions in one batched call.`,
      );

      const base64Txs = signed.map(
        (s) =>
          base64Decoder.decode(
            s.signedTransaction,
          ) as Base64EncodedWireTransaction,
      );
      base64Txs.forEach((b64, i) =>
        appendLog("info", `Signed tx ${i + 1}/3 (base64): ${b64}`),
      );

      for (const [i, b64] of base64Txs.entries()) {
        const signature = await rpc
          .sendTransaction(b64, { encoding: "base64" })
          .send();
        appendLog("success", `Sent tx ${i + 1}/3 → signature ${signature}`);
      }
    } catch (err) {
      appendLog("error", err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [wallets, standardWallets, appendLog]);

  return (
    <main className="page">
      <h1>Privy Solana Spike</h1>
      <p className="subtitle">
        M0-spikeB — @privy-io/react-auth@3.37 Solana login + batch signing
      </p>

      <section className="panel" aria-labelledby="status-heading">
        <h2 id="status-heading">Status</h2>
        <dl className="status-grid">
          <dt>Privy ready</dt>
          <dd>{ready ? "yes" : "no"}</dd>
          <dt>Authenticated</dt>
          <dd>{authenticated ? "yes" : "no"}</dd>
          <dt>Wallets ready</dt>
          <dd>{walletsReady ? "yes" : "no"}</dd>
          <dt>Init error</dt>
          <dd>{error ? error.message : "none"}</dd>
        </dl>
      </section>

      <section className="panel" aria-labelledby="auth-heading">
        <h2 id="auth-heading">Login</h2>
        {!authenticated ? (
          <div className="button-row">
            <button type="button" onClick={() => login()} disabled={!ready}>
              Log in (email or wallet)
            </button>
            <button
              type="button"
              onClick={loginWithTestAccount}
              disabled={!ready}
            >
              Log in with test account
            </button>
          </div>
        ) : (
          <div className="button-row">
            <span>Logged in as {user?.id ?? "unknown"}</span>
            <button type="button" onClick={() => void logout()}>
              Log out
            </button>
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="wallets-heading">
        <h2 id="wallets-heading">Wallets ({wallets.length})</h2>
        {wallets.length === 0 ? (
          <p>No wallets connected yet.</p>
        ) : (
          <ul>
            {wallets.map((w) => (
              <li key={w.address}>
                <code>{w.address}</code>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel" aria-labelledby="batch-heading">
        <h2 id="batch-heading">Batch sign</h2>
        <button
          type="button"
          onClick={() => void batchSignThreeMemos()}
          disabled={busy || !authenticated || wallets.length === 0}
          aria-busy={busy}
        >
          {busy ? "Signing…" : "Batch sign 3 memos"}
        </button>
        <div className="log" role="log" aria-live="polite">
          {log.length === 0 ? (
            <p className="log-empty">No activity yet.</p>
          ) : (
            log.map((entry, i) => (
              <p key={i} className={`log-entry log-${entry.level}`}>
                {entry.text}
              </p>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
