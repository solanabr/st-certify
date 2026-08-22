import { Building2, ExternalLink } from "lucide-react";
import { configuredIssuer } from "@/lib/issuer";
import { translate } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locales";

/**
 * Who issued this, in plain language, above all the cryptography.
 *
 * It is here because direct contact with the issuer is the fallback every real
 * verifier reaches for, and a verification page that cannot answer "who do I
 * call?" sends them back to a search engine. Renders nothing when `ISSUER_NAME`
 * is unset — an unattributed page is honest, a guessed attribution is not.
 */
export function VerifyIssuer({ locale }: { locale: Locale }) {
  const issuer = configuredIssuer();
  if (!issuer) return null;

  const t = (key: Parameters<typeof translate>[1]): string =>
    translate(locale, key);

  return (
    <section className="rounded-lg border border-border p-4">
      <h2 className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Building2 className="size-3.5" aria-hidden="true" />
        {t("verify.issuer.title")}
      </h2>

      <p className="mt-1 text-base font-medium">{issuer.name}</p>

      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        {issuer.contactUrl && (
          <div>
            <dt className="text-xs text-muted-foreground">
              {t("verify.issuer.contact")}
            </dt>
            <dd>
              <a
                href={issuer.contactUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                {issuer.contactUrl.replace(/^https?:\/\//, "")}
                <ExternalLink className="size-3" aria-hidden="true" />
              </a>
            </dd>
          </div>
        )}
        {issuer.cnpj && (
          <div>
            <dt className="text-xs text-muted-foreground">
              {t("verify.issuer.cnpj")}
            </dt>
            <dd className="tabular-nums">{issuer.cnpj}</dd>
          </div>
        )}
      </dl>

      <p className="mt-3 text-xs text-muted-foreground">
        {t("verify.issuer.note")}
      </p>
    </section>
  );
}
