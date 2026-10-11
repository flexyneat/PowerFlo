/**
 * @fileoverview Rollup configuration for the dependency-free browser bundle.
 */

/** @type {import('rollup').RollupOptions} */
const config = {
  input: "src/index.js",
  output: {
    file: "dist/powerflo-card.js",
    format: "es",
    sourcemap: true,
  },
};

export default config;
