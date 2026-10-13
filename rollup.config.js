/**
 * @fileoverview Rollup configuration for the dependency-free browser bundle.
 */
import { copyFile, readFile } from "node:fs/promises";

/** Keep the MIT permission and copyright notice with redistributed standalone JavaScript. */
const license=await readFile(new URL("./LICENSE",import.meta.url),"utf8");

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
    banner: `/*!\n${license.replaceAll("*/","* /")}\n*/`,
  },
};

export default config;
