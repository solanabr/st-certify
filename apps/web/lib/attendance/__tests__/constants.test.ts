import { describe, expect, it } from "vitest";
import {
  ATTENDANCE_CAPACITY_CRITICAL,
  ATTENDANCE_CAPACITY_WARN,
  capacityLevel,
} from "../constants";

describe("capacityLevel", () => {
  it("is 'ok' below the warn threshold", () => {
    expect(capacityLevel(0)).toBe("ok");
    expect(capacityLevel(0.5)).toBe("ok");
    expect(capacityLevel(ATTENDANCE_CAPACITY_WARN - 0.01)).toBe("ok");
  });

  it("is 'warn' from the warn threshold up to (but not at) critical", () => {
    expect(capacityLevel(ATTENDANCE_CAPACITY_WARN)).toBe("warn");
    expect(capacityLevel(0.9)).toBe("warn");
    expect(capacityLevel(ATTENDANCE_CAPACITY_CRITICAL - 0.01)).toBe("warn");
  });

  it("is 'critical' at or above the critical threshold", () => {
    expect(capacityLevel(ATTENDANCE_CAPACITY_CRITICAL)).toBe("critical");
    expect(capacityLevel(1)).toBe("critical");
    expect(capacityLevel(2)).toBe("critical");
  });

  it("treats NaN and negative fractions as 'ok'", () => {
    expect(capacityLevel(Number.NaN)).toBe("ok");
    expect(capacityLevel(-1)).toBe("ok");
  });
});
