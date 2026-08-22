import { describe, it, expect } from "vitest";

/**
 * The designer pulls in four browser-oriented libraries (react-moveable,
 * react-selecto, @scena/react-guides, @dnd-kit). None of them may touch
 * `window` or `document` at import time: the wizard page is a client
 * component, so Next still evaluates this module graph while prerendering
 * even though the canvas itself never renders there (it needs an uploaded
 * template first).
 *
 * Vitest runs with `environment: "node"` — no DOM globals at all — so a
 * successful import here is the assertion. Without it this only surfaces in
 * `next build`, which is the one gate that has caught this class of breakage
 * before.
 */
describe("designer module graph", () => {
  it("imports in a DOM-free environment", async () => {
    expect(globalThis.document).toBeUndefined();
    expect(globalThis.window).toBeUndefined();

    const { TemplateDesigner } = await import("../template-designer");
    expect(typeof TemplateDesigner).toBe("function");
  });
});
