import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { LandingCta } from "@/components/landing-cta";

const STEPS = [
  {
    number: "1",
    title: "Solicite",
    description:
      "Encontre a edição do seu curso ou evento e envie seu nome para certificação.",
  },
  {
    number: "2",
    title: "Assinaturas on-chain",
    description:
      "Cada signatário designado assina sua solicitação diretamente na Solana.",
  },
  {
    number: "3",
    title: "NFT intransferível",
    description:
      "Com todas as assinaturas, resgate seu certificado como um NFT soulbound — seu, para sempre.",
  },
] as const;

const PROGRAM_ID = process.env.NEXT_PUBLIC_PROGRAM_ID;

export default function Home() {
  return (
    <div className="flex flex-col">
      <section className="relative overflow-hidden border-b border-border">
        <div className="gradient-solana-accent absolute inset-x-0 top-0 h-1" />
        <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:py-28">
          <Badge variant="outline" className="mb-6">
            Devnet
          </Badge>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Certificados on-chain da{" "}
            <span className="text-primary">Superteam Brasil</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground text-balance">
            Emitidos por quem assina, verificáveis por qualquer pessoa, para
            sempre.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/verify">Verificar um certificado</Link>
            </Button>
            <LandingCta />
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-20">
        <h2 className="text-center text-2xl font-semibold tracking-tight">
          Como funciona
        </h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {STEPS.map((step) => (
            <Card key={step.number}>
              <CardContent className="pt-2">
                <div className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {step.number}
                </div>
                <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {step.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-t border-border bg-card/50">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-10 text-center">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Badge variant="outline">Rede: Devnet</Badge>
            {PROGRAM_ID ? (
              <Badge variant="outline" className="font-mono">
                Programa: {PROGRAM_ID.slice(0, 4)}…{PROGRAM_ID.slice(-4)}
              </Badge>
            ) : (
              <Badge variant="outline">Programa: aguardando deploy</Badge>
            )}
          </div>
          <Separator className="my-2 max-w-xs" />
          <p className="max-w-md text-xs text-muted-foreground">
            Toda solicitação, assinatura e emissão fica registrada publicamente
            na blockchain Solana.
          </p>
        </div>
      </section>
    </div>
  );
}
