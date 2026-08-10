import { notFound } from "next/navigation";
import { requireSysadmin } from "@/lib/auth";

/**
 * Middleware only redirects for UX; this is the real server-side re-check.
 * 404, not redirect/403, so an unauthorized direct hit can't distinguish
 * "you're not allowed" from "this route doesn't exist".
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireSysadmin();
  } catch {
    notFound();
  }

  return <>{children}</>;
}
