import { mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import JSZip from "jszip";
import sharp from "sharp";

export type ReliefOptions = {
  widthMm: number;
  baseMm: number;
  reliefMm: number;
  resolution: number;
  invert: boolean;
  profile: "fast" | "balanced" | "fine" | "photo" | "logo";
  smoothing: number;
  detail: number;
  processingMode: "auto" | "vector" | "depth" | "height";
  sourceColors: string[];
  colors: string[];
  sideColorIndex: number;
};

export type PrintabilityReport = {
  score: number;
  status: "ready" | "warning" | "critical";
  issues: string[];
  estimatedVolumeCm3: number;
  checks: Array<{ label: string; status: "ok" | "warning" | "error"; detail: string }>;
};

export type ReliefResult = {
  stlPath: string;
  threeMfPath: string;
  vertexCount: number;
  triangleCount: number;
  widthMm: number;
  heightMm: number;
  options: ReliefOptions;
  printability: PrintabilityReport;
  heightmapDataUrl: string;
  preview: {
    positions: number[];
    indices: number[];
    colorParts: Array<{ color: string; indices: number[] }>;
  };
};

type Vec3 = readonly [number, number, number];
type Triangle = readonly [number, number, number];
type Mesh = { vertices: Vec3[]; triangles: Triangle[] };
type ColoredMesh = { mesh: Mesh; color: string; name: string };

const safeDefaults: ReliefOptions = {
  widthMm: 100,
  baseMm: 1.6,
  reliefMm: 4,
  resolution: 256,
  invert: false,
  profile: "balanced",
  smoothing: 2,
  detail: 1
  ,processingMode: "auto",
  sourceColors: [],
  colors: [],
  sideColorIndex: 0
};

export async function createRelief(
  imagePath: string,
  outputDirectory: string,
  requested: Partial<ReliefOptions> = {},
  depthMapPath?: string,
  editorHeightmap = false,
  editorColorMapPath?: string
): Promise<ReliefResult> {
  const options = validateOptions({ ...safeDefaults, ...requested });
  const metadata = await sharp(imagePath).metadata();
  if (!metadata.width || !metadata.height) throw new Error("Das Bild besitzt keine gültigen Abmessungen.");

  const aspect = metadata.height / metadata.width;
  const gridWidth = options.resolution;
  const gridHeight = Math.max(16, Math.round(options.resolution * aspect));
  const prepared = sharp(imagePath)
    .rotate()
    .resize(gridWidth, gridHeight, { fit: "fill" })
    .ensureAlpha();
  const { data: rgba } = await prepared.clone()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rawSubjectPixels = buildSubjectPixelMask(rgba, gridWidth, gridHeight);
  const hasTransparency = hasUsefulTransparency(rgba);
  const subjectPixels = hasTransparency ? rawSubjectPixels : cleanSubjectPixelMask(rawSubjectPixels, gridWidth, gridHeight);
  const cellMask = buildCellMask(subjectPixels, gridWidth, gridHeight, hasTransparency ? 1 : 2);
  const heightMm = options.widthMm * gridHeight / gridWidth;
  const profile = profileSettings(options.profile);
  const activeMode = options.processingMode === "auto"
    ? (options.profile === "logo" ? "vector" : "height")
    : options.processingMode;
  let rawLevels: number[];
  if (activeMode === "vector") {
    rawLevels = buildVectorLevels(rgba, subjectPixels, gridWidth, gridHeight, options.invert);
  } else if (editorHeightmap && depthMapPath) {
    const { data } = await sharp(depthMapPath)
      .resize(gridWidth, gridHeight, { fit: "fill" })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    rawLevels = Array.from(data, (value) => value / 255);
  } else {
    const source = depthMapPath ? sharp(depthMapPath) : prepared.clone().flatten({ background: "#ffffff" }).grayscale();
    const { data } = await source
      .resize(gridWidth, gridHeight, { fit: "fill" })
      .blur(profile.inputBlur)
      .normalize({ lower: 1, upper: 99 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    rawLevels = Array.from(data, (value) => {
      const luminance = value / 255;
      const normalized = options.invert ? luminance : 1 - luminance;
      return Math.max(0, Math.min(1, (Math.pow(normalized, profile.gamma) - 0.5) * profile.contrast + 0.5));
    });
  }
  let flatVectorSurface = false;
  if (activeMode === "vector") {
    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;
    let maximumChroma = 0;
    for (let index = 0; index < rawLevels.length; index += 1) {
      if (!subjectPixels[index]) continue;
      minimum = Math.min(minimum, rawLevels[index]);
      maximum = Math.max(maximum, rawLevels[index]);
      const offset = index * 4;
      maximumChroma = Math.max(
        maximumChroma,
        Math.abs(rgba[offset] - rgba[offset + 1]),
        Math.abs(rgba[offset + 1] - rgba[offset + 2]),
        Math.abs(rgba[offset] - rgba[offset + 2])
      );
    }
    // Weiße, lokal gerenderte Schrift bekommt beim Skalieren halbtransparente
    // graue Randpixel. Diese sind Kantenglättung, keine semantischen Farbebenen.
    flatVectorSurface = Number.isFinite(minimum)
      && (maximum - minimum < 0.001 || (hasTransparency && maximumChroma <= 8));
  }
  const smoothed = editorHeightmap ? rawLevels : smoothHeightField(rawLevels, gridWidth, gridHeight, activeMode === "vector" ? Math.min(1, options.smoothing) : options.smoothing);
  const detailed = editorHeightmap ? smoothed : smoothed.map((value, index) =>
    Math.max(0, Math.min(1, value + (rawLevels[index] - value) * options.detail * profile.detail))
  );
  const profiledLevels = !editorHeightmap && profile.steps ? detailed.map((value) => Math.round(value * profile.steps) / profile.steps) : detailed;
  // Eine flache Konturzone verhindert, dass antialiaste Randpixel als hohe,
  // sägezahnartige Außenwand im Mesh erscheinen.
  const levels = flatVectorSurface
    ? profiledLevels
    : applyBoundaryRim(profiledLevels, subjectPixels, gridWidth, gridHeight, options.profile === "logo" ? 2 : 1);
  const heights = levels.map((value) => options.baseMm + value * options.reliefMm);
  if (flatVectorSurface) {
    const flatHeight = options.baseMm + options.reliefMm;
    for (let y = 0; y < gridHeight - 1; y += 1) {
      for (let x = 0; x < gridWidth - 1; x += 1) {
        if (!cellMask[y * (gridWidth - 1) + x]) continue;
        const topLeft = y * gridWidth + x;
        heights[topLeft] = flatHeight;
        heights[topLeft + 1] = flatHeight;
        heights[topLeft + gridWidth] = flatHeight;
        heights[topLeft + gridWidth + 1] = flatHeight;
      }
    }
  }
  const mesh = buildWatertightHeightMesh(gridWidth, gridHeight, options.widthMm, heightMm, heights, cellMask);
  let editorColorAssignments: Buffer | undefined;
  if (editorColorMapPath) {
    const { data } = await sharp(editorColorMapPath)
      .resize(gridWidth, gridHeight, { fit: "fill", kernel: "nearest" })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    editorColorAssignments = data;
  }
  const detectedColorAssignments = options.colors.length
    ? buildColorCellAssignments(
      rgba, cellMask, gridWidth, gridHeight,
      options.sourceColors.length === options.colors.length ? options.sourceColors : options.colors,
      editorColorAssignments
    )
    : undefined;
  const colorAssignments = detectedColorAssignments
    ? enforceUniformEdgeColor(detectedColorAssignments, cellMask, gridWidth, gridHeight, options.sideColorIndex)
    : undefined;
  const preview = buildPreviewSurface(
    gridWidth, gridHeight, options.widthMm, heightMm, heights, cellMask,
    colorAssignments, options.colors, options.sideColorIndex, flatVectorSurface
  );
  const printability = analysePrintability(mesh, heights, options, cellMask, gridWidth);
  const heightmapPng = await sharp(Buffer.from(levels.map((value) => Math.round(value * 255))), {
    raw: { width: gridWidth, height: gridHeight, channels: 1 }
  }).png().toBuffer();

  await mkdir(outputDirectory, { recursive: true });
  const stem = sanitizeStem(basename(imagePath, extname(imagePath)));
  const stlPath = join(outputDirectory, `${stem}-relief.stl`);
  const threeMfPath = join(outputDirectory, `${stem}-relief.3mf`);
  const coloredMeshes = colorAssignments
    ? buildColoredMeshes(
      gridWidth, gridHeight, options.widthMm, heightMm, heights, cellMask,
      colorAssignments, options.colors, options.sideColorIndex
    )
    : undefined;
  await Promise.all([
    writeFile(stlPath, encodeBinaryStl(mesh, "AI Print Studio Relief")),
    writeFile(threeMfPath, await encodeThreeMf(mesh, coloredMeshes))
  ]);

  return {
    stlPath,
    threeMfPath,
    vertexCount: mesh.vertices.length,
    triangleCount: mesh.triangles.length,
    widthMm: options.widthMm,
    heightMm,
    options,
    printability,
    heightmapDataUrl: `data:image/png;base64,${heightmapPng.toString("base64")}`,
    preview
  };
}

function validateOptions(options: ReliefOptions): ReliefOptions {
  if (options.widthMm < 20 || options.widthMm > 300) throw new Error("Die Breite muss zwischen 20 und 300 mm liegen.");
  if (options.baseMm < 0.8 || options.baseMm > 10) throw new Error("Die Grundplatte muss zwischen 0,8 und 10 mm liegen.");
  if (options.reliefMm < 0.5 || options.reliefMm > 20) throw new Error("Die Reliefhöhe muss zwischen 0,5 und 20 mm liegen.");
  if (options.resolution < 32 || options.resolution > 512) throw new Error("Die Auflösung muss zwischen 32 und 512 liegen.");
  if (!["fast", "balanced", "fine", "photo", "logo"].includes(options.profile)) throw new Error("Unbekanntes Qualitätsprofil.");
  if (options.smoothing < 0 || options.smoothing > 5) throw new Error("Die Glättung muss zwischen 0 und 5 liegen.");
  if (options.detail < 0 || options.detail > 2) throw new Error("Die Detailstärke muss zwischen 0 und 2 liegen.");
  if (!["auto", "vector", "depth", "height"].includes(options.processingMode)) throw new Error("Unbekannter Verarbeitungsmodus.");
  if (!Array.isArray(options.colors) || options.colors.length > 16 || options.colors.some((color) => !/^#[0-9a-fA-F]{6}$/.test(color))) {
    throw new Error("Die Farbpalette enthält ungültige Farben.");
  }
  if (!Array.isArray(options.sourceColors) || options.sourceColors.length > 16 || options.sourceColors.some((color) => !/^#[0-9a-fA-F]{6}$/.test(color))) {
    throw new Error("Die erkannte Bildpalette enthält ungültige Farben.");
  }
  if (!Number.isInteger(options.sideColorIndex) || options.sideColorIndex < 0 || (options.colors.length && options.sideColorIndex >= options.colors.length)) {
    throw new Error("Die gewählte Seitenfarbe ist ungültig.");
  }
  return options;
}

function buildVectorLevels(rgba: Buffer, mask: boolean[], width: number, height: number, invert: boolean): number[] {
  const pixels: Array<[number, number, number]> = [];
  const sampleStep = Math.max(1, Math.floor((width * height) / 8_000));
  for (let index = 0; index < mask.length; index += sampleStep) {
    if (mask[index]) pixels.push([rgba[index * 4], rgba[index * 4 + 1], rgba[index * 4 + 2]]);
  }
  const quantizedColors = new Set(pixels.map(([r, g, b]) => `${r >> 5}:${g >> 5}:${b >> 5}`));
  // Einfarbige transparente Motive wie gerenderte Schrift benötigen keine
  // semantischen Farbebenen. Eine konstante Höhe verhindert, dass einzelne
  // Buchstabenenden als höhere Spitzen rekonstruiert werden.
  if (quantizedColors.size <= 1) return mask.map((occupied) => occupied ? 1 : 0);
  const clusterCount = Math.max(2, Math.min(6, quantizedColors.size));
  let centers = Array.from({ length: clusterCount }, (_, index) => {
    const source = pixels[Math.min(pixels.length - 1, Math.floor(index * pixels.length / clusterCount))] ?? [255, 255, 255];
    return [...source] as [number, number, number];
  });
  const assignments = new Int16Array(mask.length);
  for (let iteration = 0; iteration < 7; iteration += 1) {
    const sums = Array.from({ length: clusterCount }, () => [0, 0, 0, 0]);
    for (let index = 0; index < mask.length; index += 1) {
      if (!mask[index]) continue;
      const offset = index * 4, r = rgba[offset], g = rgba[offset + 1], b = rgba[offset + 2];
      let best = 0, bestDistance = Number.POSITIVE_INFINITY;
      centers.forEach((center, candidate) => {
        const distance = (r - center[0]) ** 2 + (g - center[1]) ** 2 + (b - center[2]) ** 2;
        if (distance < bestDistance) { best = candidate; bestDistance = distance; }
      });
      assignments[index] = best;
      sums[best][0] += r; sums[best][1] += g; sums[best][2] += b; sums[best][3] += 1;
    }
    centers = centers.map((center, index) => sums[index][3]
      ? [sums[index][0] / sums[index][3], sums[index][1] / sums[index][3], sums[index][2] / sums[index][3]]
      : center) as Array<[number, number, number]>;
  }
  const cleaned = assignments.slice();
  for (let y = 1; y < height - 1; y += 1) for (let x = 1; x < width - 1; x += 1) {
    const index = y * width + x;
    if (!mask[index]) continue;
    const counts = new Map<number, number>();
    for (let oy = -1; oy <= 1; oy += 1) for (let ox = -1; ox <= 1; ox += 1) {
      const cluster = assignments[(y + oy) * width + x + ox];
      counts.set(cluster, (counts.get(cluster) ?? 0) + 1);
    }
    const majority = [...counts].sort((a, b) => b[1] - a[1])[0];
    if (majority[1] >= 6) cleaned[index] = majority[0];
  }
  const luminances = centers.map(([r, g, b], index) => ({ index, value: 0.2126 * r + 0.7152 * g + 0.0722 * b }))
    .sort((a, b) => a.value - b.value);
  const levels = new Map(luminances.map((entry, rank) => [entry.index, rank / Math.max(1, clusterCount - 1)]));
  const colorLevels = Array.from({ length: mask.length }, (_, index) => {
    if (!mask[index]) return 0;
    const level = levels.get(cleaned[index]) ?? 0;
    return invert ? level : 1 - level;
  });
  const dark = mask.map((occupied, index) => {
    if (!occupied) return false;
    const offset = index * 4;
    return Math.max(rgba[offset], rgba[offset + 1], rgba[offset + 2]) < 125;
  });
  const visited = new Uint8Array(mask.length);
  const components: number[][] = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || dark[start] || visited[start]) continue;
    const component: number[] = [];
    const queue = [start];
    visited[start] = 1;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor], x = index % width, y = Math.floor(index / width);
      component.push(index);
      for (const neighbor of [
        x > 0 ? index - 1 : -1,
        x + 1 < width ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y + 1 < height ? index + width : -1
      ]) {
        if (neighbor >= 0 && mask[neighbor] && !dark[neighbor] && !visited[neighbor]) {
          visited[neighbor] = 1; queue.push(neighbor);
        }
      }
    }
    components.push(component);
  }
  if (components.length < 3) return colorLevels;
  const subjectArea = Math.max(1, mask.filter(Boolean).length);
  const semanticLevels: number[] = mask.map((occupied, index) => occupied && dark[index] ? 0.82 : 0);
  for (const component of components) {
    const ratio = component.length / subjectArea;
    const level = ratio > 0.08 ? 0.12 : ratio > 0.006 ? 0.68 : ratio > 0.00015 ? 0.92 : 0.76;
    for (const index of component) semanticLevels[index] = level;
  }
  return semanticLevels;
}

function buildSmoothedBoundaryPositions(
  columns: number,
  rows: number,
  widthMm: number,
  heightMm: number,
  cells: boolean[],
  passes = 8
): Map<number, readonly [number, number]> {
  const cellAt = (x: number, y: number) => x >= 0 && y >= 0 && x < columns - 1 && y < rows - 1 && cells[y * (columns - 1) + x];
  const gridIndex = (x: number, y: number) => y * columns + x;
  const neighbors = new Map<number, Set<number>>();
  const connect = (a: number, b: number) => {
    if (!neighbors.has(a)) neighbors.set(a, new Set());
    if (!neighbors.has(b)) neighbors.set(b, new Set());
    neighbors.get(a)?.add(b); neighbors.get(b)?.add(a);
  };
  for (let y = 0; y < rows - 1; y += 1) for (let x = 0; x < columns - 1; x += 1) {
    if (!cellAt(x, y)) continue;
    const a = gridIndex(x, y), b = gridIndex(x + 1, y), c = gridIndex(x, y + 1), d = gridIndex(x + 1, y + 1);
    if (!cellAt(x, y - 1)) connect(a, b);
    if (!cellAt(x + 1, y)) connect(b, d);
    if (!cellAt(x, y + 1)) connect(d, c);
    if (!cellAt(x - 1, y)) connect(c, a);
  }
  let positions = new Map<number, readonly [number, number]>();
  for (const index of neighbors.keys()) {
    const x = index % columns, y = Math.floor(index / columns);
    positions.set(index, [x * widthMm / (columns - 1), y * heightMm / (rows - 1)]);
  }
  for (let pass = 0; pass < passes; pass += 1) {
    const next = new Map(positions);
    for (const [index, adjacent] of neighbors) {
      const current = positions.get(index);
      if (!current || adjacent.size < 2) continue;
      const points = [...adjacent].map((neighbor) => positions.get(neighbor)).filter(Boolean) as Array<readonly [number, number]>;
      if (!points.length) continue;
      const averageX = points.reduce((sum, point) => sum + point[0], 0) / points.length;
      const averageY = points.reduce((sum, point) => sum + point[1], 0) / points.length;
      next.set(index, [current[0] * 0.55 + averageX * 0.45, current[1] * 0.55 + averageY * 0.45]);
    }
    positions = next;
  }
  return positions;
}

function profileSettings(profile: ReliefOptions["profile"]) {
  return {
    fast: { inputBlur: 0.3, gamma: 1, contrast: 1.12, detail: 0.5, steps: 24 },
    balanced: { inputBlur: 0.45, gamma: 0.95, contrast: 1.16, detail: 0.8, steps: 48 },
    fine: { inputBlur: 0.35, gamma: 0.92, contrast: 1.12, detail: 1.1, steps: 0 },
    photo: { inputBlur: 0.7, gamma: 0.82, contrast: 1.02, detail: 0.45, steps: 0 },
    logo: { inputBlur: 0.3, gamma: 1, contrast: 1.35, detail: 1.25, steps: 16 }
  }[profile];
}

function smoothHeightField(values: number[], width: number, height: number, passes: number): number[] {
  let current = values.slice();
  for (let pass = 0; pass < passes; pass += 1) {
    const next = current.slice();
    for (let y = 1; y < height - 1; y += 1) for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const center = current[i];
      let sum = center * 4, weight = 4;
      for (const neighbor of [i - 1, i + 1, i - width, i + width]) {
        const edgeWeight = Math.abs(current[neighbor] - center) < 0.12 ? 1 : 0.15;
        sum += current[neighbor] * edgeWeight; weight += edgeWeight;
      }
      next[i] = sum / weight;
    }
    current = next;
  }
  return current;
}

function analysePrintability(mesh: Mesh, heights: number[], options: ReliefOptions, cellMask: boolean[], columns: number): PrintabilityReport {
  const issues: string[] = [];
  const checks: PrintabilityReport["checks"] = [];
  let score = 100;
  if (options.baseMm < 1.2) {
    issues.push("Grundplatte dünner als 1,2 mm."); score -= 25;
    checks.push({ label: "Grundplatte", status: "error", detail: `${options.baseMm.toFixed(1)} mm – mindestens 1,2 mm empfohlen.` });
  } else checks.push({ label: "Grundplatte", status: "ok", detail: `${options.baseMm.toFixed(1)} mm sind stabil.` });
  const pixelMm = options.widthMm / Math.max(1, columns - 1);
  let steepEdges = 0;
  for (let i = 1; i < heights.length; i += 1) {
    if (i % columns !== 0 && Math.abs(heights[i] - heights[i - 1]) / pixelMm > 2) steepEdges += 1;
  }
  if (steepEdges / Math.max(1, heights.length) > 0.08) {
    issues.push("Viele steile Übergänge können Details unsauber drucken."); score -= 20;
    checks.push({ label: "Übergänge", status: "warning", detail: "Viele sehr steile Höhenwechsel erkannt." });
  } else checks.push({ label: "Übergänge", status: "ok", detail: "Höhenwechsel sind druckfreundlich." });
  if (mesh.triangles.length > 800_000) { issues.push("Sehr großes Mesh – der Slicer kann länger benötigen."); score -= 5; }
  if (cellMask.filter(Boolean).length < 4) { issues.push("Das erkannte Motiv ist zu klein oder unvollständig."); score -= 45; }
  const components = countCellComponents(cellMask, columns - 1);
  if (components > 12) {
    issues.push(`${components} getrennte Kleinteile erkannt – einzelne Buchstaben könnten verloren gehen.`);
    score -= Math.min(20, components - 10);
    checks.push({ label: "Zusammenhalt", status: "warning", detail: `${components} getrennte Bereiche erkannt.` });
  } else checks.push({ label: "Zusammenhalt", status: "ok", detail: `${components} zusammenhängende Objektbereiche.` });
  const narrowCells = countNarrowCells(cellMask, columns - 1);
  const narrowWidthMm = pixelMm * 2;
  if (narrowCells > 0 && narrowWidthMm < 0.8) {
    issues.push(`Feine Stege sind nur etwa ${narrowWidthMm.toFixed(1)} mm breit; für eine 0,4-mm-Düse sind mindestens 0,8 mm besser.`);
    score -= 15;
    checks.push({ label: "Mindestbreite", status: "warning", detail: `Schmalste Bereiche ca. ${narrowWidthMm.toFixed(1)} mm.` });
  } else checks.push({ label: "Mindestbreite", status: "ok", detail: "Keine kritisch dünnen Stege erkannt." });
  const areaMm2 = cellMask.filter(Boolean).length * pixelMm * pixelMm;
  const averageHeight = heights.reduce((sum, height) => sum + height, 0) / Math.max(1, heights.length);
  const boundedScore = Math.max(0, score);
  return {
    score: boundedScore,
    status: boundedScore >= 80 ? "ready" : boundedScore >= 55 ? "warning" : "critical",
    issues: issues.length ? issues : ["Keine offensichtlichen Druckprobleme erkannt."],
    estimatedVolumeCm3: areaMm2 * averageHeight / 1000,
    checks
  };
}

function countCellComponents(mask: boolean[], width: number): number {
  const height = Math.ceil(mask.length / width);
  const seen = new Uint8Array(mask.length);
  let count = 0;
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    count += 1; seen[start] = 1;
    const queue = [start];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor], x = index % width, y = Math.floor(index / width);
      for (const neighbor of [x > 0 ? index - 1 : -1, x + 1 < width ? index + 1 : -1, y > 0 ? index - width : -1, y + 1 < height ? index + width : -1]) {
        if (neighbor >= 0 && mask[neighbor] && !seen[neighbor]) { seen[neighbor] = 1; queue.push(neighbor); }
      }
    }
  }
  return count;
}

function countNarrowCells(mask: boolean[], width: number): number {
  const height = Math.ceil(mask.length / width);
  let count = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    const x = index % width, y = Math.floor(index / width);
    const horizontal = (x > 0 && mask[index - 1]) || (x + 1 < width && mask[index + 1]);
    const vertical = (y > 0 && mask[index - width]) || (y + 1 < height && mask[index + width]);
    if (!horizontal || !vertical) count += 1;
  }
  return count;
}

function buildWatertightHeightMesh(
  columns: number,
  rows: number,
  widthMm: number,
  heightMm: number,
  heights: number[],
  cellMask?: boolean[],
  bottomHeight: number | number[] = 0,
  boundaryPositionsOverride?: Map<number, readonly [number, number]>
): Mesh {
  const vertices: Vec3[] = [];
  const triangles: Triangle[] = [];
  const index = (x: number, y: number) => y * columns + x;
  const cells = cellMask ?? Array((columns - 1) * (rows - 1)).fill(true);
  const boundaryPositions = boundaryPositionsOverride ?? buildSmoothedBoundaryPositions(columns, rows, widthMm, heightMm, cells);
  const isCell = (x: number, y: number) => x >= 0 && y >= 0 && x < columns - 1 && y < rows - 1 && cells[y * (columns - 1) + x];
  const topVertices = new Map<number, number>();
  const bottomVertices = new Map<number, number>();
  const vertexFor = (gridIndex: number, bottom: boolean) => {
    const map = bottom ? bottomVertices : topVertices;
    const existing = map.get(gridIndex);
    if (existing !== undefined) return existing;
    const x = gridIndex % columns, y = Math.floor(gridIndex / columns);
    const created = vertices.length;
    const boundary = boundaryPositions.get(gridIndex);
    vertices.push([
      boundary?.[0] ?? x * widthMm / (columns - 1),
      boundary?.[1] ?? y * heightMm / (rows - 1),
      bottom ? (Array.isArray(bottomHeight) ? bottomHeight[gridIndex] : bottomHeight) : heights[gridIndex]
    ]);
    map.set(gridIndex, created);
    return created;
  };
  const addWall = (gridA: number, gridB: number) => {
    const topA = vertexFor(gridA, false), topB = vertexFor(gridB, false);
    const bottomA = vertexFor(gridA, true), bottomB = vertexFor(gridB, true);
    triangles.push([topA, bottomB, topB], [topA, bottomA, bottomB]);
  };

  for (let y = 0; y < rows - 1; y += 1) {
    for (let x = 0; x < columns - 1; x += 1) {
      if (!isCell(x, y)) continue;
      const ga = index(x, y), gb = index(x + 1, y), gc = index(x, y + 1), gd = index(x + 1, y + 1);
      const a = vertexFor(ga, false), b = vertexFor(gb, false), c = vertexFor(gc, false), d = vertexFor(gd, false);
      const ba = vertexFor(ga, true), bb = vertexFor(gb, true), bc = vertexFor(gc, true), bd = vertexFor(gd, true);
      triangles.push([a, b, d], [a, d, c], [ba, bd, bb], [ba, bc, bd]);
      if (!isCell(x, y - 1)) addWall(ga, gb);
      if (!isCell(x + 1, y)) addWall(gb, gd);
      if (!isCell(x, y + 1)) addWall(gd, gc);
      if (!isCell(x - 1, y)) addWall(gc, ga);
    }
  }
  return { vertices, triangles };
}

function parseHexColor(color: string): readonly [number, number, number] {
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16)
  ];
}

function buildColorCellAssignments(
  rgba: Buffer,
  cellMask: boolean[],
  width: number,
  height: number,
  colors: string[],
  editorAssignments?: Buffer
): number[] {
  const palette = colors.map(parseHexColor);
  return Array.from({ length: (width - 1) * (height - 1) }, (_, cell) => {
    if (!cellMask[cell]) return -1;
    const x = cell % (width - 1), y = Math.floor(cell / (width - 1));
    if (editorAssignments) {
      const samples = [y * width + x, y * width + x + 1, (y + 1) * width + x, (y + 1) * width + x + 1];
      const explicit = samples.map((sample) => editorAssignments[sample]).filter((value) => value < colors.length);
      if (explicit.length) return explicit.sort((a, b) =>
        explicit.filter((value) => value === b).length - explicit.filter((value) => value === a).length
      )[0];
    }
    const pixel = y * width + x;
    let red = 0, green = 0, blue = 0, weight = 0;
    for (const sample of [pixel, pixel + 1, pixel + width, pixel + width + 1]) {
      const alpha = rgba[sample * 4 + 3] / 255;
      red += rgba[sample * 4] * alpha;
      green += rgba[sample * 4 + 1] * alpha;
      blue += rgba[sample * 4 + 2] * alpha;
      weight += alpha;
    }
    if (weight > 0) { red /= weight; green /= weight; blue /= weight; }
    let best = 0, bestDistance = Number.POSITIVE_INFINITY;
    palette.forEach(([r, g, b], index) => {
      const distance = (red - r) ** 2 + (green - g) ** 2 + (blue - b) ** 2;
      if (distance < bestDistance) { best = index; bestDistance = distance; }
    });
    return best;
  });
}

function enforceUniformEdgeColor(
  assignments: number[],
  cellMask: boolean[],
  columns: number,
  rows: number,
  sideColorIndex: number
): number[] {
  const cellColumns = columns - 1, cellRows = rows - 1;
  if (cellColumns < 4 || cellRows < 4) return assignments.slice();
  const original = assignments.slice();
  const result = assignments.slice();
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= cellColumns || y >= cellRows ? -1 : original[y * cellColumns + x];
  for (let y = 0; y < cellRows; y += 1) {
    for (let x = 0; x < cellColumns; x += 1) {
      const index = y * cellColumns + x;
      const color = original[index];
      if (!cellMask[index] || color < 0 || color === sideColorIndex) continue;
      const neighbors = [
        at(x - 1, y - 1), at(x, y - 1), at(x + 1, y - 1),
        at(x - 1, y),                       at(x + 1, y),
        at(x - 1, y + 1), at(x, y + 1), at(x + 1, y + 1)
      ];
      if (neighbors.some((neighbor) => neighbor !== color)) result[index] = sideColorIndex;
    }
  }
  return result;
}

function mergeMeshes(meshes: Mesh[]): Mesh {
  const vertices: Vec3[] = [];
  const triangles: Triangle[] = [];
  for (const mesh of meshes) {
    const offset = vertices.length;
    for (const vertex of mesh.vertices) vertices.push(vertex);
    for (const [a, b, c] of mesh.triangles) triangles.push([a + offset, b + offset, c + offset]);
  }
  return { vertices, triangles };
}

function buildColoredMeshes(
  columns: number,
  rows: number,
  widthMm: number,
  heightMm: number,
  heights: number[],
  cellMask: boolean[],
  assignments: number[],
  colors: string[],
  sideColorIndex: number
): ColoredMesh[] {
  const outerBoundary = buildSmoothedBoundaryPositions(columns, rows, widthMm, heightMm, cellMask);
  // Zwei typische 0,2-mm-Schichten sind in allen gängigen Slicern als
  // druckbarer Körper erkennbar. Die frühere 0,04-mm-Haut wurde von Anycubic
  // als vermutlich falsch skalierte Datei bewertet.
  const colorSkinMm = 0.4;
  const structureHeights = heights.slice();
  const structure = buildWatertightHeightMesh(
    columns, rows, widthMm, heightMm, structureHeights, cellMask, 0, outerBoundary
  );
  return colors.map((color, colorIndex) => {
    const mask = assignments.map((assignment) => assignment === colorIndex);
    const capHeights = heights.map((height) => height + colorSkinMm);
    const top = buildWatertightHeightMesh(columns, rows, widthMm, heightMm, capHeights, mask, structureHeights, outerBoundary);
    return {
      mesh: colorIndex === sideColorIndex ? mergeMeshes([structure, top]) : top,
      color,
      name: `AMS ${colorIndex + 1}`
    };
  }).filter(({ mesh }) => mesh.triangles.length > 0);
}

function buildSubjectPixelMask(rgba: Buffer, width: number, height: number): boolean[] {
  const pixelCount = width * height;
  let hasTransparency = false;
  for (let i = 0; i < pixelCount; i += 1) {
    if (rgba[i * 4 + 3] < 245) { hasTransparency = true; break; }
  }
  if (hasTransparency) {
    return Array.from({ length: pixelCount }, (_, i) => rgba[i * 4 + 3] >= 64);
  }

  const corners = [0, width - 1, (height - 1) * width, pixelCount - 1];
  const background = [0, 1, 2].map((channel) =>
    corners.reduce((sum, pixel) => sum + rgba[pixel * 4 + channel], 0) / corners.length
  );
  const closeToBackground = (pixel: number) => {
    const offset = pixel * 4;
    return Math.hypot(
      rgba[offset] - background[0],
      rgba[offset + 1] - background[1],
      rgba[offset + 2] - background[2]
    ) < 52;
  };
  const outside = new Uint8Array(pixelCount);
  const queue: number[] = [];
  const enqueue = (pixel: number) => {
    if (!outside[pixel] && closeToBackground(pixel)) {
      outside[pixel] = 1;
      queue.push(pixel);
    }
  };
  for (let x = 0; x < width; x += 1) { enqueue(x); enqueue((height - 1) * width + x); }
  for (let y = 0; y < height; y += 1) { enqueue(y * width); enqueue(y * width + width - 1); }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const pixel = queue[cursor], x = pixel % width, y = Math.floor(pixel / width);
    if (x > 0) enqueue(pixel - 1);
    if (x + 1 < width) enqueue(pixel + 1);
    if (y > 0) enqueue(pixel - width);
    if (y + 1 < height) enqueue(pixel + width);
  }
  return Array.from({ length: pixelCount }, (_, i) => outside[i] === 0);
}

function buildCellMask(pixels: boolean[], columns: number, rows: number, threshold = 2): boolean[] {
  const cells: boolean[] = [];
  for (let y = 0; y < rows - 1; y += 1) {
    for (let x = 0; x < columns - 1; x += 1) {
      const a = y * columns + x;
      const occupied = Number(pixels[a]) + Number(pixels[a + 1]) + Number(pixels[a + columns]) + Number(pixels[a + columns + 1]);
      cells.push(occupied >= threshold);
    }
  }
  return cells;
}

function hasUsefulTransparency(rgba: Buffer): boolean {
  let transparent = 0;
  for (let index = 0; index < rgba.length; index += 4) if (rgba[index + 3] < 245) transparent += 1;
  return transparent > rgba.length / 4 * 0.01;
}

function cleanSubjectPixelMask(pixels: boolean[], width: number, height: number): boolean[] {
  let current = pixels.slice();
  for (let pass = 0; pass < 2; pass += 1) {
    const next = current.slice();
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let occupied = 0;
        for (let oy = -1; oy <= 1; oy += 1) for (let ox = -1; ox <= 1; ox += 1) {
          const nx = x + ox, ny = y + oy;
          if (nx >= 0 && ny >= 0 && nx < width && ny < height && current[ny * width + nx]) occupied += 1;
        }
        next[y * width + x] = occupied >= 5;
      }
    }
    current = next;
  }
  return current;
}

function applyBoundaryRim(levels: number[], mask: boolean[], width: number, height: number, radius: number): number[] {
  const next = levels.slice();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!mask[index]) { next[index] = 0; continue; }
      let boundary = false;
      for (let oy = -radius; oy <= radius && !boundary; oy += 1) {
        for (let ox = -radius; ox <= radius; ox += 1) {
          const nx = x + ox, ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height || !mask[ny * width + nx]) {
            boundary = true; break;
          }
        }
      }
      if (boundary) next[index] = 0;
    }
  }
  return next;
}

function encodeBinaryStl(mesh: Mesh, title: string): Buffer {
  const buffer = Buffer.alloc(84 + mesh.triangles.length * 50);
  buffer.write(title.slice(0, 80), 0, "ascii");
  buffer.writeUInt32LE(mesh.triangles.length, 80);
  let offset = 84;
  for (const triangle of mesh.triangles) {
    const a = mesh.vertices[triangle[0]], b = mesh.vertices[triangle[1]], c = mesh.vertices[triangle[2]];
    const normal = normalOf(a, b, c);
    for (const value of [...normal, ...a, ...b, ...c]) {
      buffer.writeFloatLE(value, offset);
      offset += 4;
    }
    buffer.writeUInt16LE(0, offset);
    offset += 2;
  }
  return buffer;
}

async function encodeThreeMf(mesh: Mesh, coloredMeshes?: ColoredMesh[]): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`);
  zip.folder("_rels")?.file(".rels", `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`);
  const parts = coloredMeshes?.length ? coloredMeshes : [{ mesh, color: "#B7F58A", name: "Relief" }];
  const materialXml = parts.map(({ color, name }) =>
    `<base name="${escapeXml(name)}" displaycolor="${color.toUpperCase()}FF"/>`
  ).join("");
  const objectsXml = parts.map(({ mesh: part, name }, index) => {
    const vertexXml = part.vertices.map(([x, y, z]) => `<vertex x="${x.toFixed(5)}" y="${y.toFixed(5)}" z="${z.toFixed(5)}"/>`).join("");
    // Einige Slicer (insbesondere Anycubic Slicer Next) übernehmen das
    // Standardmaterial eines Komponentenobjekts nicht in ein Assembly. Die
    // redundante Dreieckszuweisung ist Teil des 3MF-Core-Standards und hält die
    // Farben auch dann eindeutig, wenn der Objektstandard ignoriert wird.
    const triangleXml = part.triangles.map(([v1, v2, v3]) =>
      `<triangle v1="${v1}" v2="${v2}" v3="${v3}" pid="2" p1="${index}"/>`
    ).join("");
    return `<object id="${index + 3}" type="model" name="${escapeXml(name)}" pid="2" pindex="${index}"><mesh><vertices>${vertexXml}</vertices><triangles>${triangleXml}</triangles></mesh></object>`;
  }).join("");
  const assemblyId = parts.length + 3;
  const componentsXml = parts.map((_, index) => `<component objectid="${index + 3}"/>`).join("");
  const assemblyXml = `<object id="${assemblyId}" type="model" name="AI Print Studio"><components>${componentsXml}</components></object>`;
  const buildXml = `<item objectid="${assemblyId}"/>`;
  zip.folder("3D")?.file("3dmodel.model", `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="de-DE" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
<metadata name="Title">AI Print Studio</metadata>
<resources><basematerials id="2">${materialXml}</basematerials>${objectsXml}${assemblyXml}</resources>
<build>${buildXml}</build></model>`);
  if (coloredMeshes?.length) {
    const partSettings = parts.map(({ name }, index) => `
    <part id="${index + 3}" subtype="normal_part">
      <metadata key="name" value="${escapeXml(name)}"/>
      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>
      <metadata key="source_file" value="AI Print Studio"/>
      <metadata key="source_object_id" value="${assemblyId}"/>
      <metadata key="source_volume_id" value="${index}"/>
      <metadata key="source_offset_x" value="0"/>
      <metadata key="source_offset_y" value="0"/>
      <metadata key="source_offset_z" value="0"/>
      <metadata key="extruder" value="${index + 1}"/>
      <mesh_stat edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/>
    </part>`).join("");
    zip.folder("Metadata")?.file("model_settings.config", `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <object id="${assemblyId}">
    <metadata key="name" value="AI Print Studio"/>
    <metadata key="extruder" value="1"/>${partSettings}
  </object>
</config>`);
    zip.folder("Metadata")?.file("project_settings.config", JSON.stringify({
      print_settings_id: "AI Print Studio",
      filament_colour: parts.map(({ color }) => color.toUpperCase()),
      filament_type: parts.map(() => "PLA"),
      filament_settings_id: parts.map(() => "AI Print Studio")
    }, null, 2));
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
  })[character] ?? character);
}

function normalOf(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz) || 1;
  return [nx / length, ny / length, nz / length];
}

function sanitizeStem(stem: string): string {
  return stem.normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "modell";
}

function buildPreviewSurface(
  columns: number,
  rows: number,
  widthMm: number,
  heightMm: number,
  heights: number[],
  cellMask?: boolean[],
  colorAssignments?: number[],
  colors: string[] = [],
  sideColorIndex = 0,
  preserveBoundaryHeights = false
): { positions: number[]; indices: number[]; colorParts: Array<{ color: string; indices: number[] }> } {
  const stride = Math.max(1, Math.ceil(Math.max(columns, rows) / 300));
  const xs = Array.from(new Set([...Array(Math.ceil((columns - 1) / stride) + 1)].map((_, i) => Math.min(i * stride, columns - 1))));
  const ys = Array.from(new Set([...Array(Math.ceil((rows - 1) / stride) + 1)].map((_, i) => Math.min(i * stride, rows - 1))));
  const previewColumns = xs.length;
  const previewRows = ys.length;
  const previewCells = Array.from({ length: (previewColumns - 1) * (previewRows - 1) }, (_, index) => {
    if (!cellMask) return true;
    const previewX = index % (previewColumns - 1), previewY = Math.floor(index / (previewColumns - 1));
    let occupied = 0, total = 0;
    for (let y = ys[previewY]; y < ys[previewY + 1]; y += 1) {
      for (let x = xs[previewX]; x < xs[previewX + 1]; x += 1) {
        occupied += Number(cellMask[y * (columns - 1) + x]);
        total += 1;
      }
    }
    return occupied >= Math.max(1, total * 0.5);
  });
  const boundaryPositions = buildSmoothedBoundaryPositions(previewColumns, previewRows, widthMm, heightMm, previewCells);
  const previewColorAssignments = Array((previewColumns - 1) * (previewRows - 1)).fill(-1) as number[];
  if (colorAssignments && colors.length) {
    for (let y = 0; y < previewRows - 1; y += 1) {
      for (let x = 0; x < previewColumns - 1; x += 1) {
        const previewIndex = y * (previewColumns - 1) + x;
        if (!previewCells[previewIndex]) continue;
        const votes = new Map<number, number>();
        for (let sourceY = ys[y]; sourceY < ys[y + 1]; sourceY += 1) {
          for (let sourceX = xs[x]; sourceX < xs[x + 1]; sourceX += 1) {
            const assignment = colorAssignments[sourceY * (columns - 1) + sourceX];
            if (assignment >= 0) votes.set(assignment, (votes.get(assignment) ?? 0) + 1);
          }
        }
        previewColorAssignments[previewIndex] = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? sideColorIndex;
      }
    }
    const detectedPreviewColors = previewColorAssignments.slice();
    const colorAt = (x: number, y: number) =>
      x < 0 || y < 0 || x >= previewColumns - 1 || y >= previewRows - 1
        ? -1
        : detectedPreviewColors[y * (previewColumns - 1) + x];
    for (let y = 0; y < previewRows - 1; y += 1) {
      for (let x = 0; x < previewColumns - 1; x += 1) {
        const previewIndex = y * (previewColumns - 1) + x;
        const color = detectedPreviewColors[previewIndex];
        if (!previewCells[previewIndex] || color < 0 || color === sideColorIndex) continue;
        const neighbors = [
          colorAt(x - 1, y - 1), colorAt(x, y - 1), colorAt(x + 1, y - 1),
          colorAt(x - 1, y),                           colorAt(x + 1, y),
          colorAt(x - 1, y + 1), colorAt(x, y + 1), colorAt(x + 1, y + 1)
        ];
        if (neighbors.some((neighbor) => neighbor !== color)) previewColorAssignments[previewIndex] = sideColorIndex;
      }
    }
  }
  let baseHeight = Number.POSITIVE_INFINITY;
  for (const height of heights) if (height < baseHeight) baseHeight = height;
  if (!Number.isFinite(baseHeight)) baseHeight = 0;
  const positions: number[] = [];
  const indices: number[] = [];
  const colorPartIndices = colors.map(() => [] as number[]);
  for (let previewY = 0; previewY < previewRows; previewY += 1) {
    for (let previewX = 0; previewX < previewColumns; previewX += 1) {
      const x = xs[previewX], y = ys[previewY];
      const boundary = boundaryPositions.get(previewY * previewColumns + previewX);
      positions.push(
        (boundary?.[0] ?? x * widthMm / (columns - 1)) - widthMm / 2,
        boundary && !preserveBoundaryHeights ? baseHeight : heights[y * columns + x],
        (boundary?.[1] ?? y * heightMm / (rows - 1)) - heightMm / 2
      );
    }
  }
  for (let y = 0; y < previewRows - 1; y += 1) {
    for (let x = 0; x < previewColumns - 1; x += 1) {
      if (!previewCells[y * (previewColumns - 1) + x]) continue;
      const a = y * previewColumns + x;
      const b = a + 1;
      const c = a + previewColumns;
      const d = c + 1;
      const triangles = [a, d, b, a, c, d];
      indices.push(...triangles);
      if (colorAssignments && colors.length) {
        const colorIndex = previewColorAssignments[y * (previewColumns - 1) + x];
        colorPartIndices[colorIndex]?.push(...triangles);
      }
    }
  }
  return {
    positions,
    indices,
    colorParts: colors.map((color, index) => ({ color, indices: colorPartIndices[index] })).filter((part) => part.indices.length)
  };
}

export const reliefInternals = {
  buildCellMask, buildSubjectPixelMask, cleanSubjectPixelMask, applyBoundaryRim,
  buildVectorLevels, buildSmoothedBoundaryPositions, buildColorCellAssignments, buildColoredMeshes, mergeMeshes,
  enforceUniformEdgeColor,
  buildWatertightHeightMesh, buildPreviewSurface, encodeBinaryStl, encodeThreeMf,
  smoothHeightField, analysePrintability, profileSettings
};
