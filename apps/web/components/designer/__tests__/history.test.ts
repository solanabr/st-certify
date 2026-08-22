import { describe, it, expect } from "vitest";
import {
  HISTORY_LIMIT,
  canRedo,
  canUndo,
  createHistory,
  pushHistory,
  redoHistory,
  replacePresent,
  undoHistory,
} from "../history";

describe("createHistory", () => {
  it("starts with the given present and nothing to undo or redo", () => {
    const history = createHistory("a");
    expect(history.present).toBe("a");
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);
  });
});

describe("pushHistory", () => {
  it("moves the old present into the past and installs the new one", () => {
    const history = pushHistory(createHistory("a"), "b");
    expect(history.present).toBe("b");
    expect(history.past).toEqual(["a"]);
    expect(canUndo(history)).toBe(true);
  });

  it("does not mutate the stack it was given", () => {
    const before = createHistory("a");
    pushHistory(before, "b");
    expect(before).toEqual({ past: [], present: "a", future: [] });
  });

  it("discards the redo branch — a new edit after undoing forks history", () => {
    const forked = redoBranch();
    expect(canRedo(forked)).toBe(true);
    const edited = pushHistory(forked, "x");
    expect(canRedo(edited)).toBe(false);
    expect(edited.future).toEqual([]);
  });
});

describe("undoHistory / redoHistory", () => {
  it("round-trips a single step", () => {
    const pushed = pushHistory(createHistory("a"), "b");
    const undone = undoHistory(pushed);
    expect(undone.present).toBe("a");
    expect(canRedo(undone)).toBe(true);

    const redone = redoHistory(undone);
    expect(redone.present).toBe("b");
    expect(canRedo(redone)).toBe(false);
    expect(canUndo(redone)).toBe(true);
  });

  it("walks back and forward through several steps in order", () => {
    let history = createHistory(0);
    for (const value of [1, 2, 3]) {
      history = pushHistory(history, value);
    }
    expect(history.present).toBe(3);

    history = undoHistory(history);
    expect(history.present).toBe(2);
    history = undoHistory(history);
    expect(history.present).toBe(1);
    history = redoHistory(history);
    expect(history.present).toBe(2);
    history = redoHistory(history);
    expect(history.present).toBe(3);
  });

  it("is a no-op at either end instead of throwing", () => {
    const empty = createHistory("a");
    expect(undoHistory(empty)).toBe(empty);
    expect(redoHistory(empty)).toBe(empty);
  });
});

describe("replacePresent", () => {
  it("overwrites the current step without adding an undo entry", () => {
    const pushed = pushHistory(createHistory("a"), "b");
    const replaced = replacePresent(pushed, "b2");
    expect(replaced.present).toBe("b2");
    expect(replaced.past).toEqual(["a"]);
    // One gesture, one undo step: undoing lands before the gesture started.
    expect(undoHistory(replaced).present).toBe("a");
  });
});

describe("bounding", () => {
  it(`keeps at most HISTORY_LIMIT (${HISTORY_LIMIT}) undo steps, dropping the oldest`, () => {
    let history = createHistory(0);
    for (let i = 1; i <= HISTORY_LIMIT + 20; i += 1) {
      history = pushHistory(history, i);
    }
    expect(history.past).toHaveLength(HISTORY_LIMIT);
    expect(history.present).toBe(HISTORY_LIMIT + 20);
    // Oldest surviving entry is the newest of the ones that fit, not step 0.
    expect(history.past[0]).toBe(20);
    expect(history.past[HISTORY_LIMIT - 1]).toBe(HISTORY_LIMIT + 19);
  });

  it("can undo exactly HISTORY_LIMIT times after overflowing", () => {
    let history = createHistory(0);
    for (let i = 1; i <= HISTORY_LIMIT + 5; i += 1) {
      history = pushHistory(history, i);
    }
    for (let i = 0; i < HISTORY_LIMIT; i += 1) {
      history = undoHistory(history);
    }
    expect(canUndo(history)).toBe(false);
    expect(history.present).toBe(5);
  });

  it("honours a caller-supplied limit", () => {
    let history = createHistory(0);
    for (let i = 1; i <= 10; i += 1) {
      history = pushHistory(history, i, 3);
    }
    expect(history.past).toEqual([7, 8, 9]);
    expect(history.present).toBe(10);
  });
});

function redoBranch(): ReturnType<typeof createHistory<string>> {
  return undoHistory(pushHistory(createHistory("a"), "b"));
}
