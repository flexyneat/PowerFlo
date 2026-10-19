/**
 * @fileoverview Vitest configuration for browser-like JavaScript unit tests.
 */

import { defineConfig } from "vitest/config";

/** @type {import('vitest/config').UserConfig} */
const config = defineConfig({
  test: {
    // Bound browser-like workers to avoid memory/CPU contention without weakening any assertion or timeout.
    maxWorkers: 2,
    environment: "happy-dom",
    include: ["test/**/*.test.js"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/card.js", "src/editor.js", "src/solar-outlook.js", "src/estimate-accuracy.js", "src/phase3-panel.js", "src/comparison.js", "src/comparison-controller.js", "src/grid-insights.js", "src/readiness.js", "src/entity-setup.js", "src/readiness-panel.js", "src/setup-guide.js", "src/insights.js", "src/outage-history.js", "src/config.js", "src/state-model.js", "src/flow-engine.js", "src/history.js", "src/runtime.js", "src/period-history.js", "src/charge-model.js", "src/statistics.js", "src/chart-inspection.js", "src/connector-geometry.js", "src/icons.js", "src/presentation.js", "src/load-trend.js", "scripts/demo-export.js"],
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
