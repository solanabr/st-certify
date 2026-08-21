"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Same shapes the real verify tool accepts: a 64-hex artifact hash or a 32–44
 * base58 cert-PDA/asset. Anything else (or empty) hands off to the full tool,
 * which also does file upload and QR. Kept local so the hero stays off the
 * chain/RPC bundle. */
const HEX64 = /^[0-9a-fA-F]{64}$/;
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function verifyHref(raw: string): string {
  const trimmed = raw.trim();
  if (HEX64.test(trimmed) || BASE58.test(trimmed)) {
    return `/verify/${encodeURIComponent(trimmed)}`;
  }
  return "/verify";
}

type Status = "idle" | "checking" | "done";

type HeroVerifyDemoProps = {
  tag: string;
  title: string;
  label: string;
  placeholder: string;
  cta: string;
  checking: string;
  opening: string;
  hint: string;
  fallback: string;
};

/**
 * Hero "try it" teaser: a real, keyboard-accessible verify input that plays a
 * short spinner → "opening…" handoff flourish and then routes to the actual
 * verifier at `/verify/<code>`, where the true verdict renders. It deliberately
 * asserts NO verdict of its own — the motion is a navigation affordance (arrow),
 * never a success/"valid" claim — so it can't be read as validating the user's
 * certificate. Nothing blocks: reduced motion routes straight through, and the
 * fallback link always opens the full tool.
 */
export function HeroVerifyDemo({
  tag,
  title,
  label,
  placeholder,
  cta,
  checking,
  opening,
  hint,
  fallback,
}: HeroVerifyDemoProps) {
  const router = useRouter();
  const [value, setValue] = React.useState("");
  const [status, setStatus] = React.useState<Status>("idle");
  const timers = React.useRef<number[]>([]);

  React.useEffect(
    () => () => {
      for (const id of timers.current) window.clearTimeout(id);
    },
    [],
  );

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (value.trim().length === 0) return;

    const target = verifyHref(value);
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduce) {
      router.push(target);
      return;
    }

    setStatus("checking");
    timers.current.push(
      window.setTimeout(() => setStatus("done"), 900),
      window.setTimeout(() => router.push(target), 1600),
    );
  }

  const busy = status !== "idle";

  return (
    <div className="glass gradient-border relative overflow-hidden rounded-2xl p-5 shadow-[var(--shadow-lift)] sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
            <ShieldCheck className="size-4" aria-hidden="true" />
          </span>
          <p className="text-sm font-semibold">{title}</p>
        </div>
        <span className="rounded-full bg-secondary/60 px-2.5 py-0.5 text-[0.65rem] font-medium text-muted-foreground ring-1 ring-inset ring-border">
          {tag}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 space-y-1.5">
        <Label htmlFor="hero-verify-code">{label}</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="hero-verify-code"
            name="code"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            className="h-10"
          />
          <Button
            type="submit"
            disabled={busy || value.trim().length === 0}
            className="h-10 shrink-0"
          >
            {status === "checking" ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <ShieldCheck aria-hidden="true" />
            )}
            {cta}
          </Button>
        </div>
      </form>

      {/* Fixed-height status line — reserved so the flourish never shifts the
          card. Empty while idle; the persistent hint below carries the meaning. */}
      <div
        className="mt-3 flex min-h-[1.25rem] items-center text-xs"
        aria-live="polite"
      >
        {status === "checking" && (
          <span className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            {checking}
          </span>
        )}
        {status === "done" && (
          <span className="verify-flourish flex items-center gap-2 font-medium text-primary">
            <ArrowRight className="verify-arrow size-4" aria-hidden="true" />
            {opening}
          </span>
        )}
      </div>

      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>

      <Link
        href="/verify"
        className="mt-3 inline-flex items-center gap-1 rounded text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
      >
        {fallback}
        <ArrowRight className="size-3" aria-hidden="true" />
      </Link>
    </div>
  );
}
