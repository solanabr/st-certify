import { describe, expect, it } from "vitest";
import { applyThemeColor } from "@/components/theme-color-sync";

// jsdom is not a dependency (vitest runs in the node environment), so these
// drive applyThemeColor with a stub narrow enough to cover what it touches:
// querySelectorAll, createElement and head.appendChild.

type StubMeta = {
  attrs: Record<string, string>;
  setAttribute: (name: string, value: string) => void;
};

function stubMeta(attrs: Record<string, string> = {}): StubMeta {
  const meta: StubMeta = {
    attrs: { ...attrs },
    setAttribute: (name, value) => {
      meta.attrs[name] = value;
    },
  };
  return meta;
}

function stubDocument(existing: StubMeta[]) {
  const appended: StubMeta[] = [];
  const selectors: string[] = [];

  const doc = {
    querySelectorAll: (selector: string) => {
      selectors.push(selector);
      return {
        length: existing.length,
        forEach: (fn: (meta: StubMeta) => void) => existing.forEach(fn),
      };
    },
    createElement: () => stubMeta(),
    head: {
      appendChild: (node: StubMeta) => {
        appended.push(node);
      },
    },
  };

  return { doc: doc as unknown as Document, appended, selectors };
}

describe("applyThemeColor", () => {
  it("rewrites the content of the whole SSR media pair", () => {
    const light = stubMeta({
      name: "theme-color",
      media: "(prefers-color-scheme: light)",
      content: "#f5e8ca",
    });
    const dark = stubMeta({
      name: "theme-color",
      media: "(prefers-color-scheme: dark)",
      content: "#11160f",
    });
    const { doc, appended, selectors } = stubDocument([light, dark]);

    applyThemeColor(doc, "#11160f");

    // Both carry the resolved colour, so whichever the UA's media match picks
    // reports dark — that is what makes this win without touching tree order.
    expect(light.attrs.content).toBe("#11160f");
    expect(dark.attrs.content).toBe("#11160f");
    // The media attributes stay put; nothing is neutralised or removed.
    expect(light.attrs.media).toBe("(prefers-color-scheme: light)");
    expect(appended).toHaveLength(0);
    expect(selectors).toEqual(['meta[name="theme-color"]']);
  });

  it("appends one tagged meta when the document has none", () => {
    const { doc, appended } = stubDocument([]);

    applyThemeColor(doc, "#f5e8ca");

    expect(appended).toHaveLength(1);
    expect(appended[0].attrs).toEqual({
      name: "theme-color",
      content: "#f5e8ca",
    });
  });
});
