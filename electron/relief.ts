import { mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import JSZip from "jszip";
import sharp from "sharp";
import { contours } from "d3-contour";
import { ShapeUtils, Vector2 } from "three";
import { validateGeneratedExportBuffer } from "./export-validation.js";
import { analyseContourQuality, removeInvalidTriangles, validateMeshGeometry, type ContourQualityReport, type GeometryValidationReport } from "./mesh-quality.js";
import { resolveReliefPipeline, type ReliefPipelineKind } from "./relief-pipelines.js";
export type { ContourQualityReport, GeometryValidationReport } from "./mesh-quality.js";

export type ReliefOptions = {
  widthMm: number;
  baseMm: number;
  reliefMm: number;
  resolution: number;
  invert: boolean;
  profile: "fast" | "balanced" | "fine" | "photo" | "logo";
  smoothing: number;
  detail: number;
  processingMode: "auto" | "vector" | "wordmark" | "depth" | "height";
  pipelineKind: ReliefPipelineKind;
  includeBackground: boolean;
  nozzleMm: number;
  minimumFeatureMm: number;
  sourceColors: string[];
  colors: string[];
  colorMapping: number[];
  sideColorIndex: number;
  outputMode: "relief" | "lithophane" | "stamp";
  shape: "source" | "rectangle" | "rounded" | "circle" | "shield" | "hexagon" | "heart";
  borderMm: number;
  borderHeightMm: number;
  holeDiameterMm: number;
  holePosition: "top-left" | "top-center" | "top-right";
  curveAngle: number;
  mirrorX: boolean;
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
  geometryValidation: GeometryValidationReport;
  contourQuality: ContourQualityReport;
  fileBytes: { stl: number; threeMf: number };
  slicer: {
    layerHeightMm: number;
    layerCount: number;
    estimatedMinutes: number;
    filamentMeters: number;
    materialGrams: number;
    colorChanges: number;
  };
  heightmapDataUrl: string;
  preview: {
    positions: number[];
    indices: number[];
    colorParts: Array<{ color: string; indices: number[] }>;
  };
  colorRegions: Array<{ sourceColor: string; targetIndex: number; coveragePercent: number }>;
};

export type ReliefProgress = {
  phase: string;
  detail: string;
  progress: number;
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
  pipelineKind: "auto",
  includeBackground: false,
  nozzleMm: 0.4,
  minimumFeatureMm: 0.8,
  sourceColors: [],
  colors: [],
  colorMapping: [],
  sideColorIndex: 0,
  outputMode: "relief",
  shape: "source",
  borderMm: 0,
  borderHeightMm: 0,
  holeDiameterMm: 0,
  holePosition: "top-center",
  curveAngle: 0,
  mirrorX: false
};

export async function createRelief(
  imagePath: string,
  outputDirectory: string,
  requested: Partial<ReliefOptions> = {},
  depthMapPath?: string,
  onProgress: (update: ReliefProgress) => void = () => undefined
): Promise<ReliefResult> {
  onProgress({ phase: "Bild prüfen", detail: "Datei und Abmessungen werden validiert …", progress: 4 });
  const options = validateOptions({ ...safeDefaults, ...requested });
  const pipeline = resolveReliefPipeline(options);
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
  onProgress({ phase: "Motiv erkennen", detail: "Konturen, Innenflächen und Hintergrund werden getrennt …", progress: 18 });
  const rawSubjectPixels = buildSubjectPixelMask(rgba, gridWidth, gridHeight);
  const hasTransparency = hasUsefulTransparency(rgba);
  const cornerIndices = [0, gridWidth - 1, (gridHeight - 1) * gridWidth, gridWidth * gridHeight - 1];
  let cornerColorSpan = 0;
  for (let first = 0; first < cornerIndices.length; first += 1) {
    for (let second = first + 1; second < cornerIndices.length; second += 1) {
      const a = cornerIndices[first] * 4, b = cornerIndices[second] * 4;
      cornerColorSpan = Math.max(cornerColorSpan, Math.hypot(
        rgba[a] - rgba[b],
        rgba[a + 1] - rgba[b + 1],
        rgba[a + 2] - rgba[b + 2]
      ));
    }
  }
  const hasLogoBackgroundGradient = !hasTransparency && cornerColorSpan >= 55;
  const rawSubjectCoverage = rawSubjectPixels.reduce((sum, occupied) => sum + Number(occupied), 0)
    / Math.max(1, rawSubjectPixels.length);
  const useWordmarkMask = pipeline.mask === "wordmark"
    || (options.processingMode === "auto" && options.profile === "logo"
      && (rawSubjectCoverage < 0.42 || hasLogoBackgroundGradient));
  if (options.processingMode === "auto" && useWordmarkMask) {
    options.includeBackground ||= hasLogoBackgroundGradient;
    options.minimumFeatureMm = Math.max(options.minimumFeatureMm, options.nozzleMm * 2);
  }
  const detectedWordmarkPixels = useWordmarkMask
    ? buildWordmarkPixelMask(rgba, gridWidth, gridHeight)
    : undefined;
  const minimumFeatureRadius = options.minimumFeatureMm > 0
    ? Math.max(0, Math.ceil((options.minimumFeatureMm / (options.widthMm / gridWidth) - 1) / 2))
    : 0;
  const wordmarkPixels = detectedWordmarkPixels && minimumFeatureRadius > 0
    ? expandPixelMaskPreservingHoles(detectedWordmarkPixels, gridWidth, gridHeight, minimumFeatureRadius)
    : detectedWordmarkPixels;
  // Bei Wortmarken und filigranen Logos würde die normale Maskenbereinigung
  // dünne Buchstaben und geschwungene Linien teilweise wegerodieren. Einzelne
  // Pixelartefakte entfernt anschließend bereits die strengere Zellmaske.
  const preserveThinVectorStrokes = pipeline.preserveThinStrokes;
  let subjectPixels = useWordmarkMask
    ? options.includeBackground
      ? Array(gridWidth * gridHeight).fill(true) as boolean[]
      : wordmarkPixels as boolean[]
    : hasTransparency || preserveThinVectorStrokes
      ? rawSubjectPixels
    : cleanSubjectPixelMask(rawSubjectPixels, gridWidth, gridHeight);
  if (pipeline.solidOuterSilhouette) {
    // Ein explizit ausgewähltes Wappen besitzt einen geschlossenen Tragkörper.
    // Dessen Außenwand darf nicht jede Antialias- oder Farbschwankung des
    // Quellbilds nachzeichnen. Pro Bildzeile wird deshalb nur die äußere
    // Silhouette übernommen und deren linke/rechte Kontur separat geglättet.
    // Die hochauflösenden Farb- und Höheninformationen im Inneren bleiben
    // vollständig erhalten.
    subjectPixels = buildSolidOuterSilhouette(subjectPixels, gridWidth, gridHeight);
  }
  if (options.outputMode === "lithophane" || options.outputMode === "stamp" || options.shape !== "source") {
    const shape = options.shape === "source" ? "rectangle" : options.shape;
    subjectPixels = buildProductPixelMask(
      gridWidth, gridHeight, options.widthMm, options.widthMm * gridHeight / gridWidth,
      shape, options.holeDiameterMm, options.holePosition
    );
  }
  // Ein einzelner belegter Eckpunkt erzeugte rund um transparente Schrift
  // eine zusätzliche Zellreihe, die im Slicer wie ein Brim wirkte. Mindestens
  // zwei belegte Eckpunkte halten die Kontur eng am tatsächlichen Schriftzug.
  const cellMask = buildCellMask(subjectPixels, gridWidth, gridHeight, 2);
  const heightMm = options.widthMm * gridHeight / gridWidth;
  const profile = profileSettings(options.profile);
  const activeMode = options.outputMode === "stamp" ? "vector" : pipeline.heightMode;
  let rawLevels: number[];
  if (activeMode === "vector") {
    rawLevels = useWordmarkMask && options.includeBackground && wordmarkPixels
      ? wordmarkPixels.map((occupied) => Number(options.invert ? !occupied : occupied))
      : buildVectorLevels(rgba, subjectPixels, gridWidth, gridHeight, options.invert);
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

    // Schmale Wort-/Signet-Logos enthalten durch Kantenglättung oft zahlreiche
    // Grau- und Blautöne. Diese sind Druckfarben, aber keine Tiefenstufen. Bei
    // geringer Flächenbelegung wird deshalb eine gemeinsame, ruhige Oberhöhe
    // verwendet; die Farbauflösung für AMS bleibt davon unberührt.
    const subjectCoverage = subjectPixels.reduce((sum, occupied) => sum + Number(occupied), 0)
      / Math.max(1, subjectPixels.length);
    if (options.profile === "logo" && !options.includeBackground && (useWordmarkMask || subjectCoverage < 0.42)) flatVectorSurface = true;
  }
  const smoothed = useWordmarkMask && options.includeBackground
    ? rawLevels
    : smoothHeightField(rawLevels, gridWidth, gridHeight, activeMode === "vector" ? Math.min(1, options.smoothing) : options.smoothing);
  onProgress({ phase: "Höhen berechnen", detail: "Reliefstufen und Oberflächen werden aufgebaut …", progress: 38 });
  const detailed = smoothed.map((value, index) =>
    Math.max(0, Math.min(1, value + (rawLevels[index] - value) * options.detail * profile.detail))
  );
  const profiledLevels = profile.steps ? detailed.map((value) => Math.round(value * profile.steps) / profile.steps) : detailed;
  // Eine flache Konturzone verhindert, dass antialiaste Randpixel als hohe,
  // sägezahnartige Außenwand im Mesh erscheinen.
  const levels = flatVectorSurface
    ? profiledLevels
    : applyBoundaryRim(profiledLevels, subjectPixels, gridWidth, gridHeight, options.profile === "logo" ? 2 : 1);
  const heights = levels.map((value) => options.baseMm + value * options.reliefMm);
  if (options.borderMm > 0 && options.borderHeightMm > 0) {
    applyRaisedBorder(heights, cellMask, gridWidth, gridHeight, options.widthMm, options.borderMm, options.baseMm + options.borderHeightMm);
  }
  if (flatVectorSurface) {
    // Ein freigestelltes Textlogo besitzt keine durchgehende Grundplatte.
    // Deshalb entspricht seine gesamte Körperhöhe exakt der eingestellten
    // Reliefhöhe. Wappen behalten weiterhin Grundplatte + Relief.
    const flatHeight = useWordmarkMask
      ? options.reliefMm
      : options.baseMm + options.reliefMm;
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
  const steppedLogo = Boolean((useWordmarkMask || options.outputMode === "stamp") && options.includeBackground && wordmarkPixels);
  const steppedCellHeights = steppedLogo
    ? flattenSteppedOuterRim(buildBinaryCellHeights(heights, gridWidth, gridHeight), cellMask, gridWidth, gridHeight)
    : undefined;
  const planarMesh = steppedCellHeights
    ? buildSteppedCellMesh(gridWidth, gridHeight, options.widthMm, heightMm, steppedCellHeights, cellMask)
    : buildWatertightHeightMesh(gridWidth, gridHeight, options.widthMm, heightMm, heights, cellMask);
  const mesh = transformProductMesh(planarMesh, options.widthMm, options.curveAngle, options.mirrorX);
  onProgress({ phase: "Mesh schließen", detail: "Boden, Außenwände und Übergänge werden verbunden …", progress: 58 });
  const detectedColorAssignments = options.colors.length
    ? buildColorCellAssignments(
      rgba, cellMask, gridWidth, gridHeight,
      options.sourceColors.length === options.colors.length ? options.sourceColors : options.colors,
      useWordmarkMask ? detectedWordmarkPixels : undefined
    )
    : undefined;
  const mappedColorAssignments = detectedColorAssignments?.map((assignment) =>
    assignment < 0 ? assignment : (options.colorMapping[assignment] ?? assignment)
  );
  const colorAssignments = mappedColorAssignments
    ? enforceUniformEdgeColor(mappedColorAssignments, cellMask, gridWidth, gridHeight, options.sideColorIndex)
    : undefined;
  const assignedCellCount = detectedColorAssignments?.filter((assignment) => assignment >= 0).length ?? 0;
  const colorRegions = options.sourceColors.map((sourceColor, sourceIndex) => ({
    sourceColor,
    targetIndex: options.colorMapping[sourceIndex] ?? sourceIndex,
    coveragePercent: assignedCellCount
      ? (detectedColorAssignments?.filter((assignment) => assignment === sourceIndex).length ?? 0) / assignedCellCount * 100
      : 0
  }));
  onProgress({
    phase: colorAssignments ? "Farben aufteilen" : "Vorschau vorbereiten",
    detail: colorAssignments ? "AMS-Flächen und einfarbiger Tragkörper werden erzeugt …" : "Das vollständige 3D-Mesh wird vorbereitet …",
    progress: 70
  });
  const planarPreview = buildPreviewSurface(
    gridWidth, gridHeight, options.widthMm, heightMm, heights, cellMask,
    colorAssignments, options.colors, options.sideColorIndex,
    flatVectorSurface || (useWordmarkMask && options.includeBackground),
    steppedLogo, options.processingMode === "vector", options.smoothing
  );
  const preview = transformProductPreview(planarPreview, options.widthMm, options.curveAngle, options.mirrorX);
  let printability = analysePrintability(mesh, heights, options, cellMask, gridWidth);
  const layerHeightMm = 0.2;
  const maximumHeight = heights.reduce((maximum, height) => Math.max(maximum, height), 0);
  const materialVolumeMm3 = printability.estimatedVolumeCm3 * 1_000;
  const filamentAreaMm2 = Math.PI * (1.75 / 2) ** 2;
  const filamentMeters = materialVolumeMm3 / filamentAreaMm2 / 1_000;
  const materialGrams = printability.estimatedVolumeCm3 * 1.24;
  const layerCount = Math.max(1, Math.ceil(maximumHeight / layerHeightMm));
  const colorChanges = Math.max(0, options.colors.length - 1) * Math.max(1, Math.ceil(options.reliefMm / layerHeightMm));
  const estimatedMinutes = Math.ceil(materialVolumeMm3 / 7.5 / 60 + layerCount * 0.12 + colorChanges * 0.35);
  onProgress({ phase: "Druckbarkeit prüfen", detail: "Zusammenhalt, Mindestbreiten und Volumen werden bewertet …", progress: 84 });
  const heightmapPng = await sharp(Buffer.from(levels.map((value) => Math.round(value * 255))), {
    raw: { width: gridWidth, height: gridHeight, channels: 1 }
  }).png().toBuffer();

  await mkdir(outputDirectory, { recursive: true });
  const stem = sanitizeStem(basename(imagePath, extname(imagePath)));
  const suffix = options.outputMode === "lithophane" ? "lithophan" : options.outputMode === "stamp" ? "stempel" : "relief";
  const stlPath = join(outputDirectory, `${stem}-${suffix}.stl`);
  const threeMfPath = join(outputDirectory, `${stem}-${suffix}.3mf`);
  const coloredMeshes = colorAssignments
    ? buildColoredMeshes(
      gridWidth, gridHeight, options.widthMm, heightMm, heights, cellMask,
      colorAssignments, options.colors, options.sideColorIndex, steppedLogo,
      options.processingMode === "vector", options.smoothing
    )
    : undefined;
  const exportColoredMeshes = coloredMeshes?.map((part) => ({
    ...part,
    mesh: orientMeshLikePreview(transformProductMesh(part.mesh, options.widthMm, options.curveAngle, options.mirrorX), heightMm)
  }));
  // Ist AMS aktiv, muss auch das einfarbige STL dieselbe geglättete
  // Geometrie wie Vorschau und 3MF verwenden. Zuvor wurde das STL aus dem
  // alten Raster-Höhenfeld geschrieben; dadurch sah gerade die im Screenshot
  // geprüfte STL trotz glatter 3MF-Farbkörper weiterhin kantig aus.
  const unsanitizedExportMesh = exportColoredMeshes?.length
    ? mergeMeshes(exportColoredMeshes.map((part) => part.mesh))
    : orientMeshLikePreview(mesh, heightMm);
  const exportMesh = removeInvalidTriangles(unsanitizedExportMesh);
  // Qualitätsangaben müssen die tatsächlich gespeicherte Geometrie bewerten.
  // Der Vektorpfad ist erheblich kleiner und glatter als sein internes
  // Raster-Arbeitsmesh; eine Analyse des Rasters würde deshalb weiterhin
  // irreführend mehr als eine Million Dreiecke melden.
  printability = analysePrintability(exportMesh, heights, options, cellMask, gridWidth);
  const geometryValidation = validateMeshGeometry(exportMesh);
  const contourQuality = analyseContourQuality(exportMesh, options.nozzleMm);
  if (!geometryValidation.valid) {
    throw new Error(`Die Exportgeometrie ist nicht geschlossen oder beschädigt: ${geometryValidation.errors.join(" ")}`);
  }
  onProgress({ phase: "Exportieren", detail: "STL und 3MF werden für die Vorschau vorbereitet …", progress: 93 });
  const stlBuffer = encodeBinaryStl(exportMesh, "AI Print Studio Relief");
  const threeMfBuffer = await encodeThreeMf(exportMesh, exportColoredMeshes);
  const [stlValidation, threeMfValidation] = await Promise.all([
    validateGeneratedExportBuffer(".stl", stlBuffer),
    validateGeneratedExportBuffer(".3mf", threeMfBuffer)
  ]);
  if (!stlValidation.valid || !threeMfValidation.valid) {
    throw new Error(`Die Exportdatei hat die Sicherheitsprüfung nicht bestanden: ${[
      ...stlValidation.errors,
      ...threeMfValidation.errors
    ].join(" ")}`);
  }
  await Promise.all([
    writeFile(stlPath, stlBuffer),
    writeFile(threeMfPath, threeMfBuffer)
  ]);
  onProgress({ phase: "Fertig", detail: "Vorschau und Export sind vollständig.", progress: 100 });

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
    contourQuality,
    fileBytes: { stl: stlBuffer.length, threeMf: threeMfBuffer.length },
    slicer: { layerHeightMm, layerCount, estimatedMinutes, filamentMeters, materialGrams, colorChanges },
    heightmapDataUrl: `data:image/png;base64,${heightmapPng.toString("base64")}`,
    preview,
    colorRegions
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
  if (!["auto", "vector", "wordmark", "depth", "height"].includes(options.processingMode)) throw new Error("Unbekannter Verarbeitungsmodus.");
  if (!["auto", "emblem", "wordmark", "text", "photo", "lithophane"].includes(options.pipelineKind)) throw new Error("Unbekannte Verarbeitungspipeline.");
  if (typeof options.includeBackground !== "boolean") throw new Error("Die Hintergrundeinstellung ist ungültig.");
  if (options.nozzleMm < 0.2 || options.nozzleMm > 1.2) throw new Error("Die Düsengröße muss zwischen 0,2 und 1,2 mm liegen.");
  if (options.minimumFeatureMm < 0 || options.minimumFeatureMm > 4) throw new Error("Die Mindestbreite muss zwischen 0 und 4 mm liegen.");
  if (!Array.isArray(options.colors) || options.colors.length > 16 || options.colors.some((color) => !/^#[0-9a-fA-F]{6}$/.test(color))) {
    throw new Error("Die Farbpalette enthält ungültige Farben.");
  }
  if (!Array.isArray(options.sourceColors) || options.sourceColors.length > 16 || options.sourceColors.some((color) => !/^#[0-9a-fA-F]{6}$/.test(color))) {
    throw new Error("Die erkannte Bildpalette enthält ungültige Farben.");
  }
  if (!Array.isArray(options.colorMapping) || options.colorMapping.some((target) => !Number.isInteger(target) || target < 0 || target >= Math.max(1, options.colors.length))) {
    throw new Error("Die Farbflächen-Zuordnung ist ungültig.");
  }
  if (!Number.isInteger(options.sideColorIndex) || options.sideColorIndex < 0 || (options.colors.length && options.sideColorIndex >= options.colors.length)) {
    throw new Error("Die gewählte Seitenfarbe ist ungültig.");
  }
  if (!["relief", "lithophane", "stamp"].includes(options.outputMode)) throw new Error("Unbekannte Ausgabeart.");
  if (!["source", "rectangle", "rounded", "circle", "shield", "hexagon", "heart"].includes(options.shape)) throw new Error("Unbekannte Außenform.");
  if (options.borderMm < 0 || options.borderMm > 12 || options.borderHeightMm < 0 || options.borderHeightMm > 20) throw new Error("Die Rahmeneinstellung ist ungültig.");
  if (options.holeDiameterMm < 0 || options.holeDiameterMm > 20) throw new Error("Der Lochdurchmesser ist ungültig.");
  if (!["top-left", "top-center", "top-right"].includes(options.holePosition)) throw new Error("Die Lochposition ist ungültig.");
  if (options.curveAngle < 0 || options.curveAngle > 90) throw new Error("Die Wölbung muss zwischen 0 und 90 Grad liegen.");
  if (typeof options.mirrorX !== "boolean") throw new Error("Die Spiegelung ist ungültig.");
  return options;
}

function buildProductPixelMask(
  width: number,
  height: number,
  widthMm: number,
  heightMm: number,
  shape: ReliefOptions["shape"],
  holeDiameterMm: number,
  holePosition: ReliefOptions["holePosition"]
): boolean[] {
  const holeRadius = holeDiameterMm / 2;
  const holeY = Math.max(holeRadius * 1.7, 3);
  const holeX = holePosition === "top-left"
    ? Math.max(holeRadius * 1.7, 3)
    : holePosition === "top-right"
      ? widthMm - Math.max(holeRadius * 1.7, 3)
      : widthMm / 2;
  return Array.from({ length: width * height }, (_, index) => {
    const x = index % width, y = Math.floor(index / width);
    const nx = x / Math.max(1, width - 1) - 0.5;
    const ny = y / Math.max(1, height - 1) - 0.5;
    let inside = true;
    if (shape === "circle") inside = nx * nx + ny * ny <= 0.25;
    else if (shape === "rounded") {
      const dx = Math.max(0, Math.abs(nx) - 0.42), dy = Math.max(0, Math.abs(ny) - 0.42);
      inside = Math.abs(nx) <= 0.5 && Math.abs(ny) <= 0.5 && dx * dx + dy * dy <= 0.08 ** 2;
    } else if (shape === "hexagon") inside = Math.abs(nx) <= 0.47 && Math.abs(nx) * 0.58 + Math.abs(ny) <= 0.5;
    else if (shape === "shield") inside = ny < -0.05
      ? Math.abs(nx) <= 0.47
      : Math.abs(nx) <= Math.max(0, 0.47 * (1 - ((ny + 0.05) / 0.55) ** 1.6));
    else if (shape === "heart") {
      const hx = nx * 2.25, hy = -(ny * 2.25) + 0.18;
      const a = hx * hx + hy * hy - 1;
      inside = a * a * a - hx * hx * hy * hy * hy <= 0;
    }
    if (!inside || holeRadius <= 0) return inside;
    const px = x / Math.max(1, width - 1) * widthMm;
    const py = y / Math.max(1, height - 1) * heightMm;
    return (px - holeX) ** 2 + (py - holeY) ** 2 > holeRadius ** 2;
  });
}

function applyRaisedBorder(
  heights: number[], cellMask: boolean[], columns: number, rows: number,
  widthMm: number, borderMm: number, borderHeight: number
): void {
  const cellColumns = columns - 1, cellRows = rows - 1;
  const radius = Math.max(1, Math.ceil(borderMm / (widthMm / cellColumns)));
  const occupied = (x: number, y: number) => x >= 0 && y >= 0 && x < cellColumns && y < cellRows && cellMask[y * cellColumns + x];
  for (let y = 0; y < cellRows; y += 1) for (let x = 0; x < cellColumns; x += 1) {
    if (!occupied(x, y)) continue;
    let border = false;
    for (let dy = -radius; dy <= radius && !border; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx * dx + dy * dy <= radius * radius && !occupied(x + dx, y + dy)) { border = true; break; }
    }
    if (!border) continue;
    for (const vertex of [y * columns + x, y * columns + x + 1, (y + 1) * columns + x, (y + 1) * columns + x + 1]) {
      heights[vertex] = Math.max(heights[vertex], borderHeight);
    }
  }
}

function transformProductMesh(mesh: Mesh, widthMm: number, curveAngle: number, mirrorX: boolean): Mesh {
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

function transformProductPreview(
  preview: ReliefResult["preview"], widthMm: number, curveAngle: number, mirrorX: boolean
): ReliefResult["preview"] {
  const radians = curveAngle * Math.PI / 180;
  const radius = radians > 1e-6 ? widthMm / radians : 0;
  const positions = preview.positions.slice();
  for (let index = 0; index < positions.length; index += 3) {
    const centered = mirrorX ? -positions[index] : positions[index];
    if (!radius) { positions[index] = centered; continue; }
    const angle = centered / radius;
    positions[index] = radius * Math.sin(angle);
    positions[index + 1] += radius * (1 - Math.cos(angle));
  }
  const flip = (indices: number[]) => mirrorX
    ? indices.flatMap((_, index) => index % 3 === 0 ? [indices[index], indices[index + 2], indices[index + 1]] : [])
    : indices.slice();
  return {
    positions,
    indices: flip(preview.indices),
    colorParts: preview.colorParts.map((part) => ({ ...part, indices: flip(part.indices) }))
  };
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
  const darkSeeds = mask.map((occupied, index) => {
    if (!occupied) return false;
    const offset = index * 4;
    const red = rgba[offset], green = rgba[offset + 1], blue = rgba[offset + 2];
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    return luminance < 150 && Math.max(red, green, blue) - Math.min(red, green, blue) < 85;
  });
  // Antialiasing unterbricht schwarze Motivkonturen stellenweise mit einem
  // einzelnen grauen Pixel. Solche echten Ein-Pixel-Lücken werden geschlossen,
  // ohne die Kontur in die eingeschlossene Farbfläche hinein zu verbreitern.
  const dark = darkSeeds.slice();
  for (let y = 1; y < height - 1; y += 1) for (let x = 1; x < width - 1; x += 1) {
    const index = y * width + x;
    if (!mask[index] || darkSeeds[index]) continue;
    const horizontalGap = darkSeeds[index - 1] && darkSeeds[index + 1];
    const verticalGap = darkSeeds[index - width] && darkSeeds[index + width];
    const offset = index * 4;
    const red = rgba[offset], green = rgba[offset + 1], blue = rgba[offset + 2];
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    const neutralAntialias = luminance < 210 && Math.max(red, green, blue) - Math.min(red, green, blue) < 50;
    if (neutralAntialias && (horizontalGap || verticalGap)) dark[index] = true;
  }
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
  passes = 36
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
      // Viele sanfte Durchgänge entfernen auch die längerwelligen Reste einer
      // Pixelkontur. 20 Durchgänge glätteten einzelne Rasterzähne, ließen an
      // großen Wappenkurven aber noch ein periodisches Wellenmuster stehen.
      // 36 Durchgänge bleiben formtreu und beruhigen diese Außenkante.
      next.set(index, [current[0] * 0.62 + averageX * 0.38, current[1] * 0.62 + averageY * 0.38]);
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
  if (mesh.triangles.length > 250_000) {
    issues.push("Mehr als 250.000 Dreiecke – für Programme mit begrenzter Meshgröße kann eine Reduzierung sinnvoll sein.");
    score -= 5;
    checks.push({ label: "Meshgröße", status: "warning", detail: `${mesh.triangles.length.toLocaleString("de-DE")} Dreiecke.` });
  } else checks.push({ label: "Meshgröße", status: "ok", detail: `${mesh.triangles.length.toLocaleString("de-DE")} Dreiecke.` });
  if (cellMask.filter(Boolean).length < 4) { issues.push("Das erkannte Motiv ist zu klein oder unvollständig."); score -= 45; }
  const components = countCellComponents(cellMask, columns - 1);
  if (components > 12) {
    issues.push(`${components} getrennte Kleinteile erkannt – einzelne Buchstaben könnten verloren gehen.`);
    score -= Math.min(20, components - 10);
    checks.push({ label: "Zusammenhalt", status: "warning", detail: `${components} getrennte Bereiche erkannt.` });
  } else checks.push({ label: "Zusammenhalt", status: "ok", detail: `${components} zusammenhängende Objektbereiche.` });
  const narrowCells = countNarrowCells(cellMask, columns - 1);
  const narrowWidthMm = options.minimumFeatureMm || pixelMm * 2;
  if (narrowCells > 0 && narrowWidthMm < 0.8) {
    issues.push(`Feine Stege sind nur etwa ${narrowWidthMm.toFixed(1)} mm breit; für eine ${options.nozzleMm.toFixed(1).replace(".", ",")}-mm-Düse sind mindestens ${(options.nozzleMm * 2).toFixed(1).replace(".", ",")} mm besser.`);
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
  subjectPixels?: boolean[]
): number[] {
  const palette = colors.map(parseHexColor);
  return Array.from({ length: (width - 1) * (height - 1) }, (_, cell) => {
    if (!cellMask[cell]) return -1;
    const x = cell % (width - 1), y = Math.floor(cell / (width - 1));
    const pixel = y * width + x;
    let red = 0, green = 0, blue = 0, weight = 0;
    const corners = [pixel, pixel + 1, pixel + width, pixel + width + 1];
    const motifSamples = subjectPixels ? corners.filter((sample) => subjectPixels[sample]) : corners;
    // Bei freigestellten Wortmarken dürfen weiße Hintergrundpixel nicht in
    // die Buchstabenfarbe einfließen. Gerade bei dünnen Schriften bestand
    // eine Zelle sonst überwiegend aus Hintergrund und wurde als Weiß exportiert.
    const samples = motifSamples.length ? motifSamples : corners;
    for (const sample of samples) {
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

function orientMeshLikePreview(mesh: Mesh, heightMm: number): Mesh {
  // Bildkoordinaten laufen von oben nach unten. STL/3MF beziehungsweise der
  // Slicer stellen die Y-Achse dagegen von unten nach oben dar. Die Spiegelung
  // an der horizontalen Bildachse lässt den Export so erscheinen wie die
  // Vorschau. Durch Vertauschen von B und C bleibt die Dreiecksorientierung
  // trotz der Spiegelung erhalten.
  return {
    vertices: mesh.vertices.map(([x, y, z]) => [x, heightMm - y, z] as const),
    triangles: mesh.triangles.map(([a, b, c]) => [a, c, b] as const)
  };
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
  sideColorIndex: number,
  stepped = false,
  vectorized = false,
  vectorSmoothing = 2
): ColoredMesh[] {
  if (vectorized && colors.length) {
    return buildVectorColorMeshes(
      columns, rows, widthMm, heightMm, heights, cellMask,
      assignments, colors, sideColorIndex, vectorSmoothing
    );
  }
  const outerBoundary = buildSmoothedBoundaryPositions(columns, rows, widthMm, heightMm, cellMask);
  // Zwei typische 0,2-mm-Schichten sind in allen gängigen Slicern als
  // druckbarer Körper erkennbar. Die frühere 0,04-mm-Haut wurde von Anycubic
  // als vermutlich falsch skalierte Datei bewertet.
  const colorSkinMm = 0.4;
  // Die Farbdecklage gehört in die eingestellte Gesamthöhe. Früher wurde sie
  // zusätzlich aufgesetzt (z. B. 4,4 statt 4,0 mm). Der Tragkörper endet nun
  // 0,4 mm tiefer, die jeweilige Farbe schließt exakt auf Sollhöhe ab.
  const structureHeights = heights.map((height) => Math.max(0, height - colorSkinMm));
  const topCellHeights = stepped
    ? flattenSteppedOuterRim(buildBinaryCellHeights(heights, columns, rows), cellMask, columns, rows)
    : undefined;
  const structureCellHeights = topCellHeights?.map((height) => Math.max(0, height - colorSkinMm));
  const structure = structureCellHeights
    ? buildSteppedCellMesh(columns, rows, widthMm, heightMm, structureCellHeights, cellMask)
    : buildWatertightHeightMesh(columns, rows, widthMm, heightMm, structureHeights, cellMask, 0, outerBoundary);
  return colors.map((color, colorIndex) => {
    const mask = assignments.map((assignment) => assignment === colorIndex);
    // Jede Farbfläche besitzt eine eigene Kontur. Bisher erhielten alle
    // Farbkörper nur die geglättete Außenkontur des Gesamtmodells; innere
    // Schwarz-, Weiß- oder Rotflächen blieben deshalb exakt auf dem
    // Pixelraster und erschienen im Slicer als Treppen. Die Farbmaske wird
    // nun selbst geglättet und für Oberseite, Boden und Seiten gemeinsam
    // verwendet, damit der Körper geschlossen bleibt.
    const colorBoundary = buildSmoothedBoundaryPositions(columns, rows, widthMm, heightMm, mask);
    const top = topCellHeights && structureCellHeights
      ? buildSteppedCellMesh(columns, rows, widthMm, heightMm, topCellHeights, mask, structureCellHeights)
      : buildWatertightHeightMesh(columns, rows, widthMm, heightMm, heights.slice(), mask, structureHeights, colorBoundary);
    return {
      mesh: colorIndex === sideColorIndex ? mergeMeshes([structure, top]) : top,
      color,
      name: `AMS ${colorIndex + 1}`
    };
  }).filter(({ mesh }) => mesh.triangles.length > 0);
}

function buildVectorColorMeshes(
  columns: number,
  rows: number,
  widthMm: number,
  heightMm: number,
  heights: number[],
  cellMask: boolean[],
  assignments: number[],
  colors: string[],
  sideColorIndex: number,
  smoothing = 2
): ColoredMesh[] {
  const cellColumns = columns - 1;
  const cellHeight = (cell: number) => {
    const x = cell % cellColumns, y = Math.floor(cell / cellColumns);
    const vertex = y * columns + x;
    return (heights[vertex] + heights[vertex + 1] + heights[vertex + columns] + heights[vertex + columns + 1]) / 4;
  };
  const masks = colors.map((_, colorIndex) => assignments.map((assignment, cell) => cellMask[cell] && assignment === colorIndex));
  // Eine Farbe kann in einem Wappen auf mehreren echten Höhen vorkommen:
  // Schwarz liegt beispielsweise sowohl am niedrigen Außenrand als auch auf
  // den erhabenen Walzen. Die frühere Medianhöhe pro AMS-Farbe zog deshalb
  // alle schwarzen Walzendetails auf die Höhe des Randes herunter. Farben
  // dürfen die bereits berechnete STL-Geometrie niemals verändern. Deshalb
  // wird jede Farbe zusätzlich nach lokalen 0,2-mm-Druckschichten getrennt.
  const heightBands = masks.map((mask) => {
    const bands = new Map<number, boolean[]>();
    mask.forEach((occupied, cell) => {
      if (!occupied) return;
      const top = Math.round(cellHeight(cell) / 0.2) * 0.2;
      const band = bands.get(top) ?? Array(mask.length).fill(false) as boolean[];
      band[cell] = true;
      bands.set(top, band);
    });
    return [...bands].map(([top, bandMask]) => ({ top, mask: bandMask }));
  });
  const colorSkinMm = 0.4;
  const positiveBottoms = heightBands.flatMap((bands) => bands.map(({ top }) => Math.max(0, top - colorSkinMm))).filter((height) => height > 0);
  const baseTop = positiveBottoms.length ? Math.min(...positiveBottoms) : 0;
  const structureParts: Mesh[] = [buildVectorExtrudedMesh(cellMask, columns, rows, widthMm, heightMm, 0, baseTop, smoothing)];
  heightBands.forEach((bands) => {
    bands.forEach(({ top, mask }) => {
      const bottom = Math.max(0, top - colorSkinMm);
      if (bottom > baseTop + 1e-6) {
        structureParts.push(buildVectorExtrudedMesh(mask, columns, rows, widthMm, heightMm, baseTop, bottom, smoothing));
      }
    });
  });
  const structure = mergeMeshes(structureParts.filter((mesh) => mesh.triangles.length));
  return colors.map((color, colorIndex) => {
    const top = mergeMeshes(heightBands[colorIndex].map((band) => buildVectorExtrudedMesh(
      band.mask, columns, rows, widthMm, heightMm,
      Math.max(0, band.top - colorSkinMm), band.top, smoothing
    )).filter((mesh) => mesh.triangles.length));
    return {
      mesh: colorIndex === sideColorIndex ? mergeMeshes([structure, top]) : top,
      color,
      name: `AMS ${colorIndex + 1}`
    };
  }).filter(({ mesh }) => mesh.triangles.length > 0);
}

function buildVectorExtrudedMesh(
  cellMask: boolean[], columns: number, rows: number,
  widthMm: number, heightMm: number, bottom: number, top: number, smoothing = 2
): Mesh {
  if (top <= bottom + 1e-6 || !cellMask.some(Boolean)) return { vertices: [], triangles: [] };
  const cellColumns = columns - 1, cellRows = rows - 1;
  const geometry = contours()
    .size([cellColumns, cellRows])
    .smooth(true)
    .thresholds([0.5])(cellMask.map(Number))[0];
  const vertices: Vec3[] = [];
  const triangles: Triangle[] = [];
  for (const polygon of geometry.coordinates) {
    const rings = polygon.map((ring) => smoothVectorRing(ring as Array<[number, number]>, smoothing).map(([x, y]) => new Vector2(
      x * widthMm / cellColumns,
      y * heightMm / cellRows
    ))).filter((ring) => ring.length >= 3);
    if (!rings.length) continue;
    const [outer, ...holes] = rings;
    const points = [...outer, ...holes.flat()];
    const faces = ShapeUtils.triangulateShape(outer, holes);
    const offset = vertices.length, count = points.length;
    points.forEach(({ x, y }) => vertices.push([x, y, bottom]));
    points.forEach(({ x, y }) => vertices.push([x, y, top]));
    for (const [a, b, c] of faces) {
      triangles.push([offset + count + a, offset + count + b, offset + count + c]);
      triangles.push([offset + c, offset + b, offset + a]);
    }
    let ringOffset = 0;
    for (const ring of rings) {
      for (let index = 0; index < ring.length; index += 1) {
        const next = (index + 1) % ring.length;
        const a = offset + ringOffset + index, b = offset + ringOffset + next;
        triangles.push([a + count, b, b + count], [a + count, a, b]);
      }
      ringOffset += ring.length;
    }
  }
  return { vertices, triangles };
}

function smoothVectorRing(source: Array<[number, number]>, smoothing = 2): Array<[number, number]> {
  let ring = source.slice(0, -1);
  if (ring.length < 4) return ring;
  const reduced: Array<[number, number]> = [];
  for (const point of ring) {
    const previous = reduced.at(-1);
    // Lange Kanten werden vor der Kurvenglättung leicht ausgedünnt. Zwei
    // Chaikin-Schritte unterteilen die resultierenden Sehnen anschließend bis
    // deutlich unter Düsenauflösung; damit verschwinden auch die im Slicer
    // sichtbaren senkrechten Facetten an runden Wappenrändern.
    if (!previous || Math.hypot(point[0] - previous[0], point[1] - previous[1]) >= 1.15) reduced.push(point);
  }
  ring = reduced.length >= 4 ? reduced : ring;
  for (let pass = 0; pass < Math.min(2, Math.max(0, Math.round(smoothing))); pass += 1) {
    const next: Array<[number, number]> = [];
    for (let index = 0; index < ring.length; index += 1) {
      const current = ring[index], following = ring[(index + 1) % ring.length];
      next.push(
        [current[0] * 0.75 + following[0] * 0.25, current[1] * 0.75 + following[1] * 0.25],
        [current[0] * 0.25 + following[0] * 0.75, current[1] * 0.25 + following[1] * 0.75]
      );
    }
    ring = next;
  }
  // Stärken oberhalb von 2 beruhigen die bereits fein unterteilte Kontur,
  // ohne nochmals die Punkt- und Dreiecksmenge zu verdoppeln.
  for (let pass = 2; pass < Math.round(smoothing); pass += 1) {
    ring = ring.map((current, index) => {
      const previous = ring[(index - 1 + ring.length) % ring.length];
      const following = ring[(index + 1) % ring.length];
      return [
        previous[0] * 0.125 + current[0] * 0.75 + following[0] * 0.125,
        previous[1] * 0.125 + current[1] * 0.75 + following[1] * 0.125
      ];
    });
  }
  return ring;
}

function buildBinaryCellHeights(heights: number[], columns: number, rows: number): number[] {
  let minimum = Number.POSITIVE_INFINITY, maximum = Number.NEGATIVE_INFINITY;
  for (const height of heights) {
    minimum = Math.min(minimum, height);
    maximum = Math.max(maximum, height);
  }
  const split = (minimum + maximum) / 2;
  const result: number[] = [];
  for (let y = 0; y < rows - 1; y += 1) for (let x = 0; x < columns - 1; x += 1) {
    const index = y * columns + x;
    const values = [heights[index], heights[index + 1], heights[index + columns], heights[index + columns + 1]];
    result.push(values.filter((height) => height > split).length >= 2 ? maximum : minimum);
  }
  return result;
}

function flattenSteppedOuterRim(
  cellHeights: number[],
  cellMask: boolean[],
  columns: number,
  rows: number,
  radius = 2
): number[] {
  const cellColumns = columns - 1, cellRows = rows - 1;
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 0; index < cellHeights.length; index += 1) {
    if (cellMask[index]) minimum = Math.min(minimum, cellHeights[index]);
  }
  if (!Number.isFinite(minimum)) return cellHeights.slice();

  const result = cellHeights.slice();
  const occupiedAt = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < cellColumns && y < cellRows && Boolean(cellMask[y * cellColumns + x]);
  for (let y = 0; y < cellRows; y += 1) for (let x = 0; x < cellColumns; x += 1) {
    const index = y * cellColumns + x;
    if (!cellMask[index]) continue;
    let nearOuterEdge = false;
    for (let offsetY = -radius; offsetY <= radius && !nearOuterEdge; offsetY += 1) {
      for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
        if (!occupiedAt(x + offsetX, y + offsetY)) {
          nearOuterEdge = true;
          break;
        }
      }
    }
    if (nearOuterEdge) result[index] = minimum;
  }
  return result;
}

function buildSteppedCellMesh(
  columns: number,
  rows: number,
  widthMm: number,
  heightMm: number,
  topHeights: number[],
  cellMask: boolean[],
  bottomHeights: number[] | number = 0
): Mesh {
  const cellColumns = columns - 1, cellRows = rows - 1;
  const vertices: Vec3[] = [];
  const triangles: Triangle[] = [];
  const vertexMap = new Map<string, number>();
  const vertex = (x: number, y: number, z: number) => {
    const key = `${x}:${y}:${z.toFixed(6)}`;
    const existing = vertexMap.get(key);
    if (existing !== undefined) return existing;
    const created = vertices.length;
    vertices.push([x * widthMm / cellColumns, y * heightMm / cellRows, z]);
    vertexMap.set(key, created);
    return created;
  };
  const bottomAt = (cell: number) => typeof bottomHeights === "number" ? bottomHeights : bottomHeights[cell];
  const cellAt = (x: number, y: number) => x < 0 || y < 0 || x >= cellColumns || y >= cellRows ? -1 : y * cellColumns + x;
  const wall = (ax: number, ay: number, bx: number, by: number, low: number, high: number) => {
    if (high <= low + 1e-6) return;
    const a0 = vertex(ax, ay, low), b0 = vertex(bx, by, low);
    const a1 = vertex(ax, ay, high), b1 = vertex(bx, by, high);
    triangles.push([a1, b0, b1], [a1, a0, b0]);
  };
  for (let y = 0; y < cellRows; y += 1) for (let x = 0; x < cellColumns; x += 1) {
    const cell = y * cellColumns + x;
    if (!cellMask[cell]) continue;
    const top = topHeights[cell], bottom = bottomAt(cell);
    const a = vertex(x, y, top), b = vertex(x + 1, y, top);
    const c = vertex(x, y + 1, top), d = vertex(x + 1, y + 1, top);
    const ba = vertex(x, y, bottom), bb = vertex(x + 1, y, bottom);
    const bc = vertex(x, y + 1, bottom), bd = vertex(x + 1, y + 1, bottom);
    triangles.push([a, b, d], [a, d, c], [ba, bd, bb], [ba, bc, bd]);
    const neighbors = [
      { cell: cellAt(x, y - 1), ax: x, ay: y, bx: x + 1, by: y },
      { cell: cellAt(x + 1, y), ax: x + 1, ay: y, bx: x + 1, by: y + 1 },
      { cell: cellAt(x, y + 1), ax: x + 1, ay: y + 1, bx: x, by: y + 1 },
      { cell: cellAt(x - 1, y), ax: x, ay: y + 1, bx: x, by: y }
    ];
    for (const edge of neighbors) {
      const neighborTop = edge.cell >= 0 && cellMask[edge.cell] ? topHeights[edge.cell] : bottom;
      wall(edge.ax, edge.ay, edge.bx, edge.by, Math.max(bottom, neighborTop), top);
    }
  }
  return { vertices, triangles };
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

function buildWordmarkPixelMask(rgba: Buffer, width: number, height: number): boolean[] {
  const pixelCount = width * height;
  if (hasUsefulTransparency(rgba)) {
    return Array.from({ length: pixelCount }, (_, index) => rgba[index * 4 + 3] >= 64);
  }

  // Anders als beim Wappen wird nicht nur der von außen erreichbare
  // Hintergrund entfernt. Auch eingeschlossene, hintergrundfarbene Bereiche
  // in a, e, d, o oder ö bleiben echte Löcher. Ein robust angepasstes
  // quadratisches Flächenmodell bildet auch radiale Lichtverläufe und
  // Vignetten ab. Die frühere Interpolation aus nur vier Ecken konnte solche
  // Hintergründe in der Bildmitte nicht erklären und hob sie fälschlich an.
  const background = fitSmoothBackground(rgba, width, height);
  return Array.from({ length: pixelCount }, (_, index) => {
    const x = index % width, y = Math.floor(index / width);
    const expected = background.at(x, y);
    const offset = index * 4;
    return Math.hypot(
      rgba[offset] - expected[0],
      rgba[offset + 1] - expected[1],
      rgba[offset + 2] - expected[2]
    ) >= background.threshold;
  });
}

function fitSmoothBackground(rgba: Buffer, width: number, height: number): {
  at: (x: number, y: number) => readonly [number, number, number];
  threshold: number;
} {
  const basisAt = (x: number, y: number) => {
    const nx = x / Math.max(1, width - 1) * 2 - 1;
    const ny = y / Math.max(1, height - 1) * 2 - 1;
    return [1, nx, ny, nx * nx, nx * ny, ny * ny];
  };
  const bandX = Math.max(2, Math.round(width * 0.12));
  const bandY = Math.max(2, Math.round(height * 0.12));
  const stride = Math.max(1, Math.floor(Math.max(width, height) / 140));
  let samples: { basis: number[]; rgb: readonly [number, number, number] }[] = [];
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      if (x >= bandX && x < width - bandX && y >= bandY && y < height - bandY) continue;
      const offset = (y * width + x) * 4;
      samples.push({ basis: basisAt(x, y), rgb: [rgba[offset], rgba[offset + 1], rgba[offset + 2]] });
    }
  }
  const fit = (channel: number) => {
    const matrix = Array.from({ length: 6 }, () => Array(6).fill(0));
    const vector = Array(6).fill(0);
    for (const sample of samples) for (let row = 0; row < 6; row += 1) {
      vector[row] += sample.basis[row] * sample.rgb[channel];
      for (let column = 0; column < 6; column += 1) matrix[row][column] += sample.basis[row] * sample.basis[column];
    }
    return solveLinearSystem(matrix, vector);
  };
  let coefficients = [fit(0), fit(1), fit(2)];
  // Helle oder dunkle Motivpixel, die bis an den Rand reichen, werden nach
  // zwei Anpassungsrunden aus den Stützpunkten entfernt.
  for (let pass = 0; pass < 2; pass += 1) {
    const residuals = samples.map((sample) => Math.hypot(...sample.rgb.map((value, channel) =>
      value - sample.basis.reduce((sum, basis, index) => sum + basis * coefficients[channel][index], 0)
    )));
    const sorted = residuals.slice().sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const keepBelow = Math.max(18, median * 2.8);
    const filtered = samples.filter((_, index) => residuals[index] <= keepBelow);
    if (filtered.length < 24 || filtered.length === samples.length) break;
    samples = filtered;
    coefficients = [fit(0), fit(1), fit(2)];
  }
  const borderResiduals = samples.map((sample) => Math.hypot(...sample.rgb.map((value, channel) =>
    value - sample.basis.reduce((sum, basis, index) => sum + basis * coefficients[channel][index], 0)
  ))).sort((a, b) => a - b);
  const residual95 = borderResiduals[Math.floor(borderResiduals.length * 0.95)] ?? 0;
  const threshold = Math.max(38, Math.min(58, residual95 * 1.8 + 12));
  return {
    at: (x, y) => {
      const basis = basisAt(x, y);
      return coefficients.map((channel) => Math.max(0, Math.min(255,
        channel.reduce((sum, value, index) => sum + value * basis[index], 0)
      ))) as [number, number, number];
    },
    threshold
  };
}

function solveLinearSystem(matrix: number[][], vector: number[]): number[] {
  const size = vector.length;
  const rows = matrix.map((row, index) => [...row, vector[index]]);
  for (let pivot = 0; pivot < size; pivot += 1) {
    let best = pivot;
    for (let row = pivot + 1; row < size; row += 1) if (Math.abs(rows[row][pivot]) > Math.abs(rows[best][pivot])) best = row;
    [rows[pivot], rows[best]] = [rows[best], rows[pivot]];
    const divisor = rows[pivot][pivot];
    if (Math.abs(divisor) < 1e-8) return [0, 0, 0, 0, 0, 0];
    for (let column = pivot; column <= size; column += 1) rows[pivot][column] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === pivot) continue;
      const factor = rows[row][pivot];
      for (let column = pivot; column <= size; column += 1) rows[row][column] -= factor * rows[pivot][column];
    }
  }
  return rows.map((row) => row[size]);
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

function buildSolidOuterSilhouette(pixels: boolean[], width: number, height: number): boolean[] {
  const left = Array(height).fill(Number.POSITIVE_INFINITY) as number[];
  const right = Array(height).fill(Number.NEGATIVE_INFINITY) as number[];
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (!pixels[y * width + x]) continue;
    left[y] = Math.min(left[y], x);
    right[y] = Math.max(right[y], x);
  }
  const radius = Math.max(2, Math.min(12, Math.round(height / 70)));
  const smooth = (values: number[], fallback: number) => values.map((value, y) => {
    if (!Number.isFinite(value)) return fallback;
    let weighted = 0, weight = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const row = y + offset;
      if (row < 0 || row >= height || !Number.isFinite(values[row])) continue;
      const sampleWeight = radius + 1 - Math.abs(offset);
      weighted += values[row] * sampleWeight;
      weight += sampleWeight;
    }
    return weight ? weighted / weight : value;
  });
  const smoothLeft = smooth(left, 0);
  const smoothRight = smooth(right, width - 1);
  const result = Array(width * height).fill(false) as boolean[];
  for (let y = 0; y < height; y += 1) {
    if (!Number.isFinite(left[y]) || !Number.isFinite(right[y])) continue;
    const from = Math.max(0, Math.floor(smoothLeft[y]));
    const to = Math.min(width - 1, Math.ceil(smoothRight[y]));
    for (let x = from; x <= to; x += 1) result[y * width + x] = true;
  }
  return result;
}

function expandPixelMask(pixels: boolean[], width: number, height: number, radius: number): boolean[] {
  if (radius <= 0) return pixels.slice();
  const expanded = pixels.slice();
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (!pixels[y * width + x]) continue;
    for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
      for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
        if (offsetX * offsetX + offsetY * offsetY > radius * radius) continue;
        const targetX = x + offsetX, targetY = y + offsetY;
        if (targetX >= 0 && targetY >= 0 && targetX < width && targetY < height) {
          expanded[targetY * width + targetX] = true;
        }
      }
    }
  }
  return expanded;
}

function expandPixelMaskPreservingHoles(pixels: boolean[], width: number, height: number, radius: number): boolean[] {
  const expanded = expandPixelMask(pixels, width, height, radius);
  if (radius <= 0) return expanded;

  // Hintergrund, der vom Bildrand erreichbar ist, darf durch die
  // Mindestbreitenkorrektur enger werden. Eingeschlossene Innenräume wie in
  // a, e, o, ö oder R werden dagegen aus der Originalmaske zurückgeschnitten.
  const outside = new Uint8Array(width * height);
  const queue: number[] = [];
  const enqueue = (index: number) => {
    if (index < 0 || index >= pixels.length || pixels[index] || outside[index]) return;
    outside[index] = 1;
    queue.push(index);
  };
  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor], x = index % width, y = Math.floor(index / width);
    if (x > 0) enqueue(index - 1);
    if (x + 1 < width) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y + 1 < height) enqueue(index + width);
  }
  for (let index = 0; index < pixels.length; index += 1) {
    if (!pixels[index] && !outside[index]) expanded[index] = false;
  }
  return expanded;
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
<metadata name="Description">Druckoptimiert für eine 0,4-mm-Düse</metadata>
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
      filament_settings_id: parts.map(() => "AI Print Studio"),
      nozzle_diameter: ["0.4"],
      printer_settings_id: "AI Print Studio · 0.4 mm"
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
  preserveBoundaryHeights = false,
  stepped = false,
  vectorized = false,
  vectorSmoothing = 2
): { positions: number[]; indices: number[]; colorParts: Array<{ color: string; indices: number[] }> } {
  if (stepped && cellMask && (!colorAssignments || !colors.length)) {
    const mesh = buildSteppedCellMesh(
      columns, rows, widthMm, heightMm,
      flattenSteppedOuterRim(buildBinaryCellHeights(heights, columns, rows), cellMask, columns, rows), cellMask
    );
    const positions = mesh.vertices.flatMap(([x, y, z]) => [x - widthMm / 2, z, y - heightMm / 2]);
    const indices = mesh.triangles.flatMap(([a, b, c]) => [a, c, b]);
    return { positions, indices, colorParts: [] };
  }
  // Der Vektorpfad muss unabhängig von der Höhenklassifikation verwendet
  // werden. Zuvor landete ein mehrfarbiges Wappen mit mehreren Helligkeiten
  // in der Vorschau wieder im alten Rasterpfad, während nur der Export bereits
  // vektorisiert war.
  if ((preserveBoundaryHeights || vectorized) && cellMask && colorAssignments && colors.length) {
    const solids = buildColoredMeshes(
      columns,
      rows,
      widthMm,
      heightMm,
      heights,
      cellMask,
      colorAssignments,
      colors,
      sideColorIndex,
      stepped,
      vectorized,
      vectorSmoothing
    );
    const positions: number[] = [];
    const indices: number[] = [];
    const colorParts: Array<{ color: string; indices: number[] }> = [];
    for (const part of solids) {
      const offset = positions.length / 3;
      const highestVertexByPosition = new Map<string, number>();
      for (const [x, y, z] of part.mesh.vertices) {
        const key = `${x.toFixed(6)}:${y.toFixed(6)}`;
        highestVertexByPosition.set(key, Math.max(highestVertexByPosition.get(key) ?? Number.NEGATIVE_INFINITY, z));
      }
      for (const [x, y, z] of part.mesh.vertices) {
        positions.push(x - widthMm / 2, z, y - heightMm / 2);
      }
      const partIndices: number[] = [];
      for (const [a, b, c] of part.mesh.triangles) {
        partIndices.push(a + offset, c + offset, b + offset);
        indices.push(a + offset, c + offset, b + offset);
      }
      // Nicht-Trägerfarben zeigen in der Vorschau ausschließlich ihre echte
      // Deckfläche. Boden und Seiten der geschlossenen 0,4-mm-Farbkörper sind
      // für den 3MF-Export nötig, würden von unten aber als farbige Löcher und
      // Streifen durch den einheitlichen Tragkörper scheinen.
      const visiblePartIndices: number[] = [];
      for (const triangle of part.mesh.triangles) {
        const visible = part.color === colors[sideColorIndex] || triangle.every((vertexIndex) => {
          const [x, y, z] = part.mesh.vertices[vertexIndex];
          return Math.abs(z - (highestVertexByPosition.get(`${x.toFixed(6)}:${y.toFixed(6)}`) ?? z)) < 1e-6;
        });
        if (visible) visiblePartIndices.push(
          triangle[0] + offset,
          triangle[2] + offset,
          triangle[1] + offset
        );
      }
      colorParts.push({ color: part.color, indices: visiblePartIndices });
    }
    return { positions, indices, colorParts };
  }

  // Flache einfarbige Wort-/Schriftlogos benötigen in der Vorschau nicht nur
  // ihre Deckfläche, sondern auch Boden und Seitenwände. Andernfalls liegt die
  // einzige sichtbare Fläche auf ihrer Z-Höhe über dem Raster und wirkt
  // fälschlich schwebend.
  if (preserveBoundaryHeights && cellMask && !colors.length) {
    const solid = buildWatertightHeightMesh(columns, rows, widthMm, heightMm, heights, cellMask);
    return {
      positions: solid.vertices.flatMap(([x, y, z]) => [
        x - widthMm / 2,
        z,
        y - heightMm / 2
      ]),
      indices: solid.triangles.flatMap(([a, b, c]) => [a, c, b]),
      colorParts: []
    };
  }

  // Die Vorschau darf die geglättete Exportkontur nicht durch erneutes grobes
  // Downsampling wieder gezackt darstellen.
  // Logo-Modelle werden mit bis zu 512 Rasterpunkten erzeugt. Die frühere
  // Vorschaugrenze von 480 setzte solche Modelle trotzdem auf ungefähr die
  // halbe Auflösung zurück (stride 2). Besonders an runden Außenkonturen waren
  // dadurch deutlich sichtbare Polygonsegmente zu sehen, obwohl der Export
  // feiner war. Bis 720 Punkte bleibt die Originalauflösung jetzt erhalten.
  const stride = Math.max(1, Math.ceil(Math.max(columns, rows) / 720));
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
  buildCellMask, buildSubjectPixelMask, buildWordmarkPixelMask, cleanSubjectPixelMask, applyBoundaryRim,
  expandPixelMask, expandPixelMaskPreservingHoles,
  buildVectorLevels, buildSmoothedBoundaryPositions, buildColorCellAssignments, buildColoredMeshes,
  buildVectorColorMeshes, buildVectorExtrudedMesh, smoothVectorRing, mergeMeshes,
  enforceUniformEdgeColor,
  buildWatertightHeightMesh, buildBinaryCellHeights, flattenSteppedOuterRim, buildSteppedCellMesh, buildPreviewSurface, orientMeshLikePreview, encodeBinaryStl, encodeThreeMf,
  smoothHeightField, analysePrintability, profileSettings, buildProductPixelMask, applyRaisedBorder,
  transformProductMesh, transformProductPreview, buildSolidOuterSilhouette
};
