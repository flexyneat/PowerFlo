/** @fileoverview Single-file export contracts: self-contained assets and safe inline JavaScript. */
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { standaloneHtml, escapeInlineScript } from "../scripts/demo-export.js";

describe("offline HTML export", () => {
  it("escapes case-insensitive closing script tags without changing executable content", () => {
    expect(escapeInlineScript('const text="</ScRiPt>";')).toBe('const text="<\\/ScRiPt>";');
  });
  it("embeds the real card, fixture logic and raster asset without external imports", async () => {
    const html=await standaloneHtml();
    expect(html).toContain("data:image/png;base64,iVBOR");
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain("PowerFlo preview · simulated data");
    expect(html).toContain("Battery details");
    expect(html).toContain("Discharge reserve:");
    expect(html).not.toContain("sourceMappingURL");
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/import\s+(?:["'{*]|\()/);
    expect(html).not.toContain("import.meta");
    expect(html).not.toContain("location.origin");
    expect((html.match(/<script>/g)??[]).length).toBe(1);
    expect(html).not.toContain("Change theme");
    expect(html).toContain("Off-Grid");
    expect(html).toContain("Switch to dark mode");
    expect(html).toContain("Customize system");
    expect(html).toContain("grid-mode");
    expect(html).toContain("Copyright (c) 2026 PowerFlo contributors");
    const embedded=html.match(/data:image\/png;base64,([a-zA-Z0-9+/=]+)/)[1];
    expect(Buffer.from(embedded,"base64")).toEqual(await readFile(new URL("../assets/inverter-reference.png",import.meta.url)));
  // Bundling and coverage instrumentation take longer on shared CI runners; retain every export assertion.
  }, 30_000);
  it("reports a missing project instead of creating a misleading empty export", async () => {
    await expect(standaloneHtml("/private/tmp/powerflo-missing-project-for-test")).rejects.toThrow();
  });
});
