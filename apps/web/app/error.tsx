"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

/** Root error boundary — catches anything an RSC page/layout throws that isn't handled more locally. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useT();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      <h1 className="text-xl font-semibold">{t("system.error.title")}</h1>
      <p className="text-sm text-muted-foreground">{t("system.error.body")}</p>
      <Button onClick={() => reset()}>{t("system.error.retry")}</Button>
    </div>
  );
}
