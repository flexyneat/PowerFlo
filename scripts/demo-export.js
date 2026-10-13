/** @fileoverview Builds a single-file offline fixture without modifying the production card bundle. */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rollup } from "rollup";

/** Default source root follows this module rather than the caller's working directory. */
const PROJECT_ROOT = fileURLToPath(new URL("../",import.meta.url));

/**
 * Prevents inline JavaScript strings/comments from prematurely closing the HTML script element.
 * @param {string} code Bundled JavaScript.
 * @returns {string} HTML-safe executable script text.
 */
export function escapeInlineScript(code) {
  return code.replace(/<\/script/gi,match=>match.replace("/","\\/"));
}

/**
 * Bundles the existing simulated fixture and embeds its default PNG while retaining default-art bounds.
 * @param {string} rootDir Project root containing demo, src and assets.
 * @returns {Promise<string>} Self-contained offline HTML; no generated source files are needed.
 */
export async function standaloneHtml(rootDir = PROJECT_ROOT) {
  const root=resolve(rootDir);
  const template=await readFile(resolve(root,"demo/index.html"),"utf8");
  const license=await readFile(resolve(root,"LICENSE"),"utf8");
  const entries=[...template.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
  if (entries.length!==1) throw new Error("Demo export requires exactly one inline module entry");
  const entry=resolve(root,"demo/.offline-entry.js");
  const art=`data:image/png;base64,${(await readFile(resolve(root,"assets/inverter-reference.png"))).toString("base64")}`;
  // Fixture history paths are parsed, not fetched. A valid inert base also works under file://, whose origin is null.
  const source=entries[0][1].replace('import "../dist/powerflo-card.js";','import "../src/index.js";')
    .replace("new URL(path, location.origin)",'new URL(path, "https://powerflo-demo.invalid/")');
  const bundle=await rollup({input:entry,plugins:[{
    name:"powerflo-offline-fixture",
    /** @param {string} id Requested module. @returns {string|null} Resolve the fileless entry before filesystem resolution. */
    resolveId(id) { return id===entry ? entry : null; },
    /** @param {string} id Module ID. @returns {string|null} The virtual fixture, or regular resolution. */
    load(id) { return id===entry ? source : null; },
    /** @param {string} code Module source. @param {string} id Module ID. @returns {Object|null} Export-only asset substitution. */
    transform(code,id) {
      if (id!==resolve(root,"src/card.js")) return null;
      const block=/const resourceUrl = new URL\(import\.meta\.url\);\s*const imageUrl = new URL\("\.\/inverter-reference\.png", resourceUrl\);\s*imageUrl\.search = resourceUrl\.search;\s*image\.src = imageUrl\.href;/g;
      if ([...code.matchAll(block)].length!==1) throw new Error("Default-art export hook changed; update and verify the exporter");
      // This changes only exported demo code, so real/custom image routing and production asset loading are untouched.
      return {code:code.replace(block,()=>`image.src = ${JSON.stringify(art)};`),map:null};
    }
  }]});
  try {
    const {output}=await bundle.generate({format:"iife",sourcemap:false});
    const script=output.filter(chunk=>chunk.type==="chunk").map(chunk=>chunk.code).join("\n");
    if (output.some(chunk=>chunk.type!=="chunk")) throw new Error("Offline export unexpectedly produced an external asset");
    const policy="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
    return template.replace(entries[0][0],()=>`<script>\n${escapeInlineScript(script)}\n</script>`)
      .replace("<!doctype html>",`<!doctype html>\n<!--\n${license.replaceAll("--","- -")}\n-->`)
      .replace('<meta charset="utf-8">',`<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}">`);
  } finally {
    await bundle.close();
  }
}
