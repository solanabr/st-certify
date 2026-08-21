export interface IssuerIdentity {
  name: string;
  contactUrl?: string;
  cnpj?: string;
}

/**
 * Who the verify page and the exported PDF name as the issuer, from the
 * `ISSUER_*` environment.
 *
 * Returns null when `ISSUER_NAME` is unset, and the identity block hides
 * instead of printing a guess — direct contact with the issuer is the fallback
 * every real verifier uses, so a wrong name there is worse than no name.
 * Server-only values (never `NEXT_PUBLIC_`), read in server components and
 * route handlers.
 */
export function configuredIssuer(): IssuerIdentity | null {
  const name = process.env.ISSUER_NAME?.trim();
  if (!name) return null;

  return {
    name,
    contactUrl: process.env.ISSUER_CONTACT_URL?.trim() || undefined,
    cnpj: process.env.ISSUER_CNPJ?.trim() || undefined,
  };
}
