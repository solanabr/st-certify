import { describe, it, expect } from "vitest";
import { nextRadioIndex } from "../radio-nav";

describe("nextRadioIndex", () => {
  it("moves forward on ArrowDown and ArrowRight", () => {
    expect(nextRadioIndex(0, "ArrowDown", 3)).toBe(1);
    expect(nextRadioIndex(0, "ArrowRight", 3)).toBe(1);
    expect(nextRadioIndex(1, "ArrowDown", 3)).toBe(2);
  });

  it("moves backward on ArrowUp and ArrowLeft", () => {
    expect(nextRadioIndex(2, "ArrowUp", 3)).toBe(1);
    expect(nextRadioIndex(2, "ArrowLeft", 3)).toBe(1);
    expect(nextRadioIndex(1, "ArrowUp", 3)).toBe(0);
  });

  it("wraps at both ends", () => {
    expect(nextRadioIndex(2, "ArrowDown", 3)).toBe(0);
    expect(nextRadioIndex(0, "ArrowUp", 3)).toBe(2);
  });

  it("jumps to first/last on Home/End", () => {
    expect(nextRadioIndex(1, "Home", 3)).toBe(0);
    expect(nextRadioIndex(1, "End", 3)).toBe(2);
  });

  it("enters the group from an unselected state", () => {
    expect(nextRadioIndex(-1, "ArrowDown", 3)).toBe(0);
    expect(nextRadioIndex(-1, "ArrowUp", 3)).toBe(2);
  });

  it("returns null for keys the pattern does not own", () => {
    expect(nextRadioIndex(0, "Tab", 3)).toBeNull();
    expect(nextRadioIndex(0, "Enter", 3)).toBeNull();
    expect(nextRadioIndex(0, " ", 3)).toBeNull();
    expect(nextRadioIndex(0, "a", 3)).toBeNull();
  });

  it("returns null for an empty group", () => {
    expect(nextRadioIndex(0, "ArrowDown", 0)).toBeNull();
  });

  it("handles a single-option group", () => {
    expect(nextRadioIndex(0, "ArrowDown", 1)).toBe(0);
    expect(nextRadioIndex(0, "ArrowUp", 1)).toBe(0);
  });
});
