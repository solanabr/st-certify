import Link from "next/link";
import { ArrowRight, CalendarCheck, ShieldCheck, Stamp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { LandingCta } from "@/components/landing-cta";
import { getT } from "@/lib/i18n/server";
import type { TranslationKey } from "@/lib/i18n";

const PROGRAM_ID = process.env.NEXT_PUBLIC_PROGRAM_ID;

/**
 * The three front doors. Each one is a destination any visitor can open:
 * `/events` shows the organizer sign-in rather than a dead end, which is why
 * it belongs here even though the nav only offers it to confirmed creators.
 */
const INTENTS: ReadonlyArray<{
  href: string;
  icon: typeof Stamp;
  titleKey: TranslationKey;
  descKey: TranslationKey;
  ctaKey: TranslationKey;
}> = [
  {
    href: "/certificates",
    icon: Stamp,
    titleKey: "landing.card.issue.title",
    descKey: "landing.card.issue.desc",
    ctaKey: "landing.card.issue.cta",
  },
  {
    href: "/verify",
    icon: ShieldCheck,
    titleKey: "landing.card.verify.title",
    descKey: "landing.card.verify.desc",
    ctaKey: "landing.card.verify.cta",
  },
  {
    href: "/events",
    icon: CalendarCheck,
    titleKey: "landing.card.events.title",
    descKey: "landing.card.events.desc",
    ctaKey: "landing.card.events.cta",
  },
];

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
      <section className="hero-glow relative overflow-hidden border-b border-border">
        <div className="gradient-solana-accent absolute inset-x-0 top-0 h-1" />
        <div className="mx-auto max-w-6xl px-4 py-24 text-center sm:py-32">
          <Badge variant="outline" className="mb-8">
            {t("common.devnet")}
          </Badge>
          <h1 className="text-5xl font-semibold tracking-tight text-balance sm:text-6xl">
            {t("landing.heroTitlePre")}{" "}
            <span className="text-primary">Superteam Brasil</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground text-balance sm:text-xl">
            {t("landing.heroSubtitle")}
          </p>
          <div className="mt-12 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/verify">{t("landing.verifyCta")}</Link>
            </Button>
            <LandingCta />
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-24">
        <h2 className="text-center text-2xl font-semibold tracking-tight">
          {t("landing.chooseTitle")}
        </h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {INTENTS.map((intent) => {
            const Icon = intent.icon;
            return (
              <Card key={intent.href} className="group hover-lift">
                <CardContent className="flex h-full flex-col pt-2">
                  <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15 transition-transform duration-200 ease-[var(--ease-spring)] motion-safe:group-hover:scale-105">
                    <Icon className="size-6" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">
                    {t(intent.titleKey)}
                  </h3>
                  <p className="mt-2 grow text-sm text-muted-foreground">
                    {t(intent.descKey)}
                  </p>
                  <Button
                    asChild
                    variant="ghost"
                    className="mt-4 self-start px-2"
                  >
                    <Link href={intent.href}>
                      {t(intent.ctaKey)}
                      <ArrowRight
                        className="transition-transform group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="border-t border-border bg-card/50">
        <div className="mx-auto w-full max-w-6xl px-4 py-24">
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
        </div>
      </section>

      <section className="border-t border-border">
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
          <p className="max-w-md text-xs text-muted-foreground">
            {t("landing.legalNote")}
          </p>
        </div>
      </section>
    </div>
  );
}
