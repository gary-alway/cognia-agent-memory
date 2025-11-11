import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [
      "test/**/*.test.ts",
      "test/**/*.integration.test.ts",
      "test/**/*.benchmark.test.ts",
    ],
    testTimeout: 60000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "dist/", "**/*.test.ts", "src-legacy/"],
    },
  },
});

