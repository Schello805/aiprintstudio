export type Region = {
  id: number;
  pixels: number[];
  color: readonly [number, number, number];
  neighbors: number[];
};

export type Segmentation = {
  width: number;
  height: number;
  regionIds: Int32Array;
  regions: Region[];
};

const colorDistance = (a: readonly number[], b: readonly number[]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function segmentRgba(data: Uint8ClampedArray, width: number, height: number): Segmentation {
  const regionIds = new Int32Array(width * height).fill(-1);
  const regions: Region[] = [];
  const quantized = (index: number): readonly [number, number, number] => {
    const offset = index * 4;
    if (data[offset + 3] < 24) return [255, 255, 255];
    return [
      Math.round(data[offset] / 32) * 32,
      Math.round(data[offset + 1] / 32) * 32,
      Math.round(data[offset + 2] / 32) * 32
    ];
  };

  for (let start = 0; start < width * height; start += 1) {
    if (regionIds[start] >= 0) continue;
    const id = regions.length;
    const seed = quantized(start);
    const queue = [start];
    const pixels: number[] = [];
    regionIds[start] = id;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor], x = index % width, y = Math.floor(index / width);
      pixels.push(index);
      for (const neighbor of [
        x > 0 ? index - 1 : -1,
        x + 1 < width ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y + 1 < height ? index + width : -1
      ]) {
        if (neighbor >= 0 && regionIds[neighbor] < 0 && colorDistance(seed, quantized(neighbor)) <= 34) {
          regionIds[neighbor] = id;
          queue.push(neighbor);
        }
      }
    }
    regions.push({ id, pixels, color: seed, neighbors: [] });
  }

  const neighborSets = regions.map(() => new Set<number>());
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const index = y * width + x, id = regionIds[index];
    for (const neighbor of [x + 1 < width ? index + 1 : -1, y + 1 < height ? index + width : -1]) {
      if (neighbor >= 0 && regionIds[neighbor] !== id) {
        neighborSets[id].add(regionIds[neighbor]);
        neighborSets[regionIds[neighbor]].add(id);
      }
    }
  }
  for (const region of regions) region.neighbors = [...neighborSets[region.id]];
  const smallLimit = width * height >= 400 ? Math.max(4, Math.floor(width * height * 0.0015)) : 0;
  if (!smallLimit) return { width, height, regionIds, regions };
  const parent = regions.map((region) => region.id);
  const find = (id: number): number => parent[id] === id ? id : (parent[id] = find(parent[id]));
  for (const region of regions) {
    if (region.pixels.length > smallLimit || !region.neighbors.length) continue;
    const target = region.neighbors
      .map((id) => regions[id])
      .filter((neighbor) => colorDistance(region.color, neighbor.color) <= 100)
      .sort((a, b) => colorDistance(region.color, a.color) - colorDistance(region.color, b.color) || b.pixels.length - a.pixels.length)[0];
    if (target) parent[region.id] = find(target.id);
  }
  const idMap = new Map<number, number>();
  const mergedIds = new Int32Array(regionIds.length);
  const mergedPixels: number[][] = [];
  const colorSums: Array<[number, number, number]> = [];
  for (let pixel = 0; pixel < regionIds.length; pixel += 1) {
    const root = find(regionIds[pixel]);
    if (!idMap.has(root)) {
      idMap.set(root, idMap.size);
      mergedPixels.push([]);
      colorSums.push([0, 0, 0]);
    }
    const id = idMap.get(root) ?? 0;
    mergedIds[pixel] = id;
    mergedPixels[id].push(pixel);
    const offset = pixel * 4;
    colorSums[id][0] += data[offset];
    colorSums[id][1] += data[offset + 1];
    colorSums[id][2] += data[offset + 2];
  }
  const mergedRegions: Region[] = mergedPixels.map((pixels, id) => ({
    id,
    pixels,
    color: colorSums[id].map((value) => Math.round(value / pixels.length)) as [number, number, number],
    neighbors: []
  }));
  const mergedNeighborSets = mergedRegions.map(() => new Set<number>());
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const index = y * width + x, id = mergedIds[index];
    for (const neighbor of [x + 1 < width ? index + 1 : -1, y + 1 < height ? index + width : -1]) {
      if (neighbor >= 0 && mergedIds[neighbor] !== id) {
        mergedNeighborSets[id].add(mergedIds[neighbor]);
        mergedNeighborSets[mergedIds[neighbor]].add(id);
      }
    }
  }
  for (const region of mergedRegions) region.neighbors = [...mergedNeighborSets[region.id]];
  return { width, height, regionIds: mergedIds, regions: mergedRegions };
}

export function initialRegionLevels(segmentation: Segmentation): Uint8ClampedArray {
  const levels = new Uint8ClampedArray(segmentation.width * segmentation.height);
  const subjectArea = Math.max(1, segmentation.width * segmentation.height);
  for (const region of segmentation.regions) {
    const ratio = region.pixels.length / subjectArea;
    const dark = Math.max(...region.color) < 128;
    const level = dark ? 210 : ratio > 0.08 ? 30 : ratio > 0.006 ? 174 : ratio > 0.00015 ? 235 : 194;
    for (const pixel of region.pixels) levels[pixel] = level;
  }
  return levels;
}

export function expandRegionSelection(selection: ReadonlySet<number>, regions: Region[]): Set<number> {
  const next = new Set(selection);
  for (const id of selection) for (const neighbor of regions[id]?.neighbors ?? []) next.add(neighbor);
  return next;
}

export function reduceRegionSelection(selection: ReadonlySet<number>, regions: Region[]): Set<number> {
  return new Set([...selection].filter((id) => (regions[id]?.neighbors ?? []).every((neighbor) => selection.has(neighbor))));
}

export function selectSimilarRegions(sourceId: number, regions: Region[], tolerance = 55): Set<number> {
  const source = regions[sourceId];
  if (!source) return new Set();
  return new Set(regions.filter((region) => colorDistance(source.color, region.color) <= tolerance).map((region) => region.id));
}

export function setSelectedRegionLevel(
  levels: Uint8ClampedArray,
  selection: ReadonlySet<number>,
  regions: Region[],
  value: number
): Uint8ClampedArray {
  const next = levels.slice();
  for (const id of selection) for (const pixel of regions[id]?.pixels ?? []) next[pixel] = Math.max(0, Math.min(255, value));
  return next;
}

export function smoothSelectedLevels(
  levels: Uint8ClampedArray,
  selection: ReadonlySet<number>,
  segmentation: Segmentation
): Uint8ClampedArray {
  const next = levels.slice();
  const selectedPixels = new Uint8Array(levels.length);
  for (const id of selection) for (const pixel of segmentation.regions[id]?.pixels ?? []) selectedPixels[pixel] = 1;
  for (let y = 0; y < segmentation.height; y += 1) for (let x = 0; x < segmentation.width; x += 1) {
    const index = y * segmentation.width + x;
    if (!selectedPixels[index]) continue;
    let sum = levels[index] * 4, count = 4;
    for (const neighbor of [
      x > 0 ? index - 1 : -1,
      x + 1 < segmentation.width ? index + 1 : -1,
      y > 0 ? index - segmentation.width : -1,
      y + 1 < segmentation.height ? index + segmentation.width : -1
    ]) {
      if (neighbor >= 0) { sum += levels[neighbor]; count += 1; }
    }
    next[index] = Math.round(sum / count);
  }
  return next;
}
