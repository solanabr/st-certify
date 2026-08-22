"use client";

import { ChevronRight, ExternalLink } from "lucide-react";
import { useCertificateChainCheck } from "@/components/verify/verify-chain-stamp";
import { explorerAddressUrl, explorerTxUrl } from "@/lib/chain/explorer-url";
import type { VerifySignerView } from "@/lib/db/claim-verify-queries";
import { useT } from "@/lib/i18n";

function shortSig(value: string): string {
  return `${value.slice(0, 6)}…${value.slice(-6)}`;
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-all font-mono text-xs">{children}</dd>
    </div>
  );
}

function ExplorerLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-primary hover:underline"
    >
      {label}
      <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
    </a>
  );
}

/**
 * Every address, hash, slot and transaction on one page — collapsed.
 *
 * The audit found the verdict page leading with PDAs and signature hashes,
 * which is the vocabulary of the two people who built it and of nobody who
 * needs to check a diploma. None of it is removed (it is what makes the claim
 * checkable), it just stops being the first thing a registrar reads.
 *
 * The live slot comes from the page's single shared chain-check — the same
 * query key as the verdict stamp, so opening this costs no extra RPC call.
 */
export function VerifyTechnicalDetails({
  certAddress,
  editionAddress,
  asset,
  sha256,
  signers,
}: {
  certAddress: string;
  editionAddress: string;
  asset: string | null;
  sha256: string | null;
  signers: VerifySignerView[];
}) {
  const { t } = useT();
  const chain = useCertificateChainCheck(certAddress);
  const signed = signers.filter((s) => s.txSig);

  return (
    <details className="group rounded-lg border border-border print:hidden">
      <summary className="flex cursor-pointer list-none items-center gap-2 p-4 text-sm font-medium marker:content-none">
        <ChevronRight
          className="size-4 shrink-0 transition-transform group-open:rotate-90"
          aria-hidden="true"
        />
        {t("verify.tech.title")}
      </summary>

      <div className="space-y-4 border-t border-border p-4">
        <p className="text-xs text-muted-foreground">{t("verify.tech.hint")}</p>

        <dl className="grid gap-3 sm:grid-cols-2">
          <Row label={t("verify.tech.certAddress")}>
            <ExplorerLink
              href={explorerAddressUrl(certAddress)}
              label={certAddress}
            />
          </Row>
          <Row label={t("verify.tech.editionAddress")}>
            <ExplorerLink
              href={explorerAddressUrl(editionAddress)}
              label={editionAddress}
            />
          </Row>
          {asset && (
            <Row label={t("verify.tech.asset")}>
              <ExplorerLink href={explorerAddressUrl(asset)} label={asset} />
            </Row>
          )}
          {sha256 && <Row label={t("verify.tech.sha256")}>{sha256}</Row>}
          <Row label={t("verify.tech.slot")}>
            {chain.data?.exists ? (
              <span className="tabular-nums">{chain.data.slot}</span>
            ) : (
              <span className="font-sans text-muted-foreground">
                {t("verify.tech.unavailable")}
              </span>
            )}
          </Row>
        </dl>

        {signed.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground">
              {t("verify.tech.signerTxs")}
            </p>
            <ul className="mt-1 space-y-1">
              {signed.map((s) => (
                <li key={s.wallet} className="flex flex-wrap gap-2 text-xs">
                  <span className="text-muted-foreground">{s.name}</span>
                  <ExplorerLink
                    href={explorerTxUrl(s.txSig as string)}
                    label={shortSig(s.txSig as string)}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}
