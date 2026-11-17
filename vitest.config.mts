import { defineConfig } from "vitest/config";

// Unit tests for midi's Foundry-free code (rules, registries, transitions). Integration tests stay in Quench.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    setupFiles: ["test/setup.ts"],
  },
});
