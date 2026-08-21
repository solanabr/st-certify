"use client";

import Link from "next/link";
import { ScrollText } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal } from "@/components/landing/reveal";
import { CertCard } from "@/components/cert-card";
import { WalletStrip } from "@/components/wallet-strip";
import { useMe } from "@/hooks/useMe";
import { useMyCertificates } from "@/hooks/useMyCertificates";
import { useT } from "@/lib/i18n";

export default function MePage() {
  const { data: me } = useMe();
  const { data: certs, isLoading, isError, refetch } = useMyCertificates();
  const { t } = useT();
  const wallet = me?.wallets[0];

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div>
        <p className="stbr-eyebrow">{t("me.eyebrow")}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("me.title")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("me.subtitle")}</p>
      </div>

      {wallet && (
        <div className="mt-6">
          <WalletStrip wallet={wallet} />
        </div>
      )}

      <div className="mt-8 space-y-4">
        {isLoading ? (
          <>
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
          </>
        ) : isError ? (
          <Alert variant="destructive">
            <AlertTitle>{t("me.loadErrorTitle")}</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-3">
              <span>{t("me.loadErrorDesc")}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void refetch()}
              >
                {t("me.retry")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : !certs || certs.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-border px-6 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 via-primary/5 to-brand-yellow/20 text-primary ring-1 ring-inset ring-primary/20">
              <ScrollText className="size-6" aria-hidden="true" />
            </span>
            <p className="mt-4 text-base font-medium">{t("me.emptyTitle")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("me.emptyDesc")}
            </p>
            <Button asChild size="sm" className="mt-4">
              <Link href="/certificates">{t("me.browseEditions")}</Link>
            </Button>
          </div>
        ) : (
          certs.map((cert, i) => (
            <Reveal key={cert.address} delay={i * 60}>
              <CertCard cert={cert} />
            </Reveal>
          ))
        )}
      </div>
    </div>
  );
}
