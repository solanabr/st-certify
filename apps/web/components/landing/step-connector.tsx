"use client";

import * as React from "react";
import { ArrowRight } from "lucide-react";

/**
 * The how-it-works connector (lg only, decorative). A brighter emerald→yellow
 * line sweeps left→right across the faint base rule, and the two arrow nodes
 * brighten in its wake, once the timeline scrolls into view — reveal-driven, not
 * scroll-jacked. Same IntersectionObserver contract as <Reveal>: it flips
 * `data-shown` once then disconnects, and resolves to shown immediately under
 * reduced motion or when IO is unavailable, so the connector is never stranded
 * dim. The CSS lives in `.step-connector*` (globals.css).
 */
export function StepConnector() {
  const ref = React.useRef<HTMLDivElement>(null);
  const [shown, setShown] = React.useState(false);

  React.useEffect(() => {
    if (shown) return;

    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduce || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }

    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.35 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [shown]);

  return (
    <div
      ref={ref}
      data-shown={shown}
      aria-hidden="true"
      className="step-connector pointer-events-none absolute inset-x-[16.67%] top-[3.75rem] z-0 hidden lg:block"
    >
      <div className="rule-gradient" />
      <div className="step-connector-fill" />
      <span
        className="step-connector-node absolute top-1/2 left-1/4 flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-card text-primary ring-1 ring-inset ring-border"
        style={{ transitionDelay: "260ms" }}
      >
        <ArrowRight className="size-3.5" />
      </span>
      <span
        className="step-connector-node absolute top-1/2 left-3/4 flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-card text-primary ring-1 ring-inset ring-border"
        style={{ transitionDelay: "660ms" }}
      >
        <ArrowRight className="size-3.5" />
      </span>
    </div>
  );
}
