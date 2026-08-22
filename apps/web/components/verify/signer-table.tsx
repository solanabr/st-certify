import { Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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

/** Name plus its signed/awaiting mark, shared by the table rows and the mobile cards. */
function SignerName({
  signer,
  locale,
}: {
  signer: VerifySignerView;
  locale: Locale;
}) {
  return (
    <span className="flex items-center gap-2">
      <span
        className={
          signer.signed
            ? "flex size-4 shrink-0 items-center justify-center rounded-full border border-success bg-success text-success-foreground"
            : "flex size-4 shrink-0 items-center justify-center rounded-full border border-border"
        }
        aria-hidden="true"
      >
        {signer.signed && <Check className="size-2.5" />}
      </span>
      {signer.name}
      <span className="sr-only">
        {translate(
          locale,
          signer.signed ? "verify.signers.signed" : "verify.signers.awaiting",
        )}
      </span>
    </span>
  );
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
    <>
      <div className="hidden overflow-x-auto sm:block">
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
                  <SignerName signer={s} locale={locale} />
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

      {/* Phones: the three columns stack, so a long name never pushes the date
          off-screen and the signed mark stays next to the person it describes. */}
      <div className="flex flex-col gap-3 sm:hidden">
        {signers.map((s) => (
          <Card key={s.wallet}>
            <CardContent className="space-y-2">
              <p className="font-medium">
                <SignerName signer={s} locale={locale} />
              </p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted-foreground">
                  {t("verify.signers.role")}
                </dt>
                <dd>{s.role ?? "—"}</dd>
                <dt className="text-muted-foreground">
                  {t("verify.signers.signedAt")}
                </dt>
                <dd className="tabular-nums">
                  {formatSignedAt(s.signedAt, locale)}
                </dd>
              </dl>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
