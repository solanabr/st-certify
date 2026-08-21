"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type ParallaxProps = React.ComponentProps<"div"> & {
  /** Peak vertical travel in px across a full screen of scroll. Keep it small. */
  strength?: number;
};

/**
 * Wraps a decorative element (the hero seal) and drifts it a few px against the
 * page as it scrolls, for a touch of depth over the aurora behind it. One
 * passive, rAF-throttled scroll listener writing a single CSS custom property
 * that the `.parallax-y` rule reads — transform only, so no layout and no
 * repaint. Disabled entirely under reduced motion (the listener never attaches
 * and `.parallax-y` collapses to no transform).
 */
export function Parallax({
  strength = 12,
  className,
  style,
  children,
  ...props
}: ParallaxProps) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const center = rect.top + rect.height / 2;
      // -1 (element below the fold) .. 0 (centered) .. 1 (above the fold)
      const progress = Math.max(-1, Math.min(1, ((center - vh / 2) / vh) * 2));
      el.style.setProperty(
        "--parallax-y",
        `${(-progress * strength).toFixed(1)}px`,
      );
    };
    const onScroll = () => {
      if (!raf) raf = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [strength]);

  return (
    <div
      ref={ref}
      className={cn("parallax-y", className)}
      style={style}
      {...props}
    >
      {children}
    </div>
  );
}
