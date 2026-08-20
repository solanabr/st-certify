const FORWARD_KEYS = ["ArrowDown", "ArrowRight"];
const BACKWARD_KEYS = ["ArrowUp", "ArrowLeft"];

/**
 * Target index for an arrow/Home/End press inside an ARIA radiogroup, or
 * `null` when the key isn't one this pattern handles (so the caller leaves the
 * event alone). Selection wraps at both ends, per the APG radio pattern.
 * A `current` of -1 means nothing is selected yet: forward lands on the first
 * option, backward on the last.
 */
export function nextRadioIndex(
  current: number,
  key: string,
  count: number,
): number | null {
  if (count <= 0) {
    return null;
  }
  if (FORWARD_KEYS.includes(key)) {
    return current < 0 || current >= count - 1 ? 0 : current + 1;
  }
  if (BACKWARD_KEYS.includes(key)) {
    return current <= 0 ? count - 1 : current - 1;
  }
  if (key === "Home") {
    return 0;
  }
  if (key === "End") {
    return count - 1;
  }
  return null;
}
