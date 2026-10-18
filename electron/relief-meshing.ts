import { contours } from "d3-contour";
import ManifoldModule from "manifold-3d/manifold";
import { ShapeUtils, Vector2 } from "three";
import { normalOf, type ColoredMesh, type Mesh, type Triangle, type Vec3 } from "./relief-export.js";

export function buildSmoothedBoundaryPositions(
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

export function buildCompositeBoundaryPositions(
  columns: number,
  rows: number,
  widthMm: number,
  heightMm: number,
  cellMask: boolean[],
  assignments: number[],
  colorCount: number,
  outerBoundary = buildSmoothedBoundaryPositions(columns, rows, widthMm, heightMm, cellMask, 64)
): Map<number, readonly [number, number]> {
  const samples = new Map<number, Array<readonly [number, number]>>();
  for (let colorIndex = 0; colorIndex < colorCount; colorIndex += 1) {
    const colorCells = assignments.map((assignment, cell) => cellMask[cell] && assignment === colorIndex);
    if (!colorCells.some(Boolean)) continue;
    const boundary = buildSmoothedBoundaryPositions(columns, rows, widthMm, heightMm, colorCells, 14);
    for (const [index, point] of boundary) {
      if (outerBoundary.has(index)) continue;
      const points = samples.get(index) ?? [];
      points.push(point);
      samples.set(index, points);
    }
  }
  const result = new Map(outerBoundary);
  for (const [index, points] of samples) {
    const x = points.reduce((sum, point) => sum + point[0], 0) / points.length;
    const y = points.reduce((sum, point) => sum + point[1], 0) / points.length;
    // Farbgrenzen teilen sich dieselben Meshpunkte. Ihr Mittelwert glättet
    // beide Seiten identisch und verhindert dadurch Spalten oder Überlappung.
    result.set(index, [x, y]);
  }
  return result;
}

export function buildWatertightHeightMesh(
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

export function mergeMeshes(meshes: Mesh[]): Mesh {
  const vertices: Vec3[] = [];
  const triangles: Triangle[] = [];
  for (const mesh of meshes) {
    const offset = vertices.length;
    for (const vertex of mesh.vertices) vertices.push(vertex);
    for (const [a, b, c] of mesh.triangles) triangles.push([a + offset, b + offset, c + offset]);
  }
  return { vertices, triangles };
}

export function orientMeshLikePreview(mesh: Mesh, heightMm: number): Mesh {
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

export function assignCanonicalTriangleMaterials(
  mesh: Mesh,
  assignments: number[],
  columns: number,
  rows: number,
  widthMm: number,
  heightMm: number,
  sideColorIndex: number
): number[] {
  const cellColumns = columns - 1;
  const cellRows = rows - 1;
  const materialAt = (xMm: number, yMm: number) => {
    const x = Math.max(0, Math.min(cellColumns - 1, Math.floor(xMm / widthMm * cellColumns)));
    const y = Math.max(0, Math.min(cellRows - 1, Math.floor(yMm / heightMm * cellRows)));
    const material = assignments[y * cellColumns + x];
    return material >= 0 ? material : sideColorIndex;
  };
  let maxTopZ = Number.NEGATIVE_INFINITY;
  let minTopZ = Number.POSITIVE_INFINITY;
  for (const [, , z] of mesh.vertices) {
    if (z > maxTopZ) maxTopZ = z;
    if (z > 0.05 && z < minTopZ) minTopZ = z;
  }
  const hasRaisedOutlines = maxTopZ - minTopZ > 0.25;
  const fillMaterialNear = (xMm: number, yMm: number) => {
    const cx = Math.max(0, Math.min(cellColumns - 1, Math.floor(xMm / widthMm * cellColumns)));
    const cy = Math.max(0, Math.min(cellRows - 1, Math.floor(yMm / heightMm * cellRows)));
    const direct = assignments[cy * cellColumns + cx];
    if (direct >= 0 && direct !== sideColorIndex) return direct;
    const counts = new Map<number, number>();
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cellColumns || ny >= cellRows) continue;
        const candidate = assignments[ny * cellColumns + nx];
        if (candidate >= 0 && candidate !== sideColorIndex) {
          counts.set(candidate, (counts.get(candidate) ?? 0) + 1);
        }
      }
    }
    return [...counts.entries()].sort((l, r) => r[1] - l[1])[0]?.[0] ?? (direct >= 0 ? direct : sideColorIndex);
  };
  return mesh.triangles.map((triangle) => {
    const a = mesh.vertices[triangle[0]], b = mesh.vertices[triangle[1]], c = mesh.vertices[triangle[2]];
    // Nur nach oben gerichtete Deckflächen erhalten die erkannte Motivfarbe.
    // Boden, Außenwand und senkrechte Höhenübergänge bleiben einheitlich in
    // der gewählten Seitenfarbe.
    if (normalOf(a, b, c)[2] <= 0.85) return sideColorIndex;
    const avgZ = (a[2] + b[2] + c[2]) / 3;
    const isLowerPlateau = hasRaisedOutlines && avgZ < maxTopZ - 0.15;
    const samples = [
      [1 / 3, 1 / 3, 1 / 3],
      [0.6, 0.2, 0.2],
      [0.2, 0.6, 0.2],
      [0.2, 0.2, 0.6],
      [0.45, 0.45, 0.1],
      [0.45, 0.1, 0.45],
      [0.1, 0.45, 0.45]
    ] as const;
    const counts = new Map<number, number>();
    let centerMaterial = sideColorIndex;
    samples.forEach(([wa, wb, wc], index) => {
      const sx = a[0] * wa + b[0] * wb + c[0] * wc;
      const sy = a[1] * wa + b[1] * wb + c[1] * wc;
      const material = isLowerPlateau ? fillMaterialNear(sx, sy) : materialAt(sx, sy);
      if (index === 0) centerMaterial = material;
      counts.set(material, (counts.get(material) ?? 0) + 1);
    });
    return [...counts.entries()].sort((left, right) =>
      right[1] - left[1] || Number(right[0] === centerMaterial) - Number(left[0] === centerMaterial)
    )[0]?.[0] ?? sideColorIndex;
  });
}

export function buildCanonicalMeshPreview(
  mesh: Mesh,
  widthMm: number,
  heightMm: number,
  materials: number[],
  colors: string[]
): { positions: number[]; indices: number[]; colorParts: Array<{ color: string; indices: number[] }> } {
  const positions = mesh.vertices.flatMap(([x, y, z]) => [x - widthMm / 2, z, y - heightMm / 2]);
  const colorParts = colors.map((color) => ({ color, indices: [] as number[] }));
  const indices: number[] = [];
  mesh.triangles.forEach(([a, b, c], triangleIndex) => {
    const oriented = [a, c, b];
    indices.push(...oriented);
    const material = Math.max(0, Math.min(colorParts.length - 1, materials[triangleIndex] ?? 0));
    colorParts[material]?.indices.push(...oriented);
  });
  return { positions, indices, colorParts: colorParts.filter((part) => part.indices.length) };
}

export function buildColoredMeshes(
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
  vectorSmoothing = 2,
  steppedCellHeightsOverride?: number[]
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
  const topCellHeights = steppedCellHeightsOverride
    ?? (stepped
      ? flattenSteppedOuterRim(buildBinaryCellHeights(heights, columns, rows), cellMask, columns, rows)
      : undefined);
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

export function buildVectorColorMeshes(
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

export function buildVectorExtrudedMesh(
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

let manifoldModulePromise: ReturnType<typeof ManifoldModule> | undefined;

export async function buildLayeredVectorRelief(
  columns: number,
  rows: number,
  widthMm: number,
  heightMm: number,
  heights: number[],
  cellMask: boolean[],
  smoothing = 8,
  stabilizeOuterWall = true
): Promise<Mesh> {
  const cellColumns = columns - 1;
  const cellHeights = cellMask.map((occupied, cell) => {
    if (!occupied) return 0;
    const x = cell % cellColumns;
    const y = Math.floor(cell / cellColumns);
    const vertex = y * columns + x;
    const corners = [
      Math.max(0.2, Number((Math.round(heights[vertex] / 0.2) * 0.2).toFixed(4))),
      Math.max(0.2, Number((Math.round(heights[vertex + 1] / 0.2) * 0.2).toFixed(4))),
      Math.max(0.2, Number((Math.round(heights[vertex + columns] / 0.2) * 0.2).toFixed(4))),
      Math.max(0.2, Number((Math.round(heights[vertex + columns + 1] / 0.2) * 0.2).toFixed(4)))
    ];
    let bestHeight = corners[0];
    let bestCount = 0;
    for (const candidate of corners) {
      const count = corners.filter((value) => Math.abs(value - candidate) < 1e-4).length;
      if (count > bestCount || (count === bestCount && candidate > bestHeight)) {
        bestCount = count;
        bestHeight = candidate;
      }
    }
    return bestHeight;
  });
  return buildLayeredCellVectorRelief(columns, rows, widthMm, heightMm, cellHeights, cellMask, smoothing, stabilizeOuterWall);
}

export async function buildLayeredCellVectorRelief(
  columns: number,
  rows: number,
  widthMm: number,
  heightMm: number,
  cellHeights: number[],
  cellMask: boolean[],
  smoothing = 8,
  stabilizeOuterWall = true
): Promise<Mesh> {
  const cellColumns = columns - 1;
  if (stabilizeOuterWall) stabilizeEmblemOuterWallHeights(cellHeights, cellMask, columns, rows, 1);
  const levels = [...new Set(cellHeights.filter((height) => height > 0).map((height) => Number(height.toFixed(4))))]
    .sort((a, b) => a - b);
  if (!levels.length) return { vertices: [], triangles: [] };

  manifoldModulePromise ??= ManifoldModule();
  const manifoldModule = await manifoldModulePromise;
  manifoldModule.setup();
  const solids: InstanceType<typeof manifoldModule.Manifold>[] = [];
  const pushSolid = (mask: boolean[], bottom: number, top: number) => {
    if (!mask.some(Boolean) || top <= bottom + 1e-6) return;
    const paddedColumns = cellColumns + 2;
    const paddedRows = rows + 1;
    const padded = Array(paddedColumns * paddedRows).fill(0) as number[];
    for (let y = 0; y < rows - 1; y += 1) for (let x = 0; x < cellColumns; x += 1) {
      padded[(y + 1) * paddedColumns + x + 1] = Number(mask[y * cellColumns + x]);
    }
    const geometry = contours().size([paddedColumns, paddedRows]).smooth(true).thresholds([0.5])(padded)[0];
    const polygons = geometry.coordinates.flatMap((polygon) => polygon.map((ring) =>
      smoothVectorRing(ring as Array<[number, number]>, smoothing).map(([x, y]) => [
        (x - 1) * widthMm / cellColumns,
        (y - 1) * heightMm / (rows - 1)
      ] as [number, number])
    )).filter((ring) => ring.length >= 3);
    if (!polygons.length) return;
    const overlap = bottom > 0 ? 0.01 : 0;
    const solid = new manifoldModule.CrossSection(polygons, "EvenOdd")
      // Nur minimal vereinfachen: stärkere Vereinfachung erzeugt bei
      // Wappen sichtbar abgeflachte Außenwände, auch wenn die Kontur oben
      // korrekt wirkt.
      .simplify(0.012)
      .extrude(top - bottom + overlap)
      .translate([0, 0, bottom - overlap]);
    if (!solid.isEmpty()) solids.push(solid);
  };

  // Wappen werden als echte, nicht überlappende Höhenkörper gebaut. Der alte
  // additive Aufbau extrudierte für jede Stufe erneut die komplette Maske
  // "alle Zellen ab dieser Höhe". Im Slicer/Tinkercad sah das wie übereinander
  // liegende Platten mit horizontalen Linien aus. Jetzt bekommt jede erkannte
  // Fläche genau einen Körper von der Unterseite bis zu ihrer Zielhöhe.
  for (const top of levels) {
    const mask = cellHeights.map((height, cell) => cellMask[cell] && height >= top - 1e-6);
    pushSolid(mask, 0, top);
  }
  if (!solids.length) return { vertices: [], triangles: [] };
  const unified = manifoldModule.Manifold.union(solids);
  const output = unified.getMesh();
  const vertices: Vec3[] = [];
  for (let offset = 0; offset < output.vertProperties.length; offset += output.numProp) {
    vertices.push([
      output.vertProperties[offset],
      output.vertProperties[offset + 1],
      output.vertProperties[offset + 2]
    ]);
  }
  const triangles: Triangle[] = [];
  for (let offset = 0; offset < output.triVerts.length; offset += 3) {
    triangles.push([output.triVerts[offset], output.triVerts[offset + 1], output.triVerts[offset + 2]]);
  }
  unified.delete();
  solids.forEach((solid) => solid.delete());
  return weldMeshVertices(snapMeshZToLevels({ vertices, triangles }, [0, ...levels]), 5);
}

export function snapMeshZToLevels(mesh: Mesh, levels: number[], epsilon = 0.035): Mesh {
  const sorted = [...new Set(levels.map((level) => Number(level.toFixed(4))))].sort((a, b) => a - b);
  return {
    vertices: mesh.vertices.map(([x, y, z]) => {
      let nearest = z;
      let distance = Number.POSITIVE_INFINITY;
      for (const level of sorted) {
        const candidateDistance = Math.abs(z - level);
        if (candidateDistance < distance) {
          distance = candidateDistance;
          nearest = level;
        }
      }
      return [x, y, distance <= epsilon ? nearest : z] as const;
    }),
    triangles: mesh.triangles
  };
}

export function buildOuterEdgeCellMask(
  cellMask: boolean[],
  columns: number,
  rows: number,
  radius = 4
): boolean[] {
  const cellColumns = columns - 1;
  const cellRows = rows - 1;
  const result = Array(cellMask.length).fill(false) as boolean[];
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
    result[index] = nearOuterEdge;
  }
  return result;
}

export function stabilizeEmblemOuterWallHeights(
  cellHeights: number[],
  cellMask: boolean[],
  columns: number,
  rows: number,
  radius = 3
): void {
  const cellColumns = columns - 1;
  const cellRows = rows - 1;
  let maximum = 0;
  for (let index = 0; index < cellHeights.length; index += 1) {
    if (cellMask[index]) maximum = Math.max(maximum, cellHeights[index]);
  }
  if (maximum <= 0) return;
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
    if (nearOuterEdge) cellHeights[index] = maximum;
  }
}

export function weldMeshVertices(mesh: Mesh, precision = 6): Mesh {
  const vertices: Vec3[] = [];
  const remap = new Uint32Array(mesh.vertices.length);
  const byPosition = new Map<string, number>();
  mesh.vertices.forEach((vertex, index) => {
    const key = vertex.map((value) => value.toFixed(precision)).join(":");
    let target = byPosition.get(key);
    if (target === undefined) {
      target = vertices.length;
      vertices.push(vertex);
      byPosition.set(key, target);
    }
    remap[index] = target;
  });
  return {
    vertices,
    triangles: mesh.triangles.map(([a, b, c]) => [remap[a], remap[b], remap[c]])
  };
}

function ringPerimeter(ring: Array<[number, number]>): number {
  return ring.reduce((sum, point, index) => {
    const next = ring[(index + 1) % ring.length];
    return sum + Math.hypot(next[0] - point[0], next[1] - point[1]);
  }, 0);
}

function ringBounds(ring: Array<[number, number]>): { width: number; height: number } {
  let minX = Number.POSITIVE_INFINITY, maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY, maxY = Number.NEGATIVE_INFINITY;
  for (const [x, y] of ring) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { width: maxX - minX, height: maxY - minY };
}

function resampleClosedRing(source: Array<[number, number]>, spacing: number): Array<[number, number]> {
  if (source.length < 4) return source;
  const perimeter = ringPerimeter(source);
  const targetCount = Math.max(source.length, Math.min(4096, Math.ceil(perimeter / Math.max(0.25, spacing))));
  const result: Array<[number, number]> = [];
  let edgeIndex = 0;
  let edgeStart = source[0];
  let edgeEnd = source[1];
  let edgeLength = Math.hypot(edgeEnd[0] - edgeStart[0], edgeEnd[1] - edgeStart[1]);
  let walkedBeforeEdge = 0;
  for (let sample = 0; sample < targetCount; sample += 1) {
    const targetDistance = sample * perimeter / targetCount;
    while (walkedBeforeEdge + edgeLength < targetDistance && edgeIndex < source.length - 1) {
      walkedBeforeEdge += edgeLength;
      edgeIndex += 1;
      edgeStart = source[edgeIndex];
      edgeEnd = source[(edgeIndex + 1) % source.length];
      edgeLength = Math.hypot(edgeEnd[0] - edgeStart[0], edgeEnd[1] - edgeStart[1]);
    }
    const local = edgeLength > 1e-6 ? (targetDistance - walkedBeforeEdge) / edgeLength : 0;
    result.push([
      edgeStart[0] + (edgeEnd[0] - edgeStart[0]) * local,
      edgeStart[1] + (edgeEnd[1] - edgeStart[1]) * local
    ]);
  }
  return result;
}

export function smoothVectorRing(source: Array<[number, number]>, smoothing = 2): Array<[number, number]> {
  let ring = source.slice(0, -1);
  if (ring.length < 4) return ring;
  ring = ring.filter((point, index) => {
    const previous = ring[(index - 1 + ring.length) % ring.length];
    return Math.hypot(point[0] - previous[0], point[1] - previous[1]) > 1e-3;
  });
  if (ring.length < 4) return ring;
  const initialPerimeter = ringPerimeter(ring);
  const bounds = ringBounds(ring);
  const isLargeEmblemContour = initialPerimeter > 180 || Math.max(bounds.width, bounds.height) > 72;
  const reduced: Array<[number, number]> = [];
  const minimumPointDistance = isLargeEmblemContour ? 2.2 : 1.15;
  for (const point of ring) {
    const previous = reduced.at(-1);
    // Lange Kanten werden vor der Kurvenglättung leicht ausgedünnt. Zwei
    // Chaikin-Schritte unterteilen die resultierenden Sehnen anschließend bis
    // deutlich unter Düsenauflösung; damit verschwinden auch die im Slicer
    // sichtbaren senkrechten Facetten an runden Wappenrändern.
    if (!previous || Math.hypot(point[0] - previous[0], point[1] - previous[1]) >= minimumPointDistance) reduced.push(point);
  }
  ring = reduced.length >= 4 ? reduced : ring;
  const chaikinPasses = Math.min(isLargeEmblemContour ? 3 : 2, Math.max(0, Math.round(smoothing)));
  for (let pass = 0; pass < chaikinPasses; pass += 1) {
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
  if (isLargeEmblemContour) ring = resampleClosedRing(ring, 0.75);
  // Stärken oberhalb von 2 beruhigen die bereits fein unterteilte Kontur.
  // Mehrere kleine Laplace-Schritte entfernen gezielt die kurzen
  // Links-rechts-Oszillationen des Pixelrasters. Nur mehr Polygone würden
  // diese Zacken lediglich feiner abbilden und zugleich die Exportgrenze von
  // 250.000 Dreiecken gefährden.
  const laplacePasses = Math.round(smoothing) + (isLargeEmblemContour ? 6 : 0);
  for (let pass = 2; pass < laplacePasses; pass += 1) {
    ring = ring.map((current, index) => {
      const previous = ring[(index - 1 + ring.length) % ring.length];
      const following = ring[(index + 1) % ring.length];
      return [
        previous[0] * 0.125 + current[0] * 0.75 + following[0] * 0.125,
        previous[1] * 0.125 + current[1] * 0.75 + following[1] * 0.125
      ];
    });
  }
  if (isLargeEmblemContour && ring.length >= 32) {
    // Flache Schrägen (z. B. Wappenseiten mit 1 Pixel Versatz alle 12–18 Zeilen)
    // behalten nach lokaler 3-Punkt-Glättung eine langwellige Raster-Treppe.
    // Ein eckenerhaltender Sehnenfilter glättet ausschließlich Abschnitte, deren
    // Abweichung unterhalb einer einzelnen Rasterstufe (<= 0,75 Zellen) liegt.
    const span = 9;
    for (let pass = 0; pass < 3; pass += 1) {
      ring = ring.map((current, index) => {
        const behind = ring[(index - span + ring.length) % ring.length];
        const ahead = ring[(index + span) % ring.length];
        const mx = (behind[0] + ahead[0]) * 0.5;
        const my = (behind[1] + ahead[1]) * 0.5;
        const deviation = Math.hypot(current[0] - mx, current[1] - my);
        if (deviation > 0.75) return current;
        const weight = 0.45 * (1 - deviation / 0.75);
        return [
          current[0] * (1 - weight) + mx * weight,
          current[1] * (1 - weight) + my * weight
        ] as [number, number];
      });
    }
    ring = resampleClosedRing(ring, 0.85);
  }
  return ring;
}

export function buildBinaryCellHeights(heights: number[], columns: number, rows: number): number[] {
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

export function flattenSteppedOuterRim(
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

export function buildRaisedWordmarkCellHeights(
  wordmarkPixels: boolean[],
  cellMask: boolean[],
  columns: number,
  rows: number,
  baseHeight: number,
  raisedHeight: number
): { heights: number[]; raisedCells: boolean[] } {
  const cellColumns = columns - 1, cellRows = rows - 1;
  const heights = Array(cellColumns * cellRows).fill(baseHeight) as number[];
  const raisedCells = Array(cellColumns * cellRows).fill(false) as boolean[];
  for (let y = 0; y < cellRows; y += 1) {
    for (let x = 0; x < cellColumns; x += 1) {
      const cell = y * cellColumns + x;
      if (!cellMask[cell]) continue;
      const vertex = y * columns + x;
      const occupied =
        Number(wordmarkPixels[vertex])
        + Number(wordmarkPixels[vertex + 1])
        + Number(wordmarkPixels[vertex + columns])
        + Number(wordmarkPixels[vertex + columns + 1]);
      // Bei Logos mit Text ist die Semantik eindeutig: Hintergrund/Träger
      // bleibt unten, erkannte Schrift und Signet liegen separat darüber.
      // Mindestens zwei berührte Zellpunkte ergeben eine ruhigere Kontur.
      // Ein einzelner Antialias-Pixel erzeugte bei kleinen Rundschriften
      // schnell klumpige oder scheinbar verschmierte Buchstaben.
      if (occupied >= 2) {
        heights[cell] = raisedHeight;
        raisedCells[cell] = true;
      }
    }
  }
  return { heights, raisedCells };
}

export function flattenSteppedOuterRimPreservingRaised(
  cellHeights: number[],
  cellMask: boolean[],
  raisedCells: boolean[],
  columns: number,
  rows: number,
  radius = 2
): number[] {
  const flattened = flattenSteppedOuterRim(cellHeights, cellMask, columns, rows, radius);
  for (let index = 0; index < flattened.length; index += 1) {
    if (raisedCells[index]) flattened[index] = cellHeights[index];
  }
  return flattened;
}

export function buildSteppedCellMesh(
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

export function buildPreviewSurface(
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
  vectorSmoothing = 2,
  steppedCellHeightsOverride?: number[]
): { positions: number[]; indices: number[]; colorParts: Array<{ color: string; indices: number[] }> } {
  if (stepped && cellMask && (!colorAssignments || !colors.length)) {
    const mesh = buildSteppedCellMesh(
      columns, rows, widthMm, heightMm,
      steppedCellHeightsOverride ?? flattenSteppedOuterRim(buildBinaryCellHeights(heights, columns, rows), cellMask, columns, rows),
      cellMask
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
      vectorSmoothing,
      steppedCellHeightsOverride
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
