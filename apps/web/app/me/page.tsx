"use client";

import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
      <h1 className="text-2xl font-semibold tracking-tight">{t("nav.me")}</h1>

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
          <Alert>
            <AlertTitle>{t("me.emptyTitle")}</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-3">
              <span>{t("me.emptyDesc")}</span>
              <Button asChild size="sm">
                <Link href="/certificates">{t("me.browseEditions")}</Link>
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          certs.map((cert) => <CertCard key={cert.address} cert={cert} />)
        )}
      </div>
    </div>
  );
}
