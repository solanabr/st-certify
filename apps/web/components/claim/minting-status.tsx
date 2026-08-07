"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import type { CertificateForOwner } from "@/lib/db/types";

// Fire the first resume only after a settle delay so we don't race the original
// claim-submit that's likely still minting in-flight (it flips the mirror to
// Claimed right after the claim tx confirms, before mint+record finish). If that
// original completes within the window, the card flips to done and this unmounts
// (timer cleared). A genuinely stuck mint (reloaded page, earlier failure) gets
// picked up after the delay.
const INITIAL_DELAY_MS = 7000;
const RETRY_BACKOFF_MS = [8000, 16000];
const MAX_AUTO_ATTEMPTS = 3;

/**
 * The "Emitindo NFT…" state for a Claimed-but-not-yet-recorded cert. The mint +
 * record_asset re-POST machinery is idempotent, so this silently auto-resumes it
 * (bounded backoff) rather than leaving a stuck terminal state, then falls back
 * to a manual "Tentar emitir novamente" button. /me polling flips the card to
 * done (image reveal) once the asset lands.
 */
export function MintingStatus({ cert }: { cert: CertificateForOwner }) {
  const queryClient = useQueryClient();
  const [failed, setFailed] = useState(false);
  const [running, setRunning] = useState(false);
  const attemptsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);

  async function resume(): Promise<void> {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setRunning(true);
    try {
      await api(`/api/certificates/${cert.address}/claim-submit`, { json: {} });
      setFailed(false);
      void queryClient.invalidateQueries({ queryKey: ["me", "certificates"] });
    } catch {
      attemptsRef.current += 1;
      if (attemptsRef.current < MAX_AUTO_ATTEMPTS) {
        const delay = RETRY_BACKOFF_MS[attemptsRef.current - 1] ?? 16_000;
        timerRef.current = setTimeout(() => void resume(), delay);
      } else {
        setFailed(true);
      }
    } finally {
      inFlightRef.current = false;
      setRunning(false);
    }
  }

  useEffect(() => {
    timerRef.current = setTimeout(() => void resume(), INITIAL_DELAY_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // resume is stable for this cert; re-arm only if the address changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cert.address]);

  function manualRetry(): void {
    attemptsRef.current = 0;
    setFailed(false);
    void resume();
  }

  if (failed) {
    return (
      <div className="space-y-2" aria-live="polite">
        <p className="text-sm text-muted-foreground">
          A emissão do NFT não concluiu automaticamente.
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={manualRetry}
          disabled={running}
        >
          {running && <Loader2 className="animate-spin" aria-hidden="true" />}
          Tentar emitir novamente
        </Button>
      </div>
    );
  }

  return (
    <p
      className="flex items-center gap-2 text-sm text-muted-foreground"
      aria-live="polite"
    >
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      Emitindo NFT…
    </p>
  );
}
