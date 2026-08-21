import { notFound } from "next/navigation";
import { requireCertifier } from "@/lib/auth";

/**
 * Server-side role re-check (middleware only redirects for UX). 404 — not a
 * redirect — so a non-certifier direct hit can't distinguish route-exists from
 * route-doesn't (same policy as /studio, /me).
 */
export default async function SignLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireCertifier();
  } catch {
    notFound();
  }
  return <>{children}</>;
}
