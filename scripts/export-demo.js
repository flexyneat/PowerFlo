/** @fileoverview Command-line build of the versioned, standalone PowerFlo demo. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { standaloneHtml } from "./demo-export.js";

const root=new URL("../",import.meta.url);
const metadata=JSON.parse(await readFile(new URL("package.json",root),"utf8"));
if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(metadata.version)) throw new Error("Invalid demo version filename");
const destination=new URL(`dist/PowerFlo-demo-v${metadata.version}.html`,root);
await mkdir(new URL("dist/",root),{recursive:true});
await writeFile(destination,await standaloneHtml(fileURLToPath(root)),"utf8");
process.stdout.write(`Standalone offline demo: ${fileURLToPath(destination)}\n`);
