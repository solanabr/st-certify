"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type RevealProps = React.ComponentProps<"div"> & {
  /** Stagger, in ms, applied as the transition-delay once revealed. */
  delay?: number;
};

/**
 * Fades + rises its children once, when they first scroll into view.
 *
 * The styling lives in `.reveal` (globals.css); this only flips `data-shown`.
 * A single IntersectionObserver per instance disconnects after the first
 * intersection, so it never re-hides on scroll-back and holds no observer once
 * shown. Content is never stranded hidden: reduced-motion and missing-IO both
 * resolve to shown on mount, and elements already in the viewport intersect on
 * the first callback.
 *
 * Server-rendered children pass straight through as `children`, so wrapping a
 * static section here keeps it out of the client bundle.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  style,
  ...props
}: RevealProps) {
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
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [shown]);

  return (
    <div
      ref={ref}
      data-shown={shown}
      className={cn("reveal", className)}
      style={
        shown && delay ? { transitionDelay: `${delay}ms`, ...style } : style
      }
      {...props}
    >
      {children}
    </div>
  );
}
