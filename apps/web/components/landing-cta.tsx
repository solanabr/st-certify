"use client";

import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { useMe } from "@/hooks/useMe";
import { useT, type TranslationKey } from "@/lib/i18n";

const DASHBOARD_LABEL_KEY: Record<
  "sysadmin" | "certifier" | "student",
  TranslationKey
> = {
  sysadmin: "cta.goAdmin",
  certifier: "cta.goCertificator",
  student: "cta.goMyCerts",
};

const DASHBOARD_HREF: Record<"sysadmin" | "certifier" | "student", string> = {
  sysadmin: "/studio",
  certifier: "/sign",
  student: "/me",
};

/** The one personalized sliver of an otherwise-static landing page — no skeleton, brief flash at most. */
export function LandingCta() {
  const { ready, authenticated, login } = usePrivy();
  const { data: me } = useMe();
  const { t } = useT();

  if (!ready) {
    return <div className="h-10 w-40" aria-hidden="true" />;
  }

  if (!authenticated || !me?.authenticated) {
    return (
      <Button onClick={() => login()} variant="outline" size="lg">
        {t("nav.signIn")}
      </Button>
    );
  }

  const role = me.isCertifier ? "certifier" : me.role;

  return (
    <Button asChild variant="outline" size="lg">
      <Link href={DASHBOARD_HREF[role]}>{t(DASHBOARD_LABEL_KEY[role])}</Link>
    </Button>
  );
}
