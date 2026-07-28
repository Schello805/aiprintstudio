import { describe, expect, it } from "vitest";
import {
  expandRegionSelection,
  initialRegionLevels,
  reduceRegionSelection,
  segmentRgba,
  selectSimilarRegions,
  setSelectedRegionLevel
} from "./region-editor";

function rgba(colors: Array<readonly [number, number, number]>): Uint8ClampedArray {
  return new Uint8ClampedArray(colors.flatMap(([r, g, b]) => [r, g, b, 255]));
}

describe("region editor", () => {
  it("separates connected color areas and records adjacency", () => {
    const segmentation = segmentRgba(rgba([
      [255, 255, 255], [255, 255, 255], [0, 0, 0],
      [255, 255, 255], [255, 0, 0], [0, 0, 0]
    ]), 3, 2);
    expect(segmentation.regions).toHaveLength(3);
    expect(segmentation.regions.some((region) => region.pixels.length === 3)).toBe(true);
    expect(segmentation.regions.every((region) => region.neighbors.length > 0)).toBe(true);
  });

  it("expands and reduces a selection by adjacent regions", () => {
    const segmentation = segmentRgba(rgba([
      [255, 0, 0], [0, 0, 0], [255, 255, 255]
    ]), 3, 1);
    expect(expandRegionSelection(new Set([1]), segmentation.regions)).toEqual(new Set([1, 0, 2]));
    expect(reduceRegionSelection(new Set([0, 1]), segmentation.regions)).toEqual(new Set([0]));
  });

  it("selects similar colors and applies one height to all selected areas", () => {
    const segmentation = segmentRgba(rgba([
      [255, 0, 0], [0, 0, 0], [240, 10, 10]
    ]), 3, 1);
    const selected = selectSimilarRegions(0, segmentation.regions);
    expect(selected.size).toBe(2);
    const levels = setSelectedRegionLevel(initialRegionLevels(segmentation), selected, segmentation.regions, 123);
    expect(levels[0]).toBe(123);
    expect(levels[2]).toBe(123);
    expect(levels[1]).not.toBe(123);
  });
});
