import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";

/**
 * Middleware only redirects for UX (no session cookie -> back to /);
 * this is the real server-side re-check. 404, not redirect, so an
 * unauthenticated direct hit doesn't distinguish "route exists" from "route
 * doesn't exist" (same policy as /studio, /sign).
 */
export default async function MeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireUser();
  } catch {
    notFound();
  }

  return <>{children}</>;
}
