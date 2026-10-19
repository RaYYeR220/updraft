import { defineConfig } from "vitest/config";

// Unit tests only: no anvil fork, no deploy.
export default defineConfig({ test: { include: ["test/**/*.unit.test.ts"] } });
