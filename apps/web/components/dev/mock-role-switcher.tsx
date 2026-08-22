"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  MOCK_ROLE_COOKIE,
  MOCK_ROLES,
  parseMockRole,
  type MockRole,
} from "@/lib/mock/flag";

const ROLE_LABEL: Record<MockRole, string> = {
  anon: "Visitante (deslogado)",
  student: "Aluno",
  signer: "Signatário",
  admin: "Administrador",
  creator: "Organizador de eventos",
};

function readCookieRole(): MockRole {
  const match = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${MOCK_ROLE_COOKIE}=`));
  return parseMockRole(match?.slice(MOCK_ROLE_COOKIE.length + 1));
}

/**
 * Dev-only role switcher for UI-mock mode. Rendered by the root layout behind
 * `isUiMock()`, so it cannot reach a production build.
 *
 * Switching writes the `mock_role` cookie the server helpers read, then pushes
 * both halves of the app past their caches: `router.refresh()` re-runs the
 * server components, and invalidating the query client re-fetches the
 * `/api/**` reads the client pages live on. Refreshing only one of the two
 * leaves the nav disagreeing with the page under it.
 */
export function MockRoleSwitcher() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [role, setRole] = useState<MockRole | null>(null);

  // The cookie is only readable once mounted; until then render nothing rather
  // than guess a value the server may disagree with.
  useEffect(() => setRole(readCookieRole()), []);

  function switchTo(next: MockRole) {
    document.cookie = `${MOCK_ROLE_COOKIE}=${next}; path=/; max-age=31536000; SameSite=Lax`;
    setRole(next);
    router.refresh();
    void queryClient.invalidateQueries();
  }

  if (role === null) {
    return null;
  }

  return (
    <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 z-50 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-50/95 px-3 py-2 text-xs shadow-lg backdrop-blur dark:bg-amber-950/90">
      <span
        className="font-semibold tracking-wide text-amber-900 uppercase dark:text-amber-200"
        title="NEXT_PUBLIC_UI_MOCK=1 — dados fictícios, sem banco nem carteira"
      >
        UI mock
      </span>
      <label htmlFor="mock-role" className="sr-only">
        Perfil simulado
      </label>
      <select
        id="mock-role"
        value={role}
        onChange={(event) => switchTo(parseMockRole(event.target.value))}
        className="rounded-md border border-amber-500/40 bg-white px-2 py-1 text-amber-950 dark:bg-amber-900 dark:text-amber-50"
      >
        {MOCK_ROLES.map((option) => (
          <option key={option} value={option}>
            {ROLE_LABEL[option]}
          </option>
        ))}
      </select>
    </div>
  );
}
