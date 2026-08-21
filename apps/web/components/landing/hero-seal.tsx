import { BadgeCheck, PenLine, Stamp } from "lucide-react";

type HeroSealProps = {
  docTitle: string;
  badgeLabel: string;
  signedByLabel: string;
};

/**
 * The hero's visual anchor: a stylised certificate with a glowing "verified"
 * stamp. Entirely decorative — it restates the page's promise in picture form,
 * so it's `aria-hidden` and its inner "content" is abstract skeleton bars (never
 * fabricated names/dates that could read as a real record).
 *
 * Reuses the existing vocabulary: .gradient-border (static emerald↔yellow ring),
 * .neon-emerald (glow bloom), --shadow-float, and .animate-seal-bob for the slow
 * motion-safe hover. No client JS.
 */
export function HeroSeal({
  docTitle,
  badgeLabel,
  signedByLabel,
}: HeroSealProps) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none relative mx-auto w-full max-w-sm select-none lg:mx-0 lg:ml-auto"
    >
      {/* Soft emerald/yellow wash pooled behind the card. */}
      <div
        className="absolute -inset-8 -z-10 rounded-[2rem] opacity-70 blur-2xl"
        style={{
          background:
            "radial-gradient(60% 60% at 30% 25%, rgba(0,139,76,0.22), transparent 70%), radial-gradient(55% 55% at 80% 15%, rgba(255,210,63,0.16), transparent 72%)",
        }}
      />

      <div className="animate-seal-bob">
        <div className="gradient-border neon-emerald relative rounded-2xl bg-card p-6 shadow-[var(--shadow-float)] sm:p-7">
          {/* Corner accents — thin L-marks for a "document" frame. */}
          <span className="absolute left-3 top-3 size-4 rounded-tl-md border-l-2 border-t-2 border-primary/40" />
          <span className="absolute right-3 top-3 size-4 rounded-tr-md border-r-2 border-t-2 border-brand-yellow/50" />
          <span className="absolute bottom-3 left-3 size-4 rounded-bl-md border-b-2 border-l-2 border-brand-yellow/50" />
          <span className="absolute bottom-3 right-3 size-4 rounded-br-md border-b-2 border-r-2 border-primary/40" />

          {/* Seal + script title */}
          <div className="flex flex-col items-center gap-3 pt-2 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 via-primary/5 to-brand-yellow/20 text-primary ring-1 ring-inset ring-primary/25">
              <Stamp className="size-6" />
            </span>
            <span className="font-display text-4xl leading-none text-primary">
              {docTitle}
            </span>
            <span className="gradient-solana-accent h-0.5 w-16 rounded-full" />
          </div>

          {/* Abstract "content" — skeleton bars, never real data. */}
          <div className="mt-6 space-y-2.5">
            <span className="block h-2 w-11/12 rounded-full bg-foreground/10" />
            <span className="block h-2 w-4/5 rounded-full bg-foreground/10" />
            <span className="block h-2 w-2/3 rounded-full bg-foreground/10" />
          </div>

          {/* Signature row */}
          <div className="mt-6 flex items-end justify-between gap-4">
            <div className="flex-1 space-y-1.5">
              <PenLine className="size-4 text-muted-foreground" />
              <span className="block h-px w-full bg-foreground/20" />
              <span className="stbr-eyebrow block text-[0.6rem]">
                {signedByLabel}
              </span>
            </div>
            <div className="flex-1 space-y-1.5">
              <PenLine className="size-4 text-muted-foreground" />
              <span className="block h-px w-full bg-foreground/20" />
              <span className="stbr-eyebrow block text-[0.6rem]">
                {signedByLabel}
              </span>
            </div>
          </div>
        </div>

        {/* Overlapping verified stamp badge */}
        <div className="neon-emerald absolute -right-3 -top-3 flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-primary-foreground shadow-[var(--shadow-lift)]">
          <BadgeCheck className="size-4" />
          <span className="text-xs font-semibold">{badgeLabel}</span>
        </div>
      </div>
    </div>
  );
}
