"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** Root error boundary — catches anything an RSC page/layout throws that isn't handled more locally. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      <h1 className="text-xl font-semibold">Algo deu errado</h1>
      <p className="text-sm text-muted-foreground">
        Ocorreu um erro inesperado ao carregar esta página. Tente novamente.
      </p>
      <Button onClick={() => reset()}>Tentar novamente</Button>
    </div>
  );
}
