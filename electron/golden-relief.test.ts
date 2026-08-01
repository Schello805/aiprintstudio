import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createRelief } from "./relief";

const fixtures = [
  { name: "emblem", mode: "vector" as const, colors: ["#ffffff", "#ef233c", "#ffd400", "#111111"] },
  { name: "wordmark", mode: "wordmark" as const, colors: [] }
];

describe("golden relief exports", () => {
  for (const fixture of fixtures) {
    it(`keeps ${fixture.name} geometry reproducible`, async () => {
      const directory = await mkdtemp(join(tmpdir(), `ai-print-golden-${fixture.name}-`));
      try {
        const result = await createRelief(
          resolve(`test-fixtures/golden/${fixture.name}.svg`),
          directory,
          {
            widthMm: 100, baseMm: 1.6, reliefMm: 4, resolution: 128,
            profile: "logo", processingMode: fixture.mode, smoothing: 3,
            colors: fixture.colors, sourceColors: fixture.colors, sideColorIndex: Math.max(0, fixture.colors.length - 1),
            includeBackground: fixture.mode === "wordmark"
          }
        );
        const stl = await readFile(result.stlPath);
        expect(result.geometryValidation.valid).toBe(true);
        expect(result.geometryValidation.stats.invalidTriangles).toBe(0);
        expect(result.contourQuality.score).toBeGreaterThanOrEqual(60);
        expect(result.triangleCount).toBeGreaterThan(100);
        expect(createHash("sha256").update(stl).digest("hex")).toMatchSnapshot();
        expect({ triangles: result.triangleCount, contour: result.contourQuality.score }).toMatchSnapshot();
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }, 20_000);
  }
});
