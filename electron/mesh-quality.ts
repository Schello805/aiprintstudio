export type MeshGeometry = {
  vertices: ReadonlyArray<readonly [number, number, number]>;
  triangles: ReadonlyArray<readonly [number, number, number]>;
};

export type GeometryValidationReport = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: { boundaryEdges: number; nonManifoldEdges: number; degenerateTriangles: number; invalidTriangles: number; duplicateTriangles: number; connectedComponents: number };
};

export type ContourQualityReport = { score: number; shortEdgeRatio: number; sliverTriangleRatio: number; edgeLengthVariation: number };

export function validateMeshGeometry(mesh: MeshGeometry): GeometryValidationReport {
  const errors: string[] = [], warnings: string[] = [];
  const edgeUse = new Map<string, number>(), triangleKeys = new Set<string>();
  const parents = new Int32Array(mesh.triangles.length), firstTriangleByVertex = new Int32Array(mesh.vertices.length).fill(-1);
  let invalidTriangles = 0, degenerateTriangles = 0, duplicateTriangles = 0;
  parents.forEach((_value, index) => { parents[index] = index; });
  const find = (value: number): number => {
    let root = value;
    while (parents[root] !== root) root = parents[root];
    while (parents[value] !== value) { const next = parents[value]; parents[value] = root; value = next; }
    return root;
  };
  const unite = (left: number, right: number) => { const a = find(left), b = find(right); if (a !== b) parents[b] = a; };
  const finiteVertices = mesh.vertices.every((vertex) => vertex.every(Number.isFinite));
  if (!finiteVertices) errors.push("Mindestens ein Eckpunkt enthält keinen gültigen Zahlenwert.");
  mesh.triangles.forEach((triangle, triangleIndex) => {
    if (!triangle.every((index) => Number.isInteger(index) && index >= 0 && index < mesh.vertices.length) || new Set(triangle).size !== 3) { invalidTriangles += 1; return; }
    const [a, b, c] = triangle.map((index) => mesh.vertices[index]);
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    if (Math.hypot(ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]) <= 1e-9) degenerateTriangles += 1;
    const triangleKey = [...triangle].sort((left, right) => left - right).join(":");
    if (triangleKeys.has(triangleKey)) duplicateTriangles += 1;
    triangleKeys.add(triangleKey);
    for (const [left, right] of [[triangle[0], triangle[1]], [triangle[1], triangle[2]], [triangle[2], triangle[0]]]) {
      const key = left < right ? `${left}:${right}` : `${right}:${left}`;
      edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
    }
    for (const vertex of triangle) { if (firstTriangleByVertex[vertex] >= 0) unite(triangleIndex, firstTriangleByVertex[vertex]); else firstTriangleByVertex[vertex] = triangleIndex; }
  });
  const boundaryEdges = [...edgeUse.values()].filter((uses) => uses === 1).length;
  const nonManifoldEdges = [...edgeUse.values()].filter((uses) => uses > 2).length;
  const connectedComponents = new Set(mesh.triangles.map((_triangle, index) => find(index))).size;
  if (invalidTriangles) errors.push(`${invalidTriangles} Dreiecke verweisen auf ungültige Eckpunkte.`);
  if (degenerateTriangles) errors.push(`${degenerateTriangles} Dreiecke besitzen keine Fläche.`);
  if (duplicateTriangles) errors.push(`${duplicateTriangles} Dreiecke sind doppelt vorhanden.`);
  if (boundaryEdges) warnings.push(`${boundaryEdges} offene Netzkanten wurden gefunden.`);
  if (nonManifoldEdges) warnings.push(`${nonManifoldEdges} mehrfach belegte Kanten wurden gefunden.`);
  if (connectedComponents > 24) warnings.push(`${connectedComponents} getrennte Körper können den Import im Slicer erschweren.`);
  return { valid: finiteVertices && errors.length === 0, errors, warnings, stats: { boundaryEdges, nonManifoldEdges, degenerateTriangles, invalidTriangles, duplicateTriangles, connectedComponents } };
}

export function removeInvalidTriangles<T extends MeshGeometry>(mesh: T): T {
  const seen = new Set<string>();
  const triangles = mesh.triangles.filter((triangle) => {
    if (new Set(triangle).size !== 3 || triangle.some((index) => index < 0 || index >= mesh.vertices.length)) return false;
    const key = [...triangle].sort((left, right) => left - right).join(":");
    if (seen.has(key)) return false;
    const [a, b, c] = triangle.map((index) => mesh.vertices[index]);
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    if (Math.hypot(ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]) <= 1e-9) return false;
    seen.add(key); return true;
  });
  return { ...mesh, triangles } as T;
}

export function analyseContourQuality(mesh: MeshGeometry, nozzleMm: number): ContourQualityReport {
  const contourLengths: number[] = [], contourEdges = new Set<string>();
  let sliverTriangles = 0;
  for (const triangle of mesh.triangles) {
    const points = triangle.map((index) => mesh.vertices[index]);
    const edges = [[0, 1], [1, 2], [2, 0]];
    const lengths = edges.map(([left, right]) => Math.hypot(points[left][0] - points[right][0], points[left][1] - points[right][1], points[left][2] - points[right][2]));
    const [a, b, c] = points;
    const areaTwice = Math.hypot((b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
    if (areaTwice / Math.max(1e-9, Math.max(...lengths) ** 2) < 0.004) sliverTriangles += 1;
    edges.forEach(([left, right], edgeIndex) => {
      if (Math.abs(points[left][2] - points[right][2]) > 1e-5) return;
      const key = triangle[left] < triangle[right] ? `${triangle[left]}:${triangle[right]}` : `${triangle[right]}:${triangle[left]}`;
      if (!contourEdges.has(key)) { contourEdges.add(key); contourLengths.push(lengths[edgeIndex]); }
    });
  }
  const mean = contourLengths.reduce((sum, length) => sum + length, 0) / Math.max(1, contourLengths.length);
  const variation = Math.sqrt(contourLengths.reduce((sum, length) => sum + (length - mean) ** 2, 0) / Math.max(1, contourLengths.length)) / Math.max(1e-9, mean);
  const shortEdgeRatio = contourLengths.filter((length) => length < nozzleMm / 8).length / Math.max(1, contourLengths.length);
  const sliverTriangleRatio = sliverTriangles / Math.max(1, mesh.triangles.length);
  const score = Math.max(0, Math.min(100, Math.round(100 - shortEdgeRatio * 120 - sliverTriangleRatio * 160 - Math.max(0, variation - 1.5) * 4)));
  return { score, shortEdgeRatio, sliverTriangleRatio, edgeLengthVariation: variation };
}
