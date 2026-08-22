"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { ThemeColorSync } from "@/components/theme-color-sync";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {/* Inside the provider so it can read resolvedTheme. */}
      <ThemeColorSync />
      {children}
    </NextThemesProvider>
  );
}
