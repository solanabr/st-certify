import "server-only";

// sha256 over the canonical layout JSON — split from layout.ts because these
// need node:crypto and layout.ts is imported by client components (designer
// canvas, wizard steps), where a node: import fails the production webpack
// build. Server-side consumers (admin editions route) import from here.

import { createHash } from "node:crypto";
import { canonicalizeLayout, type Layout } from "./layout";

/** sha256(canonicalizeLayout(layout)) as raw bytes — the on-chain spec_hash[32]. */
export function specHashBytes(layout: Layout): Uint8Array {
  const digest = createHash("sha256")
    .update(canonicalizeLayout(layout), "utf8")
    .digest();
  return new Uint8Array(digest);
}

/** sha256(canonicalizeLayout(layout)) as lowercase hex — for DB/API/display use. */
export function specHash(layout: Layout): string {
  return createHash("sha256")
    .update(canonicalizeLayout(layout), "utf8")
    .digest("hex");
}
