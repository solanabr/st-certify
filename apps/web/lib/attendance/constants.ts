// Shared attendance tree/capacity constants.

/**
 * Leaf capacity of the shared Bubblegum v2 Merkle tree (depth-14 = 2^14).
 * Devnet-derived; re-verify against the real tree config before mainnet — the
 * tree is un-resettable, so this ceiling is permanent for the current tree.
 */
export const ATTENDANCE_TREE_CAPACITY = 16_384;

/** Fraction of capacity at which the tree-usage meter turns amber. */
export const ATTENDANCE_CAPACITY_WARN = 0.8;

/** Fraction of capacity at which the tree-usage meter turns red. */
export const ATTENDANCE_CAPACITY_CRITICAL = 0.95;

export type CapacityLevel = "ok" | "warn" | "critical";

/**
 * Maps a used/total fraction to its severity band. Pure (no React) so the
 * capacity meter and its unit test share one source of truth for the
 * thresholds. `critical` is checked before `warn`, and NaN/negative inputs
 * (e.g. a zero max) fall through to `ok`.
 */
export function capacityLevel(fraction: number): CapacityLevel {
  if (fraction >= ATTENDANCE_CAPACITY_CRITICAL) return "critical";
  if (fraction >= ATTENDANCE_CAPACITY_WARN) return "warn";
  return "ok";
}
