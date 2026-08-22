"use client";

import { useState } from "react";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { useCreateWallet } from "@privy-io/react-auth/solana";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, MailWarning, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { api } from "@/lib/api-client";
import { toAppError } from "@/lib/errors";
import { onAppError } from "@/lib/on-app-error";
import { useMe } from "@/hooks/useMe";
import { useT } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n";
import type { InviteView } from "@/lib/invite/view";
import { inviteStage, isDeadEnd, type InviteStage } from "./invite-state";

function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

const DEAD_COPY: Record<
  string,
  { title: TranslationKey; body: TranslationKey }
> = {
  notFound: {
    title: "invite.dead.notFoundTitle",
    body: "invite.dead.notFoundBody",
  },
  expired: {
    title: "invite.dead.expiredTitle",
    body: "invite.dead.expiredBody",
  },
  closed: {
    title: "invite.dead.closedTitle",
    body: "invite.dead.closedBody",
  },
  wrongAccount: {
    title: "invite.dead.wrongAccountTitle",
    body: "invite.dead.wrongAccountBody",
  },
};

/**
 * The signer's landing spot for the magic link in their invite e-mail.
 *
 * `initialInvite` is the server's read, so the first paint already knows which
 * stage to show — a dead link never flashes a login prompt on its way to the
 * dead-state. The query re-reads afterwards because the seat can change under
 * the visitor (a second tab accepting, the issuer creating the edition).
 */
export function InviteCard({
  token,
  initialInvite,
}: {
  token: string;
  initialInvite: InviteView | null;
}) {
  const { t } = useT();
  const { login, linkWallet } = usePrivy();
  const { createWallet } = useCreateWallet();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const [pending, setPending] = useState<"accept" | "wallet" | null>(null);
  const [wrongAccount, setWrongAccount] = useState(false);

  const { data: invite } = useQuery({
    queryKey: ["invite", token],
    // A dead link stays dead; only a live seat is worth re-reading.
    queryFn: () => api<InviteView>(`/api/invite/${token}`).catch(() => null),
    initialData: initialInvite,
    enabled: initialInvite !== null && initialInvite.status === "invited",
  });

  const wallets = me?.wallets ?? [];
  const stage = inviteStage({
    invite: invite ?? null,
    authenticated: me?.authenticated ?? false,
    wallets,
    wrongAccount,
  });

  async function accept(wallet: string): Promise<void> {
    setPending("accept");
    try {
      const updated = await api<InviteView>(`/api/invite/${token}/accept`, {
        json: { wallet },
      });
      queryClient.setQueryData(["invite", token], updated);
    } catch (err) {
      // The seat is fine; this account just isn't the one it was sent to. That
      // is a dead end with its own instructions, not a transient failure worth
      // a toast and a re-read.
      const code = toAppError(err).code;
      if (code === "INVITE_EMAIL_MISMATCH") {
        setWrongAccount(true);
        return;
      }
      // Recoverable right here — the signer picks another wallet — so this
      // one stays a toast, localized rather than echoing the server's pt-BR.
      if (code === "INVITE_WALLET_TAKEN") {
        toast.error(t("invite.wallet.taken"));
        return;
      }
      onAppError(err);
      // The seat may have moved on (accepted elsewhere, edition created) —
      // re-read so the page shows the state that actually blocked us.
      void queryClient.invalidateQueries({ queryKey: ["invite", token] });
    } finally {
      setPending(null);
    }
  }

  async function addWallet(): Promise<void> {
    setPending("wallet");
    try {
      await createWallet();
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    } catch (err) {
      onAppError(err);
    } finally {
      setPending(null);
    }
  }

  /**
   * Privy provisions an embedded wallet on login (`createOnLogin:
   * "users-without-wallets"`), and the session read that follows can land
   * before it finishes — leaving someone who already has a wallet looking at
   * an offer to create one. Re-reading the session is the whole fix.
   */
  function recheckSession(): void {
    void queryClient.invalidateQueries({ queryKey: ["me"] });
  }

  if (isDeadEnd(stage)) {
    return <DeadEnd stage={stage} issuer={invite?.issuer ?? null} />;
  }

  // Past the dead ends every stage has a seat to describe.
  if (!invite) return null;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="stbr-eyebrow">{t("invite.eyebrow")}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("invite.greeting", { name: invite.name })}
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          {t("invite.invitedAs", {
            role: invite.role,
            edition: invite.editionName,
          })}
        </p>
      </header>

      <Separator />

      {stage === "accepted" ? (
        <Accepted invite={invite} />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {t("invite.whatItMeans")}
          </p>
          {stage === "login" && (
            <section className="elevate rounded-xl border border-border bg-card p-5">
              <h2 className="text-lg font-medium">{t("invite.login.title")}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("invite.login.body")}
              </p>
              <Button className="mt-4" onClick={() => login()}>
                {t("invite.login.cta")}
              </Button>
            </section>
          )}
          {stage === "createWallet" && (
            <section className="elevate rounded-xl border border-border bg-card p-5">
              <h2 className="text-lg font-medium">
                {t("invite.createWallet.title")}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("invite.createWallet.body")}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => void addWallet()}
                  disabled={pending !== null}
                  aria-busy={pending === "wallet"}
                >
                  {pending === "wallet"
                    ? t("invite.createWallet.creating")
                    : t("invite.createWallet.cta")}
                </Button>
                <Button
                  variant="ghost"
                  onClick={recheckSession}
                  disabled={pending !== null}
                >
                  {t("invite.createWallet.link")}
                </Button>
              </div>
            </section>
          )}
          {stage === "chooseWallet" && (
            <WalletChoice
              wallets={wallets}
              pending={pending === "accept"}
              onAccept={(wallet) => void accept(wallet)}
              onLinkWallet={() => linkWallet()}
            />
          )}
        </>
      )}
    </div>
  );
}

function WalletChoice({
  wallets,
  pending,
  onAccept,
  onLinkWallet,
}: {
  wallets: readonly string[];
  pending: boolean;
  onAccept: (wallet: string) => void;
  /** For a signer whose intended signing wallet isn't linked to the account yet. */
  onLinkWallet: () => void;
}) {
  const { t } = useT();
  const [selected, setSelected] = useState<string>(wallets[0] ?? "");

  return (
    <section className="elevate rounded-xl border border-border bg-card p-5">
      <h2 className="text-lg font-medium">{t("invite.wallet.title")}</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("invite.wallet.body")}
      </p>

      <fieldset className="mt-4 flex flex-col gap-2">
        <legend className="sr-only">{t("invite.wallet.title")}</legend>
        {wallets.map((wallet) => (
          <label
            key={wallet}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
          >
            <input
              type="radio"
              name="invite-wallet"
              value={wallet}
              checked={selected === wallet}
              onChange={() => setSelected(wallet)}
              className="size-4 accent-primary"
              aria-label={t("invite.wallet.select", {
                wallet: truncateAddress(wallet),
              })}
            />
            <Wallet
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="font-mono text-xs" title={wallet}>
              {truncateAddress(wallet)}
            </span>
          </label>
        ))}
      </fieldset>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          onClick={() => onAccept(selected)}
          disabled={pending || selected === ""}
          aria-busy={pending}
        >
          {pending ? t("invite.wallet.confirming") : t("invite.wallet.confirm")}
        </Button>
        <Button variant="ghost" onClick={onLinkWallet} disabled={pending}>
          {t("invite.wallet.addAnother")}
        </Button>
      </div>
    </section>
  );
}

function Accepted({ invite }: { invite: InviteView }) {
  const { t } = useT();

  return (
    <section className="elevate rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <CheckCircle2
          className="mt-0.5 size-5 shrink-0 text-primary"
          aria-hidden="true"
        />
        <div>
          <h2 className="text-lg font-medium">{t("invite.accepted.title")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("invite.accepted.body", { edition: invite.editionName })}
          </p>
        </div>
      </div>

      {invite.wallet && (
        <p className="mt-4 flex flex-wrap items-baseline gap-2 text-sm">
          <span className="text-muted-foreground">
            {t("invite.accepted.walletLabel")}
          </span>
          <span className="font-mono text-xs" title={invite.wallet}>
            {truncateAddress(invite.wallet)}
          </span>
        </p>
      )}

      <Button asChild className="mt-4">
        <Link href="/sign">{t("invite.accepted.cta")}</Link>
      </Button>
    </section>
  );
}

/**
 * The three ways this link can be a dead end. Each one names who to talk to,
 * because the visitor cannot fix any of them from here and the issuer is the
 * only party who can reopen the seat.
 */
function DeadEnd({
  stage,
  issuer,
}: {
  stage: InviteStage;
  issuer: InviteView["issuer"];
}) {
  const { t } = useT();
  const copy = DEAD_COPY[stage];
  if (!copy) return null;

  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <MailWarning className="size-4" aria-hidden="true" />
        <AlertTitle>{t(copy.title)}</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-3">
          <span>{t(copy.body)}</span>
          {issuer === null ? (
            <span>{t("invite.dead.contactUnknown")}</span>
          ) : issuer.contactUrl ? (
            <Button asChild variant="outline" size="sm">
              <a
                href={issuer.contactUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                {t("invite.dead.contactLink", { issuer: issuer.name })}
              </a>
            </Button>
          ) : (
            <span>{t("invite.dead.contactName", { issuer: issuer.name })}</span>
          )}
        </AlertDescription>
      </Alert>

      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link href="/">{t("invite.dead.home")}</Link>
      </Button>
    </div>
  );
}
