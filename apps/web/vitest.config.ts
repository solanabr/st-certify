import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // See lib/render/__tests__/server-only-stub.ts for why this is needed.
      "server-only": path.resolve(
        import.meta.dirname,
        "lib/render/__tests__/server-only-stub.ts",
      ),
      // Mirrors tsconfig.json's "@/*" -> "./*" — Vite doesn't read tsconfig
      // paths on its own. Needed so lib/chain/server.test.ts can load (and
      // vi.mock) modules that import via "@/lib/..." internally.
      "@": import.meta.dirname,
    },
  },
  // tsconfig.json keeps jsx: "preserve" for Next's own compiler, which Vite
  // can't load — importing any .tsx component from a test fails import
  // analysis as invalid JS. Component tests render through react-dom/server
  // (markup only, no DOM), so this transform is the only thing they need.
  oxc: {
    jsx: { runtime: "automatic" },
  },
  test: {
    environment: "node",
  },
});
