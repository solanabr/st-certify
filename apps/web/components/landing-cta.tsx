"use client";

import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { useMe } from "@/hooks/useMe";

const DASHBOARD_LABEL: Record<"sysadmin" | "certifier" | "student", string> = {
  sysadmin: "Ir para a administração",
  certifier: "Ir para o certificador",
  student: "Ver meus certificados",
};

const DASHBOARD_HREF: Record<"sysadmin" | "certifier" | "student", string> = {
  sysadmin: "/admin",
  certifier: "/certificator",
  student: "/me",
};

/** The one personalized sliver of an otherwise-static landing page — no skeleton, brief flash at most. */
export function LandingCta() {
  const { ready, authenticated, login } = usePrivy();
  const { data: me } = useMe();

  if (!ready) {
    return <div className="h-10 w-40" aria-hidden="true" />;
  }

  if (!authenticated || !me?.authenticated) {
    return (
      <Button onClick={() => login()} variant="outline" size="lg">
        Entrar
      </Button>
    );
  }

  const role = me.isCertifier ? "certifier" : me.role;

  return (
    <Button asChild variant="outline" size="lg">
      <Link href={DASHBOARD_HREF[role]}>{DASHBOARD_LABEL[role]}</Link>
    </Button>
  );
}
