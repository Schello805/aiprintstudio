import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import sharp from "sharp";
import { contours } from "d3-contour";
import { DOMParser } from "@xmldom/xmldom";
import { Color, ExtrudeGeometry, ShapeUtils } from "three";
import { SVGLoader } from "./vendor/SVGLoader.js";
import { validateGeneratedExportBuffer } from "./export-validation.js";
import { analyseContourQuality, removeInvalidTriangles, validateMeshGeometry } from "./mesh-quality.js";
import {
  encodeBinaryStl,
  encodeThreeMf,
  estimateMeshVolume,
  normalOf,
  sanitizeStem,
  type Mesh,
  type Triangle,
  type Vec3
} from "./relief-export.js";
import { hasUsefulTransparency } from "./relief-masks.js";
import {
  buildCanonicalMeshPreview,
  mergeMeshes,
  orientMeshLikePreview,
  smoothVectorRing
} from "./relief-meshing.js";
import type { PrintabilityReport, ReliefOptions, ReliefProgress, ReliefResult } from "./relief.js";

export type SvgReliefPart = {
  mesh: Mesh;
  color: string;
  area: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
};

export const wordmarkRasterTracePreset = {
  /**
   * Festgezurrtes Qualitätsprofil für PNG/JPG → SVG im Modus "Logo mit Text".
   * Diese Werte sind absichtlich keine UI-Regler: SVG bleibt der saubere
   * Qualitätsweg, Rasterlogos sollen aber stabil und ohne zufällige
   * Detail-/Artefaktänderungen konvertiert werden.
   */
  minimumTraceWidthPx: 256,
  maximumTraceWidthPx: 1200,
  resolutionScale: 2,
  sampleTargetPixels: 20_000,
  alphaCutoff: 24,
  maximumColorClusters: 6,
  kMeansIterations: 9,
  minimumComponentAreaRatio: 0.00008,
  backgroundTraceSmoothing: 2,
  motifTraceSmoothing: 3
} as const;

export function transformProductMesh(mesh: Mesh, widthMm: number, curveAngle: number, mirrorX: boolean): Mesh {
  const radians = curveAngle * Math.PI / 180;
  const radius = radians > 1e-6 ? widthMm / radians : 0;
  return {
    vertices: mesh.vertices.map(([x, y, z]) => {
      const centered = (mirrorX ? widthMm - x : x) - widthMm / 2;
      if (!radius) return [centered + widthMm / 2, y, z] as const;
      const angle = centered / radius;
      return [radius * Math.sin(angle) + widthMm / 2, y, z + radius * (1 - Math.cos(angle))] as const;
    }),
    triangles: mirrorX ? mesh.triangles.map(([a, b, c]) => [a, c, b] as const) : mesh.triangles.slice()
  };
}

export function meshFromExtrudeGeometry(geometry: ExtrudeGeometry, bottom: number): Mesh {
  geometry.translate(0, 0, bottom);
  const position = geometry.getAttribute("position");
  const vertices: Vec3[] = [];
  for (let index = 0; index < position.count; index += 1) {
    vertices.push([position.getX(index), position.getY(index), position.getZ(index)]);
  }
  const triangles: Triangle[] = [];
  const indexAttribute = geometry.getIndex();
  if (indexAttribute) {
    for (let offset = 0; offset < indexAttribute.count; offset += 3) {
      triangles.push([indexAttribute.getX(offset), indexAttribute.getX(offset + 1), indexAttribute.getX(offset + 2)]);
    }
  } else {
    for (let offset = 0; offset < vertices.length; offset += 3) triangles.push([offset, offset + 1, offset + 2]);
  }
  geometry.dispose();
  return { vertices, triangles };
}

export function normalizeSvgMesh(mesh: Mesh, bounds: { minX: number; minY: number; maxX: number; maxY: number }, widthMm: number): Mesh {
  const svgWidth = Math.max(1e-6, bounds.maxX - bounds.minX);
  const scale = widthMm / svgWidth;
  return {
    vertices: mesh.vertices.map(([x, y, z]) => [
      (x - bounds.minX) * scale,
      (bounds.maxY - y) * scale,
      z
    ] as const),
    triangles: mesh.triangles.map(([a, b, c]) => [a, c, b] as const)
  };
}

export function colorFromSvgFill(fill: unknown): string {
  if (typeof fill !== "string" || !fill || fill === "none") return "#111111";
  try {
    return `#${new Color(fill).getHexString().toUpperCase()}`;
  } catch {
    return "#111111";
  }
}

export function uniqueColorsInOrder(colors: string[]): string[] {
  const result: string[] = [];
  for (const color of colors) if (!result.includes(color)) result.push(color);
  return result.length ? result : ["#B7F58A"];
}

export function svgPointBounds(points: Array<{ x: number; y: number }>): SvgReliefPart["bounds"] {
  let minX = Number.POSITIVE_INFINITY, minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY, maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    minX = Math.min(minX, point.x); minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y);
  }
  return { minX, minY, maxX, maxY };
}

export function isNeedleLikeSvgArtifact(part: SvgReliefPart, scaleMm: number): boolean {
  const widthMm = Math.max(0, (part.bounds.maxX - part.bounds.minX) * scaleMm);
  const heightMm = Math.max(0, (part.bounds.maxY - part.bounds.minY) * scaleMm);
  const minDimensionMm = Math.min(widthMm, heightMm);
  const maxDimensionMm = Math.max(widthMm, heightMm);
  const areaMm2 = part.area * scaleMm * scaleMm;
  if (minDimensionMm <= 1e-6 || maxDimensionMm <= 1e-6) return true;
  const aspect = maxDimensionMm / minDimensionMm;
  // Entfernt isolierte Nadeln aus SVG-/Trace-Artefakten. Kleine Punkte,
  // Umlautpunkte und echte kurze Details bleiben erhalten; gefiltert werden
  // nur extrem langgezogene, sehr schmale Restflächen, die im Druck als
  // ungewollte Spitzen erscheinen.
  return aspect >= 14 && minDimensionMm < 0.32 && areaMm2 < 6;
}

export async function createSvgPathRelief(
  imagePath: string,
  outputDirectory: string,
  options: ReliefOptions,
  onProgress: (update: ReliefProgress) => void
): Promise<ReliefResult | null> {
  onProgress({ phase: "SVG-Pfade lesen", detail: "Echte Vektorkurven werden geladen …", progress: 14 });
  let svg: string;
  try {
    svg = await readFile(imagePath, "utf8");
  } catch {
    return null;
  }
  let parsed: ReturnType<SVGLoader["parse"]>;
  try {
    globalThis.DOMParser ??= DOMParser as typeof globalThis.DOMParser;
    parsed = new SVGLoader().parse(svg);
  } catch {
    return null;
  }
  const rawParts: SvgReliefPart[] = [];
  const pathSamplePoints = svgPathSamplePoints(options.resolution);
  const curveSegments = svgCurveSegments(options.resolution);
  let unsupportedVectorPaint = false;
  for (const path of parsed.paths) {
    const style = path.userData?.style as { fill?: string; fillOpacity?: number; opacity?: number } | undefined;
    if (style?.fill === "none" || style?.fillOpacity === 0 || style?.opacity === 0) {
      unsupportedVectorPaint = true;
      continue;
    }
    if (typeof style?.fill === "string" && style.fill.startsWith("url(")) {
      unsupportedVectorPaint = true;
      continue;
    }
    const color = colorFromSvgFill(style?.fill ?? path.color?.getStyle());
    const shapes = SVGLoader.createShapes(path);
    for (const shape of shapes) {
      const points = shape.getPoints(pathSamplePoints);
      if (points.length < 3) continue;
      const area = Math.abs(ShapeUtils.area(points));
      if (area < 1e-3) continue;
      // Die Höhe wird später pro Fläche entschieden. Die SVG-Kurven selbst
      // bleiben hier als Bézier-Geometrie erhalten und werden nicht über ein
      // Pixelraster zurückgerechnet.
      const geometry = new ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, curveSegments, steps: 1 });
      rawParts.push({ mesh: meshFromExtrudeGeometry(geometry, 0), color, area, bounds: svgPointBounds(points) });
    }
  }
  if (!rawParts.length || (unsupportedVectorPaint && rawParts.length <= 1)) return null;
  let minX = Number.POSITIVE_INFINITY, minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY, maxY = Number.NEGATIVE_INFINITY;
  for (const part of rawParts) for (const [x, y] of part.mesh.vertices) {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || maxX <= minX || maxY <= minY) return null;
  const heightMm = options.widthMm * (maxY - minY) / Math.max(1e-6, maxX - minX);
  const scaleMm = options.widthMm / Math.max(1e-6, maxX - minX);
  const printableParts = rawParts.filter((part) => !isNeedleLikeSvgArtifact(part, scaleMm));
  if (!printableParts.length) return null;
  const backgroundIndex = options.includeBackground
    ? printableParts.reduce((best, part, index) => part.area > printableParts[best].area ? index : best, 0)
    : -1;
  // The UI palette is authoritative. SVG tracing may introduce gray and
  // near-black fills; those are source shades, never extra filament slots.
  const colors = options.colors.length
    ? options.colors.map(color => color.toUpperCase())
    : uniqueColorsInOrder(printableParts.map(part => part.color));
  const sourcePalette = options.sourceColors.length === options.colors.length && options.sourceColors.length
    ? options.sourceColors : colors;
  const rgb = (hex: string): [number, number, number] => [
    parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)
  ];
  const sourceCenters = sourcePalette.map(rgb);
  const materialFor = (fill: string) => {
    const sourceIndex = nearestColorCenter(rgb(fill), sourceCenters);
    const target = options.colors.length ? (options.colorMapping[sourceIndex] ?? sourceIndex) : sourceIndex;
    return Math.max(0, Math.min(colors.length - 1, target));
  };
  const normalizedParts = printableParts.map((part, index) => {
    const isBackground = index === backgroundIndex;
    const bottom = isBackground ? 0 : options.includeBackground ? options.baseMm : 0;
    const top = isBackground ? options.baseMm : options.includeBackground ? options.baseMm + options.reliefMm : options.reliefMm;
    const scaled = normalizeSvgMesh(part.mesh, { minX, minY, maxX, maxY }, options.widthMm);
    const adjusted = {
      vertices: scaled.vertices.map(([x, y, z]) => [x, y, bottom + z * (top - bottom)] as const),
      triangles: scaled.triangles
    };
    return {
      mesh: removeInvalidTriangles(adjusted),
      color: colors[materialFor(part.color)],
      material: materialFor(part.color),
      name: `AMS ${materialFor(part.color) + 1}`
    };
  });
  const combined = removeInvalidTriangles(mergeMeshes(normalizedParts.map((part) => part.mesh)));
  const exportMesh = orientMeshLikePreview(transformProductMesh(combined, options.widthMm, options.curveAngle, options.mirrorX), heightMm);
  const geometryValidation = validateMeshGeometry(exportMesh);
  if (!geometryValidation.valid) return null;
  const stlBuffer = encodeBinaryStl(exportMesh, "AI Print Studio SVG Relief");
  const bodyIndex = Math.max(0, Math.min(colors.length - 1, options.sideColorIndex));
  const triangleMaterials = normalizedParts.flatMap(part => part.mesh.triangles.map(() => part.material));
  const surfaceMaterials = exportMesh.triangles.map(([a, b, c], index) =>
    [a, b, c].some(i => exportMesh.vertices[i][2] > 1e-5) &&
    normalOf(exportMesh.vertices[a], exportMesh.vertices[b], exportMesh.vertices[c])[2] > 0.85
      ? triangleMaterials[index] : bodyIndex
  );
  const threeMfBuffer = await encodeThreeMf(exportMesh, undefined, surfaceMaterials, colors, bodyIndex);
  const [stlValidation, threeMfValidation] = await Promise.all([
    validateGeneratedExportBuffer(".stl", stlBuffer),
    validateGeneratedExportBuffer(".3mf", threeMfBuffer)
  ]);
  if (!stlValidation.valid || !threeMfValidation.valid) {
    throw new Error(`Die SVG-Exportdatei hat die Sicherheitsprüfung nicht bestanden: ${[
      ...stlValidation.errors,
      ...threeMfValidation.errors
    ].join(" ")}`);
  }
  await mkdir(outputDirectory, { recursive: true });
  const namingSource = options.sourceName.trim() || basename(imagePath);
  const stem = sanitizeStem(basename(namingSource, extname(namingSource)));
  const stlPath = join(outputDirectory, `${stem}-relief.stl`);
  const threeMfPath = join(outputDirectory, `${stem}-relief.3mf`);
  await Promise.all([writeFile(stlPath, stlBuffer), writeFile(threeMfPath, threeMfBuffer)]);
  const layerHeightMm = 0.2;
  const maximumHeight = options.includeBackground ? options.baseMm + options.reliefMm : options.reliefMm;
  const layerCount = Math.max(1, Math.ceil(maximumHeight / layerHeightMm));
  const printability: PrintabilityReport = {
    score: 100,
    status: "ready",
    issues: ["SVG-Pfade direkt extrudiert – keine Raster-Vektorisierung nötig."],
    estimatedVolumeCm3: estimateMeshVolume(exportMesh) / 1000,
    checks: [
      { label: "Exportprüfung", status: "ok", detail: "STL und 3MF wurden validiert." },
      { label: "Grundplatte", status: "ok", detail: `${options.baseMm.toFixed(1)} mm sind stabil.` },
      { label: "Konturen", status: "ok", detail: "SVG-Pfade werden direkt verwendet." },
      { label: "Mindestbreite", status: "ok", detail: "Bitte im Slicer prüfen, falls die SVG sehr feine Linien enthält." }
    ]
  };
  const preview = buildCanonicalMeshPreview(exportMesh, options.widthMm, heightMm, surfaceMaterials, colors);
  const heightmapPng = await sharp(Buffer.from(svg)).resize(256, 256, { fit: "inside" }).png().toBuffer();
  onProgress({ phase: "Fertig", detail: "SVG-Pfade wurden direkt als Druckmodell exportiert.", progress: 100 });
  return {
    stlPath,
    threeMfPath,
    vertexCount: exportMesh.vertices.length,
    triangleCount: exportMesh.triangles.length,
    widthMm: options.widthMm,
    heightMm,
    options,
    printability,
    geometryValidation,
    contourQuality: analyseContourQuality(exportMesh, options.nozzleMm),
    fileBytes: { stl: stlBuffer.length, threeMf: threeMfBuffer.length },
    slicer: {
      layerHeightMm,
      layerCount,
      estimatedMinutes: Math.max(1, Math.ceil(printability.estimatedVolumeCm3 * 2 + layerCount * 0.12 + Math.max(0, colors.length - 1) * layerCount * 0.12)),
      filamentMeters: printability.estimatedVolumeCm3 * 1000 / 2.98 / 1000,
      materialGrams: printability.estimatedVolumeCm3 * 1.24,
      colorChanges: Math.max(0, colors.length - 1) * layerCount
    },
    heightmapDataUrl: `data:image/png;base64,${heightmapPng.toString("base64")}`,
    preview,
    colorRegions: colors.map((color) => ({ sourceColor: color, targetIndex: colors.indexOf(color), coveragePercent: 0 }))
  };
}

export async function createTracedWordmarkSvg(
  imagePath: string,
  outputDirectory: string,
  options: ReliefOptions,
  sourceWidth: number,
  sourceHeight: number
): Promise<string | null> {
  const targetWidth = Math.min(
    wordmarkRasterTracePreset.maximumTraceWidthPx,
    Math.max(
      wordmarkRasterTracePreset.minimumTraceWidthPx,
      Math.min(sourceWidth, options.resolution * wordmarkRasterTracePreset.resolutionScale)
    )
  );
  const targetHeight = Math.max(64, Math.round(targetWidth * sourceHeight / Math.max(1, sourceWidth)));
  const { data } = await sharp(imagePath)
    .rotate()
    .resize(targetWidth, targetHeight, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = targetWidth * targetHeight;
  const hasAlpha = hasUsefulTransparency(data);
  const colorSamples: Array<[number, number, number]> = [];
  const sampleStep = Math.max(1, Math.floor(pixels / wordmarkRasterTracePreset.sampleTargetPixels));
  for (let index = 0; index < pixels; index += sampleStep) {
    const offset = index * 4;
    if (data[offset + 3] < wordmarkRasterTracePreset.alphaCutoff) continue;
    colorSamples.push([data[offset], data[offset + 1], data[offset + 2]]);
  }
  if (colorSamples.length < 16) return null;
  const clusterCount = Math.max(
    2,
    Math.min(
      wordmarkRasterTracePreset.maximumColorClusters,
      new Set(colorSamples.map(([r, g, b]) => `${r >> 4}:${g >> 4}:${b >> 4}`)).size
    )
  );
  let centers = seedColorCenters(colorSamples, clusterCount);
  const assignments = new Int16Array(pixels);
  for (let iteration = 0; iteration < wordmarkRasterTracePreset.kMeansIterations; iteration += 1) {
    const sums = Array.from({ length: clusterCount }, () => [0, 0, 0, 0]);
    for (let index = 0; index < pixels; index += 1) {
      const offset = index * 4;
      if (data[offset + 3] < wordmarkRasterTracePreset.alphaCutoff) { assignments[index] = -1; continue; }
      const best = nearestColorCenter([data[offset], data[offset + 1], data[offset + 2]], centers);
      assignments[index] = best;
      sums[best][0] += data[offset]; sums[best][1] += data[offset + 1]; sums[best][2] += data[offset + 2]; sums[best][3] += 1;
    }
    centers = centers.map((center, index) => sums[index][3]
      ? [sums[index][0] / sums[index][3], sums[index][1] / sums[index][3], sums[index][2] / sums[index][3]] as [number, number, number]
      : center);
  }
  const rawCounts = Array(clusterCount).fill(0) as number[];
  for (const assignment of assignments) if (assignment >= 0) rawCounts[assignment] += 1;
  const rawBackgroundIndex = hasAlpha ? -1 : dominantCornerCluster(assignments, targetWidth, targetHeight, clusterCount);
  const grouped = groupSimilarLogoClusters(centers, rawCounts, rawBackgroundIndex);
  for (let index = 0; index < assignments.length; index += 1) {
    const assignment = assignments[index];
    if (assignment >= 0) assignments[index] = grouped.map[assignment] ?? assignment;
  }
  centers = grouped.centers;
  const counts = grouped.counts;
  const groupedClusterCount = centers.length;
  const backgroundIndex = rawBackgroundIndex >= 0 ? grouped.map[rawBackgroundIndex] : -1;
  const minArea = Math.max(14, Math.round(pixels * wordmarkRasterTracePreset.minimumComponentAreaRatio));
  const paths: string[] = [];
  for (let cluster = 0; cluster < groupedClusterCount; cluster += 1) {
    if (counts[cluster] < minArea) continue;
    if (!options.includeBackground && cluster === backgroundIndex) continue;
    const mask = cleanTraceMask(
      Array.from(assignments, (assignment) => assignment === cluster),
      targetWidth,
      targetHeight,
      minArea,
      true
    );
    const path = traceMaskToSvgPath(
      mask,
      targetWidth,
      targetHeight,
      options.includeBackground && cluster === backgroundIndex
        ? wordmarkRasterTracePreset.backgroundTraceSmoothing
        : wordmarkRasterTracePreset.motifTraceSmoothing
    );
    if (!path) continue;
    const color = rgbToHex(centers[cluster]);
    paths.push(`<path fill="${color}" d="${path}"/>`);
  }
  if (!paths.length) return null;
  await mkdir(outputDirectory, { recursive: true });
  const stem = sanitizeStem(basename(options.sourceName || basename(imagePath), extname(options.sourceName || imagePath)));
  const svgPath = join(outputDirectory, `${stem}-vectorized-wordmark.svg`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${targetWidth}" height="${targetHeight}" viewBox="0 0 ${targetWidth} ${targetHeight}">${paths.join("")}</svg>`;
  await writeFile(svgPath, svg, "utf8");
  return svgPath;
}

function seedColorCenters(samples: Array<[number, number, number]>, count: number): Array<[number, number, number]> {
  const centers: Array<[number, number, number]> = [samples[0]];
  while (centers.length < count) {
    let best = samples[0], bestDistance = -1;
    for (const sample of samples) {
      const distance = Math.min(...centers.map((center) => colorDistance(sample, center)));
      if (distance > bestDistance) { best = sample; bestDistance = distance; }
    }
    centers.push(best);
  }
  return centers;
}

function nearestColorCenter(color: [number, number, number], centers: Array<[number, number, number]>): number {
  let best = 0, bestDistance = Number.POSITIVE_INFINITY;
  centers.forEach((center, index) => {
    const distance = colorDistance(color, center);
    if (distance < bestDistance) { best = index; bestDistance = distance; }
  });
  return best;
}

function colorDistance(left: [number, number, number], right: [number, number, number]) {
  return (left[0] - right[0]) ** 2 + (left[1] - right[1]) ** 2 + (left[2] - right[2]) ** 2;
}

function groupSimilarLogoClusters(
  centers: Array<[number, number, number]>,
  counts: number[],
  backgroundIndex: number
): { centers: Array<[number, number, number]>; counts: number[]; map: number[] } {
  const groups: Array<{ center: [number, number, number]; count: number; raw: number[] }> = [];
  const ordered = centers.map((center, index) => ({ center, index, count: counts[index] ?? 0 }))
    .sort((left, right) => {
      if (left.index === backgroundIndex) return -1;
      if (right.index === backgroundIndex) return 1;
      return right.count - left.count;
    });
  for (const item of ordered) {
    const target = groups.findIndex((group) => shouldMergeLogoCluster(item.center, group.center, item.index === backgroundIndex || group.raw.includes(backgroundIndex)));
    if (target >= 0) {
      const group = groups[target];
      const total = group.count + item.count;
      group.center = total > 0 ? [
        (group.center[0] * group.count + item.center[0] * item.count) / total,
        (group.center[1] * group.count + item.center[1] * item.count) / total,
        (group.center[2] * group.count + item.center[2] * item.count) / total
      ] : group.center;
      group.count = total;
      group.raw.push(item.index);
    } else {
      groups.push({ center: item.center, count: item.count, raw: [item.index] });
    }
  }
  const map = Array(centers.length).fill(0) as number[];
  groups.forEach((group, groupIndex) => group.raw.forEach((rawIndex) => { map[rawIndex] = groupIndex; }));
  return { centers: groups.map((group) => group.center), counts: groups.map((group) => group.count), map };
}

function shouldMergeLogoCluster(left: [number, number, number], right: [number, number, number], touchesBackground: boolean): boolean {
  if (colorDistance(left, right) < 900) return true;
  const leftHsl = rgbToHsl(left), rightHsl = rgbToHsl(right);
  const bothNeutral = leftHsl.s < 0.12 && rightHsl.s < 0.12;
  if (bothNeutral && Math.abs(leftHsl.l - rightHsl.l) < 0.18) return true;
  if (touchesBackground && bothNeutral) return Math.abs(leftHsl.l - rightHsl.l) < 0.28;
  if (leftHsl.s < 0.16 || rightHsl.s < 0.16) return false;
  const hueDelta = Math.min(Math.abs(leftHsl.h - rightHsl.h), 360 - Math.abs(leftHsl.h - rightHsl.h));
  return hueDelta < 18 && Math.abs(leftHsl.l - rightHsl.l) < 0.42;
}

function rgbToHsl([r, g, b]: [number, number, number]): { h: number; s: number; l: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const delta = max - min;
  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  const h = max === rn
    ? ((gn - bn) / delta + (gn < bn ? 6 : 0)) * 60
    : max === gn
      ? ((bn - rn) / delta + 2) * 60
      : ((rn - gn) / delta + 4) * 60;
  return { h, s, l };
}

function dominantCornerCluster(assignments: Int16Array, width: number, height: number, count: number): number {
  const votes = Array(count).fill(0) as number[];
  const inset = Math.max(1, Math.round(Math.min(width, height) * 0.04));
  const ranges = [
    [0, inset, 0, inset],
    [width - inset, width, 0, inset],
    [0, inset, height - inset, height],
    [width - inset, width, height - inset, height]
  ] as const;
  for (const [x0, x1, y0, y1] of ranges) {
    for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) {
      const assignment = assignments[y * width + x];
      if (assignment >= 0) votes[assignment] += 1;
    }
  }
  return votes.reduce((best, value, index) => value > votes[best] ? index : best, 0);
}

function cleanTraceMask(mask: boolean[], width: number, height: number, minArea: number, preserveThinStrokes = false): boolean[] {
  let cleaned = preserveThinStrokes ? mask.slice() : majorityFilter(mask, width, height);
  cleaned = removeSmallComponents(cleaned, width, height, minArea);
  return preserveThinStrokes ? cleaned : majorityFilter(cleaned, width, height);
}

function majorityFilter(mask: boolean[], width: number, height: number): boolean[] {
  const output = mask.slice();
  for (let y = 1; y < height - 1; y += 1) for (let x = 1; x < width - 1; x += 1) {
    let filled = 0;
    for (let oy = -1; oy <= 1; oy += 1) for (let ox = -1; ox <= 1; ox += 1) {
      if (mask[(y + oy) * width + x + ox]) filled += 1;
    }
    if (filled >= 6) output[y * width + x] = true;
    else if (filled <= 2) output[y * width + x] = false;
  }
  return output;
}

function removeSmallComponents(mask: boolean[], width: number, height: number, minArea: number): boolean[] {
  return filterTraceComponentsByArea(mask, width, height, { minArea });
}

function filterTraceComponentsByArea(
  mask: boolean[],
  width: number,
  height: number,
  limits: { minArea: number; maxArea?: number }
): boolean[] {
  const output = mask.slice();
  const seen = new Uint8Array(mask.length);
  const queue: number[] = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    const component: number[] = [];
    seen[start] = 1; queue.push(start);
    while (queue.length) {
      const current = queue.pop() as number;
      component.push(current);
      const x = current % width, y = Math.floor(current / width);
      const neighbors = [
        x > 0 ? current - 1 : -1,
        x < width - 1 ? current + 1 : -1,
        y > 0 ? current - width : -1,
        y < height - 1 ? current + width : -1
      ];
      for (const neighbor of neighbors) {
        if (neighbor >= 0 && mask[neighbor] && !seen[neighbor]) {
          seen[neighbor] = 1; queue.push(neighbor);
        }
      }
    }
    if (component.length < limits.minArea || (limits.maxArea !== undefined && component.length > limits.maxArea)) {
      component.forEach((index) => { output[index] = false; });
    }
  }
  return output;
}

function traceMaskToSvgPath(mask: boolean[], width: number, height: number, smoothing: number): string {
  if (!mask.some(Boolean)) return "";
  const geometry = contours().size([width, height]).smooth(true).thresholds([0.5])(mask.map(Number))[0];
  if (!geometry?.coordinates.length) return "";
  const parts: string[] = [];
  for (const polygon of geometry.coordinates) {
    for (const ring of polygon) {
      const points = smoothVectorRing(ring as Array<[number, number]>, smoothing);
      if (points.length < 3) continue;
      parts.push(`M${points.map(([x, y]) => `${roundPathNumber(x)},${roundPathNumber(y)}`).join("L")}Z`);
    }
  }
  return parts.join("");
}

function svgPathSamplePoints(resolution: number): number {
  // SVGLoader.createShapes gibt analytische Kurven zurück; getPoints wird nur
  // für Flächen-, Bounds- und Artefaktprüfung genutzt. Bei automatischer
  // Exportreduzierung muss dieser Wert mitfallen, sonst bleiben große SVGs
  // trotz niedrigerer App-Auflösung über dem 250k-Limit.
  return Math.max(12, Math.min(48, Math.round(resolution / 8)));
}

function svgCurveSegments(resolution: number): number {
  // Der wichtigste Dreieckshebel für Logo/Text-SVGs. 512 bleibt hochwertig,
  // reduzierte Durchläufe werden aber wirklich kleiner und erreichen die
  // Exportgrenze zuverlässig.
  return Math.max(6, Math.min(28, Math.round(resolution / 18)));
}

function roundPathNumber(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("")}`;
}
