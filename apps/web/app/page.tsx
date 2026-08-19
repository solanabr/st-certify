import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { LandingCta } from "@/components/landing-cta";
import { getT } from "@/lib/i18n/server";

const PROGRAM_ID = process.env.NEXT_PUBLIC_PROGRAM_ID;

export default async function Home() {
  const { t } = await getT();

  const steps = [
    {
      number: "1",
      title: t("landing.step1.title"),
      description: t("landing.step1.desc"),
    },
    {
      number: "2",
      title: t("landing.step2.title"),
      description: t("landing.step2.desc"),
    },
    {
      number: "3",
      title: t("landing.step3.title"),
      description: t("landing.step3.desc"),
    },
  ];

  return (
    <div className="flex flex-col">
      <section className="relative overflow-hidden border-b border-border">
        <div className="gradient-solana-accent absolute inset-x-0 top-0 h-1" />
        <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:py-28">
          <Badge variant="outline" className="mb-6">
            Devnet
          </Badge>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            {t("landing.heroTitlePre")}{" "}
            <span className="text-primary">Superteam Brasil</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground text-balance">
            {t("landing.heroSubtitle")}
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/verify">{t("landing.verifyCta")}</Link>
            </Button>
            <LandingCta />
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-20">
        <h2 className="text-center text-2xl font-semibold tracking-tight">
          {t("landing.howItWorks")}
        </h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {steps.map((step) => (
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
            <Badge variant="outline">{t("landing.network")}</Badge>
            {PROGRAM_ID ? (
              <Badge variant="outline" className="font-mono" title={PROGRAM_ID}>
                {t("landing.program")}: {PROGRAM_ID.slice(0, 4)}…
                {PROGRAM_ID.slice(-4)}
              </Badge>
            ) : (
              <Badge variant="outline">{t("landing.programPending")}</Badge>
            )}
          </div>
          <Separator className="my-2 max-w-xs" />
          <p className="max-w-md text-xs text-muted-foreground">
            {t("landing.publicRecord")}
          </p>
        </div>
      </section>
    </div>
  );
}
