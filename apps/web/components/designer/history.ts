// Undo/redo as immutable snapshot stacks. Deliberately generic and
// DOM-free: the designer snapshots whole `DesignerLayoutDraft` values
// (they're small plain objects — a few hundred bytes — so structural
// sharing would cost more in complexity than it saves in memory), but
// nothing here knows that.
//
// `past` is bounded at HISTORY_LIMIT: a long design session is otherwise an
// unbounded array of drafts, and nobody undoes 50 steps.

export const HISTORY_LIMIT = 50;

export interface HistoryStack<T> {
  /** Oldest first; `past[past.length - 1]` is what `undo` restores. */
  readonly past: readonly T[];
  readonly present: T;
  /** Newest first — `future[0]` is what `redo` restores. */
  readonly future: readonly T[];
}

export function createHistory<T>(present: T): HistoryStack<T> {
  return { past: [], present, future: [] };
}

/** Commits `next` as a new undoable step, discarding any redo branch. */
export function pushHistory<T>(
  history: HistoryStack<T>,
  next: T,
  limit: number = HISTORY_LIMIT,
): HistoryStack<T> {
  const past = [...history.past, history.present];
  return {
    past: past.length > limit ? past.slice(past.length - limit) : past,
    present: next,
    future: [],
  };
}

/**
 * Overwrites the current step without creating a new one — for the tail of a
 * continuous gesture (a drag emitting 60 updates/s, or successive keystrokes
 * in one numeric input), which should undo as a single action.
 */
export function replacePresent<T>(
  history: HistoryStack<T>,
  next: T,
): HistoryStack<T> {
  return { ...history, present: next };
}

export function canUndo<T>(history: HistoryStack<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: HistoryStack<T>): boolean {
  return history.future.length > 0;
}

export function undoHistory<T>(history: HistoryStack<T>): HistoryStack<T> {
  const previous = history.past[history.past.length - 1];
  if (previous === undefined) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redoHistory<T>(history: HistoryStack<T>): HistoryStack<T> {
  const next = history.future[0];
  if (next === undefined) return history;
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
  };
}
