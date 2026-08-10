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
  test: {
    environment: "node",
  },
});
