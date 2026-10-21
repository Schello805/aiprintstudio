import { mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import sharp from "sharp";
import { validateGeneratedExportBuffer } from "./export-validation.js";
import { analyseContourQuality, removeInvalidTriangles, validateMeshGeometry, type ContourQualityReport, type GeometryValidationReport } from "./mesh-quality.js";
import { resolveReliefPipeline, type ReliefPipelineKind } from "./relief-pipelines.js";
import {
  encodeBinaryStl,
  encodeThreeMf,
  sanitizeStem,
  type Mesh
} from "./relief-export.js";
import {
  applyBoundaryRim,
  buildCellMask,
  buildSolidOuterSilhouette,
  buildSubjectPixelMask,
  buildWordmarkForegroundPixelMask,
  buildWordmarkPixelMask,
  cleanSubjectPixelMask,
  expandPixelMask,
  expandPixelMaskPreservingHoles,
  hasUsefulTransparency,
  suggestImageProfile
} from "./relief-masks.js";
import {
  assignCanonicalTriangleMaterials,
  buildBinaryCellHeights,
  buildCanonicalMeshPreview,
  buildColoredMeshes,
  buildCompositeBoundaryPositions,
  buildLayeredCellVectorRelief,
  buildLayeredVectorRelief,
  buildOuterEdgeCellMask,
  buildPreviewSurface,
  buildRaisedWordmarkCellHeights,
  buildSmoothedBoundaryPositions,
  buildSteppedCellMesh,
  buildVectorColorMeshes,
  buildVectorExtrudedMesh,
  buildWatertightHeightMesh,
  flattenSteppedOuterRim,
  flattenSteppedOuterRimPreservingRaised,
  mergeMeshes,
  orientMeshLikePreview,
  smoothVectorRing,
  snapMeshZToLevels,
  stabilizeEmblemOuterWallHeights
} from "./relief-meshing.js";
import {
  createSvgPathRelief,
  createTracedWordmarkSvg,
  transformProductMesh,
  wordmarkRasterTracePreset
} from "./relief-vectorize.js";
export type { ContourQualityReport, GeometryValidationReport } from "./mesh-quality.js";

export type ReliefOptions = {
  /** Ursprünglicher Uploadname; temporäre Recovery-Pfade dürfen nie Exportnamen werden. */
  sourceName: string;
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

const safeDefaults: ReliefOptions = {
  sourceName: "",
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
  // Stabile Qualitätsgrenze pro Pipeline: Ein Wappen darf durch einen alten
  // Projektstand oder einen neuen Aufrufer nie wieder auf die sichtbar
  // gezackte Glättung 1 zurückfallen. Dieser Vertrag liegt bewusst in der
  // Engine und gilt damit identisch für Vorschau, STL und 3MF.
  options.smoothing = Math.max(options.smoothing, pipeline.minimumSmoothing);
  const metadata = await sharp(imagePath).metadata();
  if (!metadata.width || !metadata.height) throw new Error("Das Bild besitzt keine gültigen Abmessungen.");
  if (metadata.format === "svg" && pipeline.kind === "wordmark") {
    const svgResult = await createSvgPathRelief(imagePath, outputDirectory, options, onProgress);
    if (svgResult) return svgResult;
  }
  if (metadata.format !== "svg" && pipeline.kind === "wordmark") {
    onProgress({ phase: "Logo vektorisieren", detail: "PNG/JPG wird lokal in saubere SVG-Pfade umgewandelt …", progress: 10 });
    const tracedSvg = await createTracedWordmarkSvg(imagePath, outputDirectory, options, metadata.width, metadata.height);
    if (tracedSvg) {
      const svgResult = await createSvgPathRelief(tracedSvg, outputDirectory, {
        ...options,
        sourceName: options.sourceName.replace(/\.[^.]+$/, ".svg")
      }, onProgress);
      if (svgResult) return {
        ...svgResult,
        printability: {
          ...svgResult.printability,
          issues: ["PNG/JPG wurde lokal vektorisiert und anschließend als SVG-Pfad extrudiert."]
        }
      };
    }
  }

  const aspect = metadata.height / metadata.width;
  const isText = pipeline.kind === "text" || options.pipelineKind === "text";
  const gridWidth = isText
    ? Math.max(options.resolution, Math.min(1024, Math.round(options.resolution * 2)))
    : options.resolution;
  const gridHeight = Math.max(isText ? 160 : 16, Math.round(gridWidth * aspect));
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
    ? options.includeBackground
      ? buildWordmarkForegroundPixelMask(rgba, gridWidth, gridHeight)
      : buildWordmarkPixelMask(rgba, gridWidth, gridHeight)
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
    : pipeline.kind === "photo" && !hasTransparency
      ? Array(gridWidth * gridHeight).fill(true) as boolean[]
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
  if ((options.outputMode === "lithophane" || options.outputMode === "stamp" || options.shape !== "source") && !isText) {
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
  } else if (depthMapPath) {
    const [{ data: depthData }, { data: photoData }] = await Promise.all([
      sharp(depthMapPath)
        .grayscale()
        .resize(gridWidth, gridHeight, { fit: "fill" })
        .blur(Math.max(1.8, profile.inputBlur))
        .normalize({ lower: 1, upper: 99 })
        .raw()
        .toBuffer({ resolveWithObject: true }),
      prepared.clone()
        .flatten({ background: "#000000" })
        .grayscale()
        .resize(gridWidth, gridHeight, { fit: "fill" })
        .normalize({ lower: 1, upper: 99 })
        .raw()
        .toBuffer({ resolveWithObject: true })
    ]);
    rawLevels = Array.from({ length: gridWidth * gridHeight }, (_, index) => {
      const depthLevel = (depthData[index] ?? 0) / 255;
      const detailLevel = (photoData[index] ?? 0) / 255;
      const combined = depthLevel * 0.68 + detailLevel * 0.32;
      const normalized = options.outputMode === "lithophane"
        ? (options.invert ? combined : 1 - combined)
        : (options.invert ? 1 - combined : combined);
      return Math.max(0, Math.min(1, (Math.pow(normalized, profile.gamma) - 0.5) * profile.contrast + 0.5));
    });
  } else {
    const source = prepared.clone().flatten({ background: "#ffffff" }).grayscale();
    const { data } = await source
      .resize(gridWidth, gridHeight, { fit: "fill" })
      .blur(profile.inputBlur)
      .normalize({ lower: 1, upper: 99 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    rawLevels = Array.from(data, (value) => {
      const luminance = value / 255;
      const normalized = pipeline.kind === "photo" && options.outputMode !== "lithophane"
        ? (options.invert ? 1 - luminance : luminance)
        : (options.invert ? luminance : 1 - luminance);
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
  if (isText || pipeline.flattenMotifSurface) flatVectorSurface = true;
  const semanticEmblemLevels = (pipeline.kind === "emblem" || isText) && activeMode === "vector";
  const smoothed = semanticEmblemLevels || (useWordmarkMask && options.includeBackground)
    ? rawLevels
    : smoothHeightField(rawLevels, gridWidth, gridHeight, activeMode === "vector" ? Math.min(1, options.smoothing) : options.smoothing);
  onProgress({ phase: "Höhen berechnen", detail: "Reliefstufen und Oberflächen werden aufgebaut …", progress: 38 });
  // Bei Wappen sind die semantisch erkannten Ebenen wichtiger als künstliche
  // Kantenschärfe. Ein Faktor über 1 erzeugte beidseits schwarzer Konturen
  // Überhöhungen; im mehrfarbigen 3MF wurden daraus getrennte, gezackte
  // Farbkörper. STL, Vorschau und 3MF verwenden nun dieselbe begrenzte
  // Detailmischung.
  const detailBlend = semanticEmblemLevels ? 0 : options.detail * profile.detail;
  const detailed = smoothed.map((value, index) =>
    Math.max(0, Math.min(1, value + (rawLevels[index] - value) * detailBlend))
  );
  const profiledLevels = semanticEmblemLevels
    ? detailed
    : profile.steps ? detailed.map((value) => Math.round(value * profile.steps) / profile.steps) : detailed;
  // Eine flache Konturzone verhindert, dass antialiaste Randpixel als hohe,
  // sägezahnartige Außenwand im Mesh erscheinen.
  const levels = flatVectorSurface || semanticEmblemLevels
    ? profiledLevels
    : applyBoundaryRim(
      profiledLevels,
      subjectPixels,
      gridWidth,
      gridHeight,
      pipeline.kind === "emblem" ? 4 : options.profile === "logo" ? 2 : 1
    );
  const heights = levels.map((value) => options.baseMm + value * options.reliefMm);
  if (options.borderMm > 0 && options.borderHeightMm > 0) {
    applyRaisedBorder(heights, cellMask, gridWidth, gridHeight, options.widthMm, options.borderMm, options.baseMm + options.borderHeightMm);
  }
  if (flatVectorSurface) {
    // Ein freigestelltes Textlogo besitzt keine durchgehende Grundplatte.
    // Deshalb entspricht seine gesamte Körperhöhe exakt der eingestellten
    // Reliefhöhe. Wappen und Text mit Grundplatte behalten Grundplatte + Relief.
    const flatHeight = (useWordmarkMask || (isText && !options.includeBackground))
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
  const wordmarkBackgroundCells = useWordmarkMask && options.includeBackground && wordmarkPixels
    ? buildRaisedWordmarkCellHeights(wordmarkPixels, cellMask, gridWidth, gridHeight, options.baseMm, options.baseMm + options.reliefMm)
    : undefined;
  const steppedLogo = Boolean(wordmarkBackgroundCells || ((useWordmarkMask || options.outputMode === "stamp") && options.includeBackground && wordmarkPixels));
  const steppedCellHeights = wordmarkBackgroundCells
    ? flattenSteppedOuterRimPreservingRaised(
      wordmarkBackgroundCells.heights,
      cellMask,
      wordmarkBackgroundCells.raisedCells,
      gridWidth,
      gridHeight
    )
    : steppedLogo
      ? flattenSteppedOuterRim(buildBinaryCellHeights(heights, gridWidth, gridHeight), cellMask, gridWidth, gridHeight)
      : undefined;
  const emblemBoundary = pipeline.kind === "emblem"
    ? buildSmoothedBoundaryPositions(gridWidth, gridHeight, options.widthMm, heightMm, cellMask, 64)
    : undefined;
  // Wappen wurden bisher trotz geglätteter Randpunkte weiterhin als dichtes
  // Pixelraster trianguliert. An jeder Rasterspalte entstand dadurch eine
  // sichtbare senkrechte Facette. Der Wappenpfad baut Grundplatte und
  // Reliefstufen nun aus echten Vektorkonturen auf. Vorschau, STL und 3MF
  // verwenden exakt dieses eine Mesh; AMS weist ihm anschließend nur Farben
  // zu und verändert die Geometrie nicht mehr.
  let planarMesh = pipeline.kind === "emblem" && options.pipelineKind === "emblem" && !steppedCellHeights
    ? await buildLayeredVectorRelief(gridWidth, gridHeight, options.widthMm, heightMm, heights, cellMask, 8, true)
    : pipeline.kind === "text" && options.pipelineKind === "text" && !steppedCellHeights
      ? await buildLayeredVectorRelief(
          gridWidth,
          gridHeight,
          options.widthMm,
          heightMm,
          heights,
          cellMask,
          Math.max(4, options.smoothing),
          false,
          true,
          {
            enabled: options.includeBackground,
            baseMm: options.baseMm,
            reliefMm: options.reliefMm,
            shape: options.shape,
            cornerRadiusMm: 4,
            borderMm: options.borderMm,
            borderHeightMm: options.borderHeightMm
          }
        )
      : steppedCellHeights && useWordmarkMask && options.includeBackground
        ? await buildLayeredCellVectorRelief(
          gridWidth,
          gridHeight,
          options.widthMm,
          heightMm,
          steppedCellHeights,
          cellMask,
          Math.max(3, options.smoothing),
          false
        )
      : steppedCellHeights
        ? buildSteppedCellMesh(gridWidth, gridHeight, options.widthMm, heightMm, steppedCellHeights, cellMask)
        : buildWatertightHeightMesh(gridWidth, gridHeight, options.widthMm, heightMm, heights, cellMask, 0, emblemBoundary);
  let mesh = transformProductMesh(planarMesh, options.widthMm, options.curveAngle, options.mirrorX);
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
  // Vektorkonturen können an exakt zusammenfallenden Ringpunkten einzelne
  // Dreiecke mit Fläche 0 erzeugen. Diese müssen vor der Materialzuordnung
  // entfernt werden, damit Geometrie und AMS-Materialliste dauerhaft dieselbe
  // Dreiecksanzahl besitzen.
  planarMesh = removeInvalidTriangles(planarMesh);
  mesh = transformProductMesh(planarMesh, options.widthMm, options.curveAngle, options.mirrorX);
  const canonicalTriangleMaterials = mappedColorAssignments
    ? assignCanonicalTriangleMaterials(
      planarMesh, mappedColorAssignments, gridWidth, gridHeight,
      options.widthMm, heightMm, options.sideColorIndex
    )
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
  const useCanonicalVectorPreview =
    (pipeline.kind === "emblem" && options.pipelineKind === "emblem") ||
    (pipeline.kind === "text" && options.pipelineKind === "text");
  const emblemPreviewMaterials = useCanonicalVectorPreview
    ? canonicalTriangleMaterials ?? Array(planarMesh.triangles.length).fill(0)
    : undefined;
  const planarPreview = emblemPreviewMaterials
    ? buildCanonicalMeshPreview(
      planarMesh,
      options.widthMm,
      heightMm,
      emblemPreviewMaterials,
      canonicalTriangleMaterials ? options.colors : ["#e6f5c9"]
    )
    : buildPreviewSurface(
      gridWidth, gridHeight, options.widthMm, heightMm, heights, cellMask,
      colorAssignments, options.colors, options.sideColorIndex,
      flatVectorSurface || (useWordmarkMask && options.includeBackground),
      steppedLogo, options.processingMode === "vector", options.smoothing,
      steppedCellHeights
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
  const namingSource = options.sourceName.trim() || basename(imagePath);
  const stem = sanitizeStem(basename(namingSource, extname(namingSource)));
  const suffix = options.outputMode === "lithophane" ? "lithophan" : options.outputMode === "stamp" ? "stempel" : "relief";
  const stlPath = join(outputDirectory, `${stem}-${suffix}.stl`);
  const threeMfPath = join(outputDirectory, `${stem}-${suffix}.3mf`);
  const coloredMeshes = colorAssignments && !canonicalTriangleMaterials
    ? buildColoredMeshes(
      gridWidth, gridHeight, options.widthMm, heightMm, heights, cellMask,
      colorAssignments, options.colors, options.sideColorIndex, steppedLogo,
      options.processingMode === "vector", options.smoothing, steppedCellHeights
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
  // STL, Vorschau und 3MF verwenden immer dasselbe kanonische Mesh. Farben
  // dürfen keine zusätzlichen oder überlappenden Körper mehr erzeugen.
  const unsanitizedExportMesh = orientMeshLikePreview(mesh, heightMm);
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
  const threeMfBuffer = await encodeThreeMf(
    exportMesh,
    exportColoredMeshes,
    canonicalTriangleMaterials,
    canonicalTriangleMaterials ? options.colors : undefined,
    options.sideColorIndex
  );
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
  if (typeof options.sourceName !== "string" || options.sourceName.length > 255) throw new Error("Der ursprüngliche Dateiname ist ungültig.");
  if (options.widthMm < 20 || options.widthMm > 300) throw new Error("Die Breite muss zwischen 20 und 300 mm liegen.");
  if (options.baseMm < 0.8 || options.baseMm > 10) throw new Error("Die Grundplatte muss zwischen 0,8 und 10 mm liegen.");
  if (options.reliefMm < 0.5 || options.reliefMm > 20) throw new Error("Die Reliefhöhe muss zwischen 0,5 und 20 mm liegen.");
  if (options.resolution < 32 || options.resolution > 512) throw new Error("Die Auflösung muss zwischen 32 und 512 liegen.");
  if (!["fast", "balanced", "fine", "photo", "logo"].includes(options.profile)) throw new Error("Unbekanntes Qualitätsprofil.");
  if (options.smoothing < 0 || options.smoothing > 8) throw new Error("Die Glättung muss zwischen 0 und 8 liegen.");
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
    const maxChannel = Math.max(red, green, blue);
    const chroma = maxChannel - Math.min(red, green, blue);
    return maxChannel < 95 || (luminance < 85 && maxChannel < 125 && chroma < 95) || (luminance < 145 && chroma < 55);
  });
  // Antialiasing unterbricht schwarze Motivkonturen stellenweise mit einem
  // einzelnen grauen oder abgedunkelten Mischpixel. Solche echten Ein-Pixel-Lücken
  // werden geschlossen, ohne die Kontur in die eingeschlossene Farbfläche hinein zu verbreitern.
  const dark = darkSeeds.slice();
  for (let y = 1; y < height - 1; y += 1) for (let x = 1; x < width - 1; x += 1) {
    const index = y * width + x;
    if (!mask[index] || darkSeeds[index]) continue;
    const horizontalGap = darkSeeds[index - 1] && darkSeeds[index + 1];
    const verticalGap = darkSeeds[index - width] && darkSeeds[index + width];
    const offset = index * 4;
    const red = rgba[offset], green = rgba[offset + 1], blue = rgba[offset + 2];
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    const maxChannel = Math.max(red, green, blue);
    const chroma = maxChannel - Math.min(red, green, blue);
    const antialiasGap = (luminance < 210 && chroma < 55) || (luminance < 130 && maxChannel < 165);
    if (antialiasGap && (horizontalGap || verticalGap)) dark[index] = true;
  }
  const visited = new Uint8Array(mask.length);
  const components: number[][] = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || dark[start] || visited[start]) continue;
    const component: number[] = [];
    const startCenter = centers[cleaned[start]] ?? [255, 255, 255];
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
          const neighborCenter = centers[cleaned[neighbor]] ?? startCenter;
          const centerDist = Math.hypot(
            neighborCenter[0] - startCenter[0],
            neighborCenter[1] - startCenter[1],
            neighborCenter[2] - startCenter[2]
          );
          if (centerDist < 60) {
            visited[neighbor] = 1;
            queue.push(neighbor);
          }
        }
      }
    }
    components.push(component);
  }
  if (components.length < 3 || suggestImageProfile(rgba, width, height) === "photo") return colorLevels;
  const subjectArea = Math.max(1, mask.filter(Boolean).length);
  const clusterLuminance = new Map(luminances.map((entry) => [entry.index, entry.value]));
  const largeFieldLuminances = components
    .filter((component) => component.length / subjectArea > 0.08)
    .map((component) => clusterLuminance.get(cleaned[component[0]]) ?? 255);
  const maxLargeLuminance = largeFieldLuminances.length ? Math.max(...largeFieldLuminances) : 255;
  const semanticLevels: number[] = mask.map((occupied, index) => occupied && dark[index] ? 0.82 : 0);
  const sliverComponents: number[][] = [];
  for (const component of components) {
    const ratio = component.length / subjectArea;
    let level: number;
    if (subjectArea > 2_000) {
      if (ratio <= 0.0008) {
        sliverComponents.push(component);
        continue;
      }
      const lum = clusterLuminance.get(cleaned[component[0]]) ?? 255;
      level = ratio > 0.08
        ? (maxLargeLuminance - lum > 40 ? 0.26 : 0.12)
        : ratio > 0.006
          ? 0.52
          : 0.68;
    } else {
      level = ratio > 0.08 ? 0.12 : ratio > 0.006 ? 0.68 : ratio > 0.00015 ? 0.92 : 0.76;
    }
    for (const index of component) semanticLevels[index] = level;
  }
  for (const component of sliverComponents) {
    let adjacentLevel = 0;
    for (const index of component) {
      const x = index % width, y = Math.floor(index / width);
      for (const neighbor of [
        x > 0 ? index - 1 : -1,
        x + 1 < width ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y + 1 < height ? index + width : -1
      ]) {
        if (neighbor >= 0 && !dark[neighbor] && semanticLevels[neighbor] > 0 && semanticLevels[neighbor] < 0.8) {
          adjacentLevel = semanticLevels[neighbor];
          break;
        }
      }
      if (adjacentLevel > 0) break;
    }
    const resolvedLevel = adjacentLevel > 0 ? adjacentLevel : 0.82;
    for (const index of component) semanticLevels[index] = resolvedLevel;
  }
  return semanticLevels;
}

function profileSettings(profile: ReliefOptions["profile"]) {
  return {
    fast: { inputBlur: 0.3, gamma: 1, contrast: 1.12, detail: 0.5, steps: 24 },
    balanced: { inputBlur: 0.45, gamma: 0.95, contrast: 1.16, detail: 0.8, steps: 48 },
    fine: { inputBlur: 0.35, gamma: 0.92, contrast: 1.12, detail: 1.1, steps: 0 },
    photo: { inputBlur: 0.55, gamma: 0.88, contrast: 1.16, detail: 0.75, steps: 0 },
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
  const palette = colors.map((color) => {
    const [r, g, b] = parseHexColor(color);
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    return [r, g, b, chroma] as const;
  });
  const nearestPaletteIndex = (red: number, green: number, blue: number) => {
    const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
    let best = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    palette.forEach(([r, g, b, pc], index) => {
      const distance = (red - r) ** 2 + (green - g) ** 2 + (blue - b) ** 2 + (chroma - pc) ** 2 * 1.5;
      if (distance < bestDistance) {
        best = index;
        bestDistance = distance;
      }
    });
    return best;
  };
  return Array.from({ length: (width - 1) * (height - 1) }, (_, cell) => {
    if (!cellMask[cell]) return -1;
    const x = cell % (width - 1), y = Math.floor(cell / (width - 1));
    const pixel = y * width + x;
    const corners = [pixel, pixel + 1, pixel + width, pixel + width + 1];
    const motifSamples = subjectPixels ? corners.filter((sample) => subjectPixels[sample]) : corners;
    // Bei freigestellten Wortmarken dürfen weiße Hintergrundpixel nicht in
    // die Buchstabenfarbe einfließen. Gerade bei dünnen Schriften bestand
    // eine Zelle sonst überwiegend aus Hintergrund und wurde als Weiß exportiert.
    const samples = motifSamples.length ? motifSamples : corners;
    const votes = new Float64Array(palette.length);
    for (const sample of samples) {
      const alpha = rgba[sample * 4 + 3] / 255;
      if (alpha <= 0) continue;
      const colorIndex = nearestPaletteIndex(rgba[sample * 4], rgba[sample * 4 + 1], rgba[sample * 4 + 2]);
      votes[colorIndex] += alpha;
    }
    let best = 0;
    let bestVote = -1;
    for (let index = 0; index < votes.length; index += 1) {
      if (votes[index] > bestVote) {
        bestVote = votes[index];
        best = index;
      }
    }
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

export const reliefInternals = {
  buildCellMask, buildSubjectPixelMask, buildWordmarkPixelMask, buildWordmarkForegroundPixelMask, cleanSubjectPixelMask, applyBoundaryRim,
  expandPixelMask, expandPixelMaskPreservingHoles,
  buildVectorLevels, buildSmoothedBoundaryPositions, buildColorCellAssignments, buildColoredMeshes,
  buildCompositeBoundaryPositions,
  buildVectorColorMeshes, buildVectorExtrudedMesh, buildLayeredVectorRelief, smoothVectorRing, mergeMeshes,
  snapMeshZToLevels, buildOuterEdgeCellMask, stabilizeEmblemOuterWallHeights,
  assignCanonicalTriangleMaterials, buildCanonicalMeshPreview,
  enforceUniformEdgeColor,
  buildWatertightHeightMesh, buildBinaryCellHeights, flattenSteppedOuterRim, buildSteppedCellMesh, buildPreviewSurface, orientMeshLikePreview, encodeBinaryStl, encodeThreeMf,
  buildRaisedWordmarkCellHeights, flattenSteppedOuterRimPreservingRaised,
  smoothHeightField, analysePrintability, profileSettings, buildProductPixelMask, applyRaisedBorder,
  transformProductMesh, transformProductPreview, buildSolidOuterSilhouette,
  wordmarkRasterTracePreset, suggestImageProfile
};
