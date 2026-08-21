"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type TiltCardProps = React.ComponentProps<"div"> & {
  /** Peak rotation in degrees at the card corners. A few degrees, tops. */
  max?: number;
};

/**
 * Subtle pointer-follow tilt for the bento/intent cards. On a fine pointer it
 * rotates the card a few degrees toward the cursor (perspective + rotateX/Y),
 * eases back on leave, and does nothing at all under reduced motion or on
 * touch/coarse pointers.
 *
 * Wrapper-only by design: the tilt lives here while the inner Card keeps its own
 * `.hover-lift` translate/scale and `.gradient-border` sheen — they're separate
 * elements, so the transforms compose instead of clobbering each other. Writes
 * are rAF-batched to two CSS custom properties the `.tilt-card` rule reads, so
 * the compositor moves a cached layer with no layout work.
 */
export function TiltCard({
  className,
  max = 5,
  children,
  ...props
}: TiltCardProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const frame = React.useRef<number | null>(null);
  const enabled = React.useRef(false);

  React.useEffect(() => {
    const motionOk = !window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches;
    const finePointer = window.matchMedia(
      "(hover: hover) and (pointer: fine)",
    ).matches;
    enabled.current = motionOk && finePointer;
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, []);

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    if (!enabled.current) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      el.style.setProperty("--tilt-rx", `${(-py * max).toFixed(2)}deg`);
      el.style.setProperty("--tilt-ry", `${(px * max).toFixed(2)}deg`);
    });
  }

  function reset(): void {
    const el = ref.current;
    if (!el) return;
    if (frame.current) cancelAnimationFrame(frame.current);
    el.dataset.tilting = "false";
    el.style.setProperty("--tilt-rx", "0deg");
    el.style.setProperty("--tilt-ry", "0deg");
  }

  return (
    <div
      ref={ref}
      data-tilting="false"
      onPointerEnter={(e) => {
        if (enabled.current) e.currentTarget.dataset.tilting = "true";
      }}
      onPointerMove={handlePointerMove}
      onPointerLeave={reset}
      className={cn("tilt-card h-full", className)}
      {...props}
    >
      {children}
    </div>
  );
}
