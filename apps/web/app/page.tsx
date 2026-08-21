import Link from "next/link";
import {
  ArrowRight,
  Award,
  CalendarCheck,
  Clock,
  Eye,
  FileSignature,
  Fingerprint,
  Globe,
  Landmark,
  Link2,
  Lock,
  Scale,
  ScrollText,
  ShieldCheck,
  Stamp,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { LandingCta } from "@/components/landing-cta";
import { HeroSeal } from "@/components/landing/hero-seal";
import { HeroVerifyDemo } from "@/components/landing/hero-verify-demo";
import { Parallax } from "@/components/landing/parallax";
import { Reveal } from "@/components/landing/reveal";
import { StepConnector } from "@/components/landing/step-connector";
import { TiltCard } from "@/components/landing/tilt-card";
import { getT } from "@/lib/i18n/server";
import type { TranslationKey } from "@/lib/i18n";

const PROGRAM_ID = process.env.NEXT_PUBLIC_PROGRAM_ID;

/** Qualitative value chips under the hero — no fabricated metrics, just what the
 * product actually guarantees. */
const VALUE_CHIPS: ReadonlyArray<{ icon: typeof Stamp; key: TranslationKey }> =
  [
    { icon: Globe, key: "landing.chip.verifiable" },
    { icon: Users, key: "landing.chip.multisig" },
    { icon: Link2, key: "landing.chip.onchain" },
    { icon: Fingerprint, key: "landing.chip.lgpd" },
  ];

/**
 * The three front doors, now a bento: Issue + Verify are the prominent pair
 * (the two most common actions), Events is a full-width banner beneath them.
 * `/events` shows the organizer sign-in rather than a dead end, which is why it
 * belongs here even though the nav only offers it to confirmed creators.
 */
const INTENTS: ReadonlyArray<{
  href: string;
  icon: typeof Stamp;
  tagKey: TranslationKey;
  titleKey: TranslationKey;
  descKey: TranslationKey;
  ctaKey: TranslationKey;
  span: string;
  wide: boolean;
}> = [
  {
    href: "/certificates",
    icon: Stamp,
    tagKey: "landing.card.issue.tag",
    titleKey: "landing.card.issue.title",
    descKey: "landing.card.issue.desc",
    ctaKey: "landing.card.issue.cta",
    span: "lg:col-span-3",
    wide: false,
  },
  {
    href: "/verify",
    icon: ShieldCheck,
    tagKey: "landing.card.verify.tag",
    titleKey: "landing.card.verify.title",
    descKey: "landing.card.verify.desc",
    ctaKey: "landing.card.verify.cta",
    span: "lg:col-span-3",
    wide: false,
  },
  {
    href: "/events",
    icon: CalendarCheck,
    tagKey: "landing.card.events.tag",
    titleKey: "landing.card.events.title",
    descKey: "landing.card.events.desc",
    ctaKey: "landing.card.events.cta",
    span: "lg:col-span-6",
    wide: true,
  },
];

/** Why-it-holds-up bento — asymmetric: the audit trail is the marquee (wide),
 * the rest are equal supporting tiles. Informational, no CTA. */
const FEATURES: ReadonlyArray<{
  icon: typeof Stamp;
  titleKey: TranslationKey;
  descKey: TranslationKey;
  span: string;
}> = [
  {
    icon: ScrollText,
    titleKey: "landing.feature.audit.title",
    descKey: "landing.feature.audit.desc",
    span: "lg:col-span-4",
  },
  {
    icon: Lock,
    titleKey: "landing.feature.nontransfer.title",
    descKey: "landing.feature.nontransfer.desc",
    span: "lg:col-span-2",
  },
  {
    icon: Eye,
    titleKey: "landing.feature.open.title",
    descKey: "landing.feature.open.desc",
    span: "lg:col-span-2",
  },
  {
    icon: Users,
    titleKey: "landing.feature.multisig.title",
    descKey: "landing.feature.multisig.desc",
    span: "lg:col-span-2",
  },
  {
    icon: Fingerprint,
    titleKey: "landing.feature.privacy.title",
    descKey: "landing.feature.privacy.desc",
    span: "lg:col-span-2",
  },
];

/** Trust rail — the honest legal/technical footing as icon+label chips. Copy is
 * bound by the forbidden-claims list (see dict/landing.ts); no ICP-Brasil,
 * qualified-signature, cartório or MEC implications. */
const TRUST: ReadonlyArray<{
  icon: typeof Stamp;
  labelKey: TranslationKey;
  subKey: TranslationKey;
}> = [
  {
    icon: Scale,
    labelKey: "landing.trust.mp.label",
    subKey: "landing.trust.mp.sub",
  },
  {
    icon: Landmark,
    labelKey: "landing.trust.law.label",
    subKey: "landing.trust.law.sub",
  },
  {
    icon: Clock,
    labelKey: "landing.trust.timestamp.label",
    subKey: "landing.trust.timestamp.sub",
  },
  {
    icon: Globe,
    labelKey: "landing.trust.public.label",
    subKey: "landing.trust.public.sub",
  },
  {
    icon: Lock,
    labelKey: "landing.trust.lgpd.label",
    subKey: "landing.trust.lgpd.sub",
  },
];

/**
 * First-load entrance: a gentle fade + 0.5rem rise, reusing the existing
 * reduced-motion-safe animate-in vocabulary (it self-disables under
 * prefers-reduced-motion). `animation-fill-mode:backwards` holds the pre-delay
 * frame so staggered items don't flash at full opacity before their turn.
 * Callers add a per-item `[animation-delay:*]` (or inline delay) for the stagger.
 * Below-the-fold sections use <Reveal> (scroll-triggered) instead.
 */
const MOUNT_RISE =
  "animate-in fade-in slide-in-from-bottom-2 duration-500 [animation-fill-mode:backwards]";

/** Emerald→yellow icon chip shared by every card. */
const ICON_CHIP =
  "flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 via-primary/5 to-brand-yellow/20 text-primary ring-1 ring-inset ring-primary/20 transition-[transform,box-shadow] duration-200 ease-[var(--ease-spring)] group-hover:shadow-[0_10px_28px_-10px_rgba(0,139,76,0.5)] motion-safe:group-hover:scale-110 motion-safe:group-hover:-rotate-3";

export default async function Home() {
  const { t } = await getT();

  const steps = [
    {
      number: "1",
      icon: ScrollText,
      title: t("landing.step1.title"),
      description: t("landing.step1.desc"),
    },
    {
      number: "2",
      icon: FileSignature,
      title: t("landing.step2.title"),
      description: t("landing.step2.desc"),
    },
    {
      number: "3",
      icon: Award,
      title: t("landing.step3.title"),
      description: t("landing.step3.desc"),
    },
  ];

  return (
    <div className="flex flex-col">
      {/* ── Hero: two columns on lg (copy + certificate seal), stacked on mobile ── */}
      <section className="aurora relative overflow-hidden">
        <div
          aria-hidden="true"
          className="noise pointer-events-none absolute inset-0 -z-10"
        />
        <div className="gradient-solana-accent absolute inset-x-0 top-0 h-1" />
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-24 lg:grid-cols-2 lg:py-32">
          <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
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
              className={`text-glow text-5xl font-semibold tracking-tight text-balance sm:text-6xl xl:text-7xl ${MOUNT_RISE} [animation-delay:80ms]`}
            >
              {t("landing.heroTitlePre")}{" "}
              <span className="text-primary">Superteam Brasil</span>
            </h1>
            <p
              className={`mt-6 max-w-xl text-lg text-muted-foreground text-balance sm:text-xl ${MOUNT_RISE} [animation-delay:160ms]`}
            >
              {t("landing.heroSubtitle")}
            </p>
            <div
              className={`mt-10 flex flex-col items-center gap-3 sm:flex-row lg:items-start ${MOUNT_RISE} [animation-delay:240ms]`}
            >
              <Button
                asChild
                size="lg"
                className="transition-shadow duration-200 ease-[var(--ease-spring)] hover:shadow-[0_0_0_1px_rgba(10,162,90,0.5),0_0_28px_-4px_rgba(10,162,90,0.55),0_0_64px_-12px_rgba(10,162,90,0.4)]"
              >
                <Link href="/verify">{t("landing.verifyCta")}</Link>
              </Button>
              <LandingCta />
            </div>
            <ul
              className={`mt-10 flex flex-wrap justify-center gap-2 lg:justify-start ${MOUNT_RISE} [animation-delay:320ms]`}
            >
              {VALUE_CHIPS.map((chip) => {
                const Icon = chip.icon;
                return (
                  <li
                    key={chip.key}
                    className="inline-flex items-center gap-1.5 rounded-full bg-card/70 px-3 py-1.5 text-xs font-medium text-foreground shadow-[var(--shadow-soft)] ring-1 ring-inset ring-primary/15"
                  >
                    <Icon
                      className="size-3.5 text-primary"
                      aria-hidden="true"
                    />
                    {t(chip.key)}
                  </li>
                );
              })}
            </ul>
          </div>

          <div
            className={`mt-2 flex flex-col gap-6 lg:mt-0 ${MOUNT_RISE} [animation-delay:200ms]`}
          >
            <Parallax>
              <HeroSeal
                docTitle={t("landing.seal.docTitle")}
                badgeLabel={t("landing.seal.badge")}
                signedByLabel={t("landing.seal.signedBy")}
              />
            </Parallax>
            <div className="mx-auto w-full max-w-sm lg:mx-0 lg:ml-auto">
              <HeroVerifyDemo
                tag={t("landing.verify.demo.tag")}
                title={t("landing.verify.demo.title")}
                label={t("landing.verify.demo.label")}
                placeholder={t("landing.verify.demo.placeholder")}
                cta={t("landing.verify.demo.cta")}
                checking={t("landing.verify.demo.checking")}
                opening={t("landing.verify.demo.opening")}
                hint={t("landing.verify.demo.hint")}
                fallback={t("landing.verify.demo.fallback")}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Intents bento ── */}
      <section className="mx-auto w-full max-w-6xl px-4 py-24 sm:py-28">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="stbr-eyebrow">{t("landing.eyebrow.start")}</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance">
            {t("landing.chooseTitle")}
          </h2>
          <p className="mt-3 text-muted-foreground text-balance">
            {t("landing.chooseSubtitle")}
          </p>
        </Reveal>
        <div className="mt-12 grid gap-6 lg:grid-cols-6">
          {INTENTS.map((intent, i) => {
            const Icon = intent.icon;
            const tag = (
              <span className="rounded-full bg-secondary/60 px-2.5 py-0.5 text-[0.65rem] font-medium text-muted-foreground ring-1 ring-inset ring-border">
                {t(intent.tagKey)}
              </span>
            );
            return (
              <Reveal key={intent.href} className={intent.span} delay={i * 90}>
                <TiltCard>
                  <Card className="group gradient-border hover-lift h-full p-6 sm:p-8">
                    {intent.wide ? (
                      <CardContent className="flex h-full flex-col gap-6 p-0 sm:flex-row sm:items-center">
                        <div className="flex items-center gap-4">
                          <div className={ICON_CHIP}>
                            <Icon className="size-6" aria-hidden="true" />
                          </div>
                          <div className="flex flex-col items-start gap-1.5">
                            {tag}
                            <h3 className="text-lg font-semibold">
                              {t(intent.titleKey)}
                            </h3>
                          </div>
                        </div>
                        <p className="grow text-sm text-muted-foreground">
                          {t(intent.descKey)}
                        </p>
                        <Button
                          asChild
                          variant="ghost"
                          className="self-start px-2 sm:self-center"
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
                    ) : (
                      <CardContent className="flex h-full flex-col p-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className={ICON_CHIP}>
                            <Icon className="size-6" aria-hidden="true" />
                          </div>
                          {tag}
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
                    )}
                  </Card>
                </TiltCard>
              </Reveal>
            );
          })}
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl px-4">
        <div className="rule-gradient" aria-hidden="true" />
      </div>

      {/* ── Why-it-holds-up bento ── */}
      <section className="mx-auto w-full max-w-6xl px-4 py-24 sm:py-28">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="stbr-eyebrow">{t("landing.eyebrow.features")}</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance">
            {t("landing.features.title")}
          </h2>
          <p className="mt-3 text-muted-foreground text-balance">
            {t("landing.features.subtitle")}
          </p>
        </Reveal>
        <div className="mt-12 grid gap-6 lg:grid-cols-6">
          {FEATURES.map((feature, i) => {
            const Icon = feature.icon;
            const isMarquee = i === 0;
            return (
              <Reveal
                key={feature.titleKey}
                className={feature.span}
                delay={i * 80}
              >
                <TiltCard>
                  <Card className="group gradient-border hover-lift h-full p-6 sm:p-8">
                    <CardContent className="flex h-full flex-col p-0">
                      <div className={ICON_CHIP}>
                        <Icon className="size-6" aria-hidden="true" />
                      </div>
                      <h3 className="mt-5 text-base font-semibold sm:text-lg">
                        {t(feature.titleKey)}
                      </h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {t(feature.descKey)}
                      </p>
                      {isMarquee && (
                        <div
                          aria-hidden="true"
                          className="mt-auto flex items-center gap-2 pt-6"
                        >
                          <span className="size-2.5 rounded-full bg-primary/60" />
                          <span className="h-px w-10 bg-primary/25" />
                          <span className="size-2.5 rounded-full bg-primary/60" />
                          <span className="h-px w-10 bg-primary/25" />
                          <span className="size-2.5 rounded-full bg-primary/60" />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TiltCard>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* ── Trust rail ── */}
      <section className="bg-card/50">
        <div className="mx-auto w-full max-w-6xl px-4 py-24 sm:py-28">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="stbr-eyebrow">{t("landing.eyebrow.trust")}</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance">
              {t("landing.trust.title")}
            </h2>
          </Reveal>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {TRUST.map((item, i) => {
              const Icon = item.icon;
              return (
                <Reveal key={item.labelKey} delay={i * 70}>
                  <div className="glass hover-lift flex h-full flex-col items-center gap-3 rounded-2xl p-5 text-center">
                    <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <span className="text-sm leading-tight font-semibold">
                      {t(item.labelKey)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t(item.subKey)}
                    </span>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── How it works: connected timeline ── */}
      <section className="border-t border-border">
        <div className="mx-auto w-full max-w-6xl px-4 py-24 sm:py-28">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="stbr-eyebrow">{t("landing.eyebrow.how")}</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance">
              {t("landing.howItWorks")}
            </h2>
            <p className="mt-3 text-muted-foreground text-balance">
              {t("landing.howSubtitle")}
            </p>
          </Reveal>
          <div className="relative mt-14 grid gap-8 sm:grid-cols-3">
            {/* Connector line + node arrows — lg only, behind the cards; the
                opaque cards mask it so it reads only across the gaps. A brighter
                fill sweeps across it as the timeline scrolls into view. */}
            <StepConnector />
            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <Reveal
                  key={step.number}
                  className="relative z-10"
                  delay={i * 110}
                >
                  <Card className="h-full p-6 text-center sm:p-8">
                    <CardContent className="flex h-full flex-col items-center p-0">
                      <div className="relative">
                        <div className="neon-emerald flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 via-primary/5 to-brand-yellow/20 text-primary ring-1 ring-inset ring-primary/25">
                          <Icon className="size-6" aria-hidden="true" />
                        </div>
                        <span className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground shadow-[0_6px_16px_-6px_rgba(0,139,76,0.55)]">
                          {step.number}
                        </span>
                      </div>
                      <h3 className="mt-5 text-lg font-semibold">
                        {step.title}
                      </h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {step.description}
                      </p>
                    </CardContent>
                  </Card>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Footer band: network, program, legal ── */}
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
