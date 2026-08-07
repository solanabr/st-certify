"use client";

import { useEffect, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Mounted once near the root (see app/providers.tsx). Privy sets the
 * `privy-id-token` cookie itself once `authenticated` flips true; this
 * component just reacts to that transition: best-effort POSTs
 * `/api/auth/sync` to upsert the profiles mirror, then invalidates the
 * `useMe()` query so the nav/role-gated pages pick up the new session
 * without waiting for their next natural refetch.
 */
export function AuthSync(): null {
  const { ready, authenticated } = usePrivy();
  const queryClient = useQueryClient();
  const lastSynced = useRef<boolean | null>(null);

  useEffect(() => {
    if (!ready || lastSynced.current === authenticated) {
      return;
    }
    lastSynced.current = authenticated;

    if (authenticated) {
      fetch("/api/auth/sync", { method: "POST" }).catch(() => {
        // Best-effort: role resolution still works from the identity token
        // alone (see lib/auth.ts) even if the profiles mirror sync fails.
      });
    }
    void queryClient.invalidateQueries({ queryKey: ["me"] });
  }, [ready, authenticated, queryClient]);

  return null;
}
