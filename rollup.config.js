/**
 * @fileoverview Rollup configuration for the dependency-free browser bundle.
 */
import { copyFile } from "node:fs/promises";

/** @type {import('rollup').RollupOptions} */
const config = {
  input: "src/index.js",
  plugins: [{
    name: "powerflo-local-art",
    /** Copies the generated transparent illustration alongside the standalone module. */
    async writeBundle() { await copyFile("assets/inverter-reference.png", "dist/inverter-reference.png"); },
  }],
  output: {
    file: "dist/powerflo-card.js",
    format: "es",
    sourcemap: true,
  },
};

export default config;
