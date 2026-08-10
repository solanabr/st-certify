"use client";

import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CertCard } from "@/components/cert-card";
import { WalletStrip } from "@/components/wallet-strip";
import { useMe } from "@/hooks/useMe";
import { useMyCertificates } from "@/hooks/useMyCertificates";

export default function MePage() {
  const { data: me } = useMe();
  const { data: certs, isLoading, isError, refetch } = useMyCertificates();
  const wallet = me?.wallets[0];

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">
        Meus certificados
      </h1>

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
            <AlertTitle>Falha ao carregar seus certificados</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-3">
              <span>Tente novamente em instantes.</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void refetch()}
              >
                Tentar novamente
              </Button>
            </AlertDescription>
          </Alert>
        ) : !certs || certs.length === 0 ? (
          <Alert>
            <AlertTitle>Você ainda não tem certificados</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-3">
              <span>Encontre uma edição aberta para solicitar o seu.</span>
              <Button asChild size="sm">
                <Link href="/editions">Ver edições abertas</Link>
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
