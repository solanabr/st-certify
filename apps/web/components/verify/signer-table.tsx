import { Check, ExternalLink } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { explorerTxUrl } from "@/lib/chain/explorer-url";
import type { VerifySignerView } from "@/lib/db/claim-verify-queries";
import { getT } from "@/lib/i18n/server";

function shortSig(sig: string): string {
  return `${sig.slice(0, 6)}…${sig.slice(-6)}`;
}

function formatSignedAt(iso: string | null, locale: string): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Signer roster with chain-truthful status, sign time, and tx link (plan §Verify). */
export async function SignerTable({
  signers,
}: {
  signers: VerifySignerView[];
}) {
  if (signers.length === 0) return null;
  const { locale, t } = await getT();
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("verify.signers.name")}</TableHead>
            <TableHead>{t("verify.signers.role")}</TableHead>
            <TableHead>{t("verify.signers.signedAt")}</TableHead>
            <TableHead className="text-right">
              {t("verify.signers.tx")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {signers.map((s) => (
            <TableRow key={s.wallet}>
              <TableCell className="font-medium">
                <span className="flex items-center gap-2">
                  <span
                    className={
                      s.signed
                        ? "flex size-4 shrink-0 items-center justify-center rounded-full border border-success bg-success text-success-foreground"
                        : "flex size-4 shrink-0 items-center justify-center rounded-full border border-border"
                    }
                    aria-hidden="true"
                  >
                    {s.signed && <Check className="size-2.5" />}
                  </span>
                  {s.name}
                  <span className="sr-only">
                    {s.signed
                      ? t("verify.signers.signed")
                      : t("verify.signers.awaiting")}
                  </span>
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {s.role ?? "—"}
              </TableCell>
              <TableCell className="tabular-nums text-muted-foreground">
                {formatSignedAt(s.signedAt, locale)}
              </TableCell>
              <TableCell className="text-right">
                {s.txSig ? (
                  <a
                    href={explorerTxUrl(s.txSig)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    {shortSig(s.txSig)}
                    <ExternalLink className="size-3" />
                  </a>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
