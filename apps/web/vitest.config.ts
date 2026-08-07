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
    },
  },
  test: {
    environment: "node",
  },
});
