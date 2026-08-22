/**
 * The UI-mock guard and its role vocabulary, with zero server imports.
 *
 * This is deliberately separate from `./index`: `lib/db/certificator-queries.ts`
 * exports `callerSignerWallet`, which `app/sign/page.tsx` and
 * `components/certificator/edition-group.tsx` import as client components — so
 * that module (and therefore anything it imports) lands in the browser bundle.
 * `./index` reaches for `next/headers`, which cannot. Server code should import
 * from `@/lib/mock`; anything reachable from a client component imports here.
 */

export type MockRole = "anon" | "student" | "signer" | "admin" | "creator";

export const MOCK_ROLES: readonly MockRole[] = [
  "anon",
  "student",
  "signer",
  "admin",
  "creator",
];

export const MOCK_ROLE_COOKIE = "mock_role";

/** The role assumed when no cookie is set — the widest UI surface. */
export const DEFAULT_MOCK_ROLE: MockRole = "admin";

/**
 * Whether this process should serve fixtures instead of Privy/Supabase/chain.
 *
 * Both halves are load-bearing. The env flag is what a reviewer opts in with;
 * the `NODE_ENV` check is what makes the opt-in impossible to carry into a
 * production build, where Next inlines both literals and the whole branch —
 * fixtures included — folds away as dead code. Read at call time, not module
 * load, so tests can stub the environment.
 */
export function isUiMock(): boolean {
  return (
    process.env.NEXT_PUBLIC_UI_MOCK === "1" &&
    process.env.NODE_ENV !== "production"
  );
}

/** Coerces a raw cookie value to a role, falling back to the default. */
export function parseMockRole(raw: string | null | undefined): MockRole {
  return MOCK_ROLES.find((role) => role === raw) ?? DEFAULT_MOCK_ROLE;
}
