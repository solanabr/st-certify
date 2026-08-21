import { Check } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { VerifySignerView } from "@/lib/db/claim-verify-queries";
import { translate } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locales";

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

/**
 * Who signed, in what capacity, and when. The signature transactions used to
 * sit in a fourth column here; they moved into "Detalhes técnicos" so this
 * table reads as a list of people rather than a list of hashes.
 */
export function SignerTable({
  signers,
  locale,
}: {
  signers: VerifySignerView[];
  locale: Locale;
}) {
  if (signers.length === 0) return null;
  const t = (key: Parameters<typeof translate>[1]): string =>
    translate(locale, key);

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("verify.signers.name")}</TableHead>
            <TableHead>{t("verify.signers.role")}</TableHead>
            <TableHead>{t("verify.signers.signedAt")}</TableHead>
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
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
