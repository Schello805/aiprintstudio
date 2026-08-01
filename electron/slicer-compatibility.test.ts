import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createRelief } from "./relief";
import { inspectSlicerCompatibility } from "./slicer-compatibility";

describe("slicer compatibility fixtures", () => {
  it("passes scale, orientation, colors and assembly checks for all supported slicers", async () => {
    const directory = await mkdtemp(join(tmpdir(), "slicer-compat-"));
    const palette = ["#F7F7F5", "#EF233C", "#FFD400", "#111111"];
    try {
      const relief = await createRelief(resolve("test-fixtures/logos/multicolor.svg"), directory, {
        pipelineKind: "emblem", processingMode: "vector", profile: "logo", resolution: 192,
        widthMm: 100, sourceColors: palette, colors: palette, colorMapping: [0, 1, 2, 3], sideColorIndex: 3
      });
      const reports = await inspectSlicerCompatibility(
        await readFile(relief.stlPath), await readFile(relief.threeMfPath),
        { widthMm: relief.widthMm, heightMm: relief.heightMm, colorCount: palette.length }
      );
      expect(reports.map((report) => report.slicer)).toEqual(["Bambu Studio", "OrcaSlicer", "Anycubic Slicer", "PrusaSlicer"]);
      expect(reports.every((report) => report.compatible), JSON.stringify(reports, null, 2)).toBe(true);
    } finally { await rm(directory, { recursive: true, force: true }); }
  }, 25_000);
});
