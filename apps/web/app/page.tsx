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

/**
 * First-load entrance: a gentle fade + 0.5rem rise, reusing the existing
 * reduced-motion-safe animate-in vocabulary (it self-disables under
 * prefers-reduced-motion). `animation-fill-mode:backwards` holds the pre-delay
 * frame so staggered items don't flash at full opacity before their turn.
 * Callers add a per-item `[animation-delay:*]` (or inline delay) for the stagger.
 */
const MOUNT_RISE =
  "animate-in fade-in slide-in-from-bottom-2 duration-500 [animation-fill-mode:backwards]";

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
      <section className="aurora relative overflow-hidden">
        <div
          aria-hidden="true"
          className="noise pointer-events-none absolute inset-0 -z-10"
        />
        <div className="gradient-solana-accent absolute inset-x-0 top-0 h-1" />
        <div className="mx-auto max-w-6xl px-4 py-28 text-center sm:py-36">
          <span
            className={`mb-8 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 ring-1 ring-inset ring-primary/20 ${MOUNT_RISE}`}
          >
            <span
              className="status-pulse size-1.5 rounded-full bg-primary"
              aria-hidden="true"
            />
            <span className="stbr-eyebrow">{t("common.devnet")}</span>
          </span>
          <h1
            className={`text-5xl font-semibold tracking-tight text-balance sm:text-6xl lg:text-7xl ${MOUNT_RISE} [animation-delay:80ms]`}
          >
            {t("landing.heroTitlePre")}{" "}
            <span className="text-primary">Superteam Brasil</span>
          </h1>
          <p
            className={`mx-auto mt-6 max-w-2xl text-lg text-muted-foreground text-balance sm:text-xl ${MOUNT_RISE} [animation-delay:160ms]`}
          >
            {t("landing.heroSubtitle")}
          </p>
          <div
            className={`mt-12 flex flex-col items-center justify-center gap-3 sm:flex-row ${MOUNT_RISE} [animation-delay:240ms]`}
          >
            <Button asChild size="lg">
              <Link href="/verify">{t("landing.verifyCta")}</Link>
            </Button>
            <LandingCta />
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-24 sm:py-28">
        <h2 className="text-center text-3xl font-semibold tracking-tight text-balance">
          {t("landing.chooseTitle")}
        </h2>
        <div className="mt-12 grid gap-6 sm:grid-cols-3 sm:gap-8">
          {INTENTS.map((intent, i) => {
            const Icon = intent.icon;
            return (
              <Card
                key={intent.href}
                style={{ animationDelay: `${i * 90}ms` }}
                className={`group hover-lift p-6 sm:p-8 ${MOUNT_RISE}`}
              >
                <CardContent className="flex h-full flex-col p-0">
                  <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 via-primary/5 to-brand-yellow/20 text-primary ring-1 ring-inset ring-primary/20 transition-[transform,box-shadow] duration-200 ease-[var(--ease-spring)] group-hover:shadow-[0_10px_28px_-10px_rgba(0,139,76,0.5)] motion-safe:group-hover:scale-110 motion-safe:group-hover:-rotate-3">
                    <Icon className="size-6" aria-hidden="true" />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold">
                    {t(intent.titleKey)}
                  </h3>
                  <p className="mt-2 grow text-sm text-muted-foreground">
                    {t(intent.descKey)}
                  </p>
                  <Button
                    asChild
                    variant="ghost"
                    className="mt-5 self-start px-2"
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

      <div className="mx-auto w-full max-w-6xl px-4">
        <div className="rule-gradient" aria-hidden="true" />
      </div>

      <section className="bg-card/50">
        <div className="mx-auto w-full max-w-6xl px-4 py-24 sm:py-28">
          <h2 className="text-center text-3xl font-semibold tracking-tight text-balance">
            {t("landing.howItWorks")}
          </h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-3 sm:gap-8">
            {steps.map((step) => (
              <Card key={step.number} className="p-6 sm:p-8">
                <CardContent className="p-0">
                  <div className="flex size-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-[0_6px_16px_-6px_rgba(0,139,76,0.55)]">
                    {step.number}
                  </div>
                  <h3 className="mt-5 text-lg font-semibold">{step.title}</h3>
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
