"use client";

import { useTheme } from "next-themes";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Mirrors --background in app/globals.css (:root cream / .dark brand dark-900)
// and the themeColor pair exported from app/layout.tsx.
const THEME_COLOR = {
  light: "#f5e8ca",
  dark: "#11160f",
} as const;

/**
 * Points every <meta name="theme-color"> at `color`, creating one only when the
 * document has none.
 *
 * Deliberately not "append one override and let it win": the HTML spec has the
 * UA take the *first* theme-color whose media matches, so an appended bare meta
 * would lose to the SSR light/dark pair that precedes it. Giving every
 * candidate identical content is correct under any selection rule, needs no
 * removal/restore of the SSR pair, and rewriting an existing meta's content is
 * the mutation browsers honour most reliably.
 */
export function applyThemeColor(doc: Document, color: string): void {
  const metas = doc.querySelectorAll<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );

  if (metas.length === 0) {
    const meta = doc.createElement("meta");
    meta.setAttribute("name", "theme-color");
    meta.setAttribute("content", color);
    doc.head.appendChild(meta);
    return;
  }

  metas.forEach((meta) => meta.setAttribute("content", color));
}

/**
 * Keeps the browser chrome in step with the in-app theme toggle. The metas Next
 * renders are media-query based, so they track the OS preference and go stale
 * as soon as someone picks a theme that disagrees with it. Renders nothing —
 * the DOM write happens after hydration.
 */
export function ThemeColorSync() {
  const { resolvedTheme } = useTheme();
  // Next re-renders the metadata metas per route; re-applying on navigation
  // keeps the override from being reset by a remount.
  const pathname = usePathname();

  useEffect(() => {
    if (typeof document === "undefined") return;
    // Undefined until next-themes mounts — until then the SSR pair is right.
    if (resolvedTheme !== "light" && resolvedTheme !== "dark") return;

    applyThemeColor(document, THEME_COLOR[resolvedTheme]);
  }, [resolvedTheme, pathname]);

  return null;
}
