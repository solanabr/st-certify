"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

/**
 * One-click light↔dark toggle. `resolvedTheme` collapses "system" to the
 * concrete theme actually showing, so the first click always flips to the
 * visible opposite (no three-way dropdown). Both icons render and CSS reveals
 * the active one, so SSR needs no theme knowledge (next-themes hydration rule);
 * the click handler only runs post-mount, when resolvedTheme is defined.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const { t } = useT();

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t("theme.toggle")}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="size-4 dark:hidden" />
      <Moon className="hidden size-4 dark:block" />
    </Button>
  );
}
