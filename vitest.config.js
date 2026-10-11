/**
 * @fileoverview Vitest configuration for browser-like JavaScript unit tests.
 */

import { defineConfig } from "vitest/config";

/** @type {import('vitest/config').UserConfig} */
const config = defineConfig({
  test: {
    environment: "happy-dom",
    include: ["test/**/*.test.js"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/config.js", "src/state-model.js", "src/flow-engine.js", "src/history.js"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});

export default config;
