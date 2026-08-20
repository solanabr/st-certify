import { describe, expect, it } from "vitest";
import { csvEscape, toCsv } from "../csv";

describe("csvEscape", () => {
  it("leaves plain values untouched", () => {
    expect(csvEscape("hello")).toBe("hello");
    expect(csvEscape("")).toBe("");
    expect(csvEscape("wallet-1")).toBe("wallet-1");
  });

  it("quotes values containing the delimiter", () => {
    expect(csvEscape("a,b")).toBe('"a,b"');
  });

  it("doubles embedded double quotes", () => {
    expect(csvEscape('she said "hi"')).toBe('"she said ""hi"""');
  });

  it("quotes values with newlines or carriage returns", () => {
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
    expect(csvEscape("line1\r\nline2")).toBe('"line1\r\nline2"');
  });
});

describe("toCsv", () => {
  it("joins headers and rows with CRLF", () => {
    expect(
      toCsv(
        ["a", "b"],
        [
          ["1", "2"],
          ["3", "4"],
        ],
      ),
    ).toBe("a,b\r\n1,2\r\n3,4");
  });

  it("escapes fields containing the delimiter, quotes, or newlines", () => {
    const csv = toCsv(
      ["wallet", "note"],
      [
        ["W1", "has, comma"],
        ["W2", 'has "quote"'],
        ["W3", "has\nnewline"],
      ],
    );
    expect(csv).toBe(
      "wallet,note\r\n" +
        'W1,"has, comma"\r\n' +
        'W2,"has ""quote"""\r\n' +
        'W3,"has\nnewline"',
    );
  });

  it("serializes only the header row when there are no data rows", () => {
    expect(toCsv(["a", "b"], [])).toBe("a,b");
  });
});
