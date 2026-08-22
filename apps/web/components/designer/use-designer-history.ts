"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  canRedo,
  canUndo,
  createHistory,
  pushHistory,
  redoHistory,
  replacePresent,
  undoHistory,
  type HistoryStack,
} from "./history";
import type { DesignerLayoutDraft } from "./types";

export interface DesignerHistory {
  /**
   * Commits an edit. Passing the same `coalesceKey` as the previous commit
   * folds this one into that undo step instead of adding a new one — one
   * drag gesture (or one run of keystrokes in a single numeric input) should
   * undo as a single action, not sixty.
   */
  commit: (next: DesignerLayoutDraft, coalesceKey?: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * Undo/redo over a draft the caller owns. The draft lives in the wizard page
 * (it has to survive this step unmounting), so this hook can't be the source
 * of truth — it mirrors the committed values and pushes restored ones back
 * out through `onDraftChange`.
 *
 * A draft that changes without going through `commit` — the wizard syncing
 * signature boxes to the step-2 signer list — is adopted as the current state
 * rather than recorded as an undoable step: undoing it would only fight the
 * effect that produced it.
 */
export function useDesignerHistory(
  draft: DesignerLayoutDraft | null,
  onDraftChange: (next: DesignerLayoutDraft) => void,
): DesignerHistory {
  const [stack, setStack] = useState<HistoryStack<DesignerLayoutDraft> | null>(
    null,
  );
  const stackRef = useRef<HistoryStack<DesignerLayoutDraft> | null>(null);
  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    stackRef.current = stack;
  }, [stack]);

  useEffect(() => {
    if (!draft) {
      lastKeyRef.current = null;
      setStack(null);
      return;
    }
    setStack((previous) => {
      if (!previous) return createHistory(draft);
      if (previous.present === draft) return previous;
      lastKeyRef.current = null;
      return replacePresent(previous, draft);
    });
  }, [draft]);

  const commit = useCallback(
    (next: DesignerLayoutDraft, coalesceKey?: string) => {
      const coalesce =
        coalesceKey !== undefined && coalesceKey === lastKeyRef.current;
      lastKeyRef.current = coalesceKey ?? null;
      setStack((previous) => {
        if (!previous) return createHistory(next);
        return coalesce
          ? replacePresent(previous, next)
          : pushHistory(previous, next);
      });
      onDraftChange(next);
    },
    [onDraftChange],
  );

  const step = useCallback(
    (
      move: (
        s: HistoryStack<DesignerLayoutDraft>,
      ) => HistoryStack<DesignerLayoutDraft>,
    ) => {
      const current = stackRef.current;
      if (!current) return;
      const next = move(current);
      if (next === current) return;
      lastKeyRef.current = null;
      stackRef.current = next;
      setStack(next);
      onDraftChange(next.present);
    },
    [onDraftChange],
  );

  const undo = useCallback(() => step(undoHistory), [step]);
  const redo = useCallback(() => step(redoHistory), [step]);

  return {
    commit,
    undo,
    redo,
    canUndo: stack ? canUndo(stack) : false,
    canRedo: stack ? canRedo(stack) : false,
  };
}
