import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./test/setup.ts"],
    testTimeout: 180_000,
    hookTimeout: 600_000,
    fileParallelism: false,
  },
});
