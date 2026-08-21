import "server-only";

import { cookies } from "next/headers";
import { MOCK_ROLE_COOKIE, parseMockRole, type MockRole } from "./flag";

/**
 * Dev-only UI preview mode. With `NEXT_PUBLIC_UI_MOCK=1` every page-facing
 * query returns fixtures and the auth helpers resolve a synthetic session, so
 * the whole app renders with representative data and any role — no wallet, no
 * Supabase, no RPC. See `./flag` for the guard itself and why it lives apart.
 */
export {
  DEFAULT_MOCK_ROLE,
  isUiMock,
  MOCK_ROLE_COOKIE,
  MOCK_ROLES,
  parseMockRole,
  type MockRole,
} from "./flag";

/** The role the current request is previewing, from the `mock_role` cookie. */
export async function mockRole(): Promise<MockRole> {
  const jar = await cookies();
  return parseMockRole(jar.get(MOCK_ROLE_COOKIE)?.value);
}
