export type CadPrimitive = {
  type: "box" | "cylinder" | "roof" | "leaf";
  name: string;
  position: [number, number, number];
  size: [number, number, number];
  rotation?: [number, number, number];
};

export type CadPlan = {
  title: string;
  widthMm: number;
  depthMm: number;
  heightMm: number;
  primitives: CadPrimitive[];
};

type Vec3 = [number, number, number];
type Triangle = [Vec3, Vec3, Vec3];

export function validateCadPlan(value: unknown): CadPlan {
  if (!value || typeof value !== "object") throw new Error("OpenAI hat keinen gültigen CAD-Bauplan geliefert.");
  const plan = value as Partial<CadPlan>;
  if (typeof plan.title !== "string" || !Array.isArray(plan.primitives) || !plan.primitives.length || plan.primitives.length > 80) {
    throw new Error("Der CAD-Bauplan ist leer oder zu komplex.");
  }
  if (
    plan.title.trim().length < 1 ||
    plan.title.length > 120 ||
    [plan.widthMm, plan.depthMm, plan.heightMm].some((dimension) =>
      typeof dimension !== "number" || !Number.isFinite(dimension) || dimension < 5 || dimension > 300
    )
  ) {
    throw new Error("Der CAD-Bauplan enthält ungültige Gesamtmaße.");
  }
  for (const primitive of plan.primitives) {
    if (!["box", "cylinder", "roof", "leaf"].includes(primitive.type) || !Array.isArray(primitive.position) || !Array.isArray(primitive.size)) {
      throw new Error("Der CAD-Bauplan enthält eine unbekannte Form.");
    }
    if (primitive.rotation !== undefined && (!Array.isArray(primitive.rotation) || primitive.rotation.length !== 3)) {
      throw new Error("Der CAD-Bauplan enthält eine ungültige Drehung.");
    }
    if ([...primitive.position, ...primitive.size].some((number) => !Number.isFinite(number) || Math.abs(number) > 300)
      || (primitive.rotation ?? [0, 0, 0]).some((number) => !Number.isFinite(number) || Math.abs(number) > 360)) {
      throw new Error("Der CAD-Bauplan enthält ungültige Abmessungen.");
    }
    if (primitive.size.some((number) => number < 1.2)) throw new Error("OpenAI hat ein Bauteil unter 1,2 mm erzeugt.");
  }
  return plan as CadPlan;
}

export function buildCadPlanningRequest(instruction: string, existingPlan?: CadPlan): string {
  const normalized = instruction.trim();
  if (normalized.length < 3 || normalized.length > 800) {
    throw new Error("Die Anweisung muss zwischen 3 und 800 Zeichen enthalten.");
  }
  const rules = `Use additive boxes, vertical cylinders, triangular-prism roofs, and curved leaf solids. Each primitive has rotation [x,y,z] in degrees; use [0,0,0] when no rotation is needed. For leaf, position is the attachment point and size is [length,width,thickness]. Leaf creates a tapered, curved, printable organic blade extending along its local X axis. Use multiple rotated leaf solids for palms, foliage, feathers, petals, curved branches, and decorative organic silhouettes. NEVER approximate requested curved or detailed leaves with boxes. If a follow-up rejects rectangles, replace the affected box primitives with leaf primitives. All coordinates and sizes are millimeters. Put the object on z=0, keep every feature connected or intersecting, use at least 1.2 mm thickness, prefer a stable flat base, and model requested windows/doors as raised frames or panels. Preserve exact requested counts. Keep it under 80 primitives.`;
  if (!existingPlan) return `Create a printable constructive CAD plan for this request: ${normalized}
${rules}`;
  const validated = validateCadPlan(existingPlan);
  return `Revise the existing printable CAD plan according to this follow-up instruction: ${normalized}
Return the complete replacement plan, not a patch. Preserve every existing feature that the instruction does not explicitly change. Keep names and coordinates stable where possible.
Existing CAD plan:
${JSON.stringify(validated)}
${rules}`;
}

export function encodeCadStl(plan: CadPlan): Buffer {
  const triangles = plan.primitives.flatMap((primitive) => primitiveTriangles(primitive));
  const buffer = Buffer.alloc(84 + triangles.length * 50);
  buffer.write(`AI Print Studio CAD: ${plan.title}`.slice(0, 80), 0, "ascii");
  buffer.writeUInt32LE(triangles.length, 80);
  let offset = 84;
  for (const [a, b, c] of triangles) {
    const normal = normalOf(a, b, c);
    for (const value of [...normal, ...a, ...b, ...c]) {
      buffer.writeFloatLE(value, offset); offset += 4;
    }
    buffer.writeUInt16LE(0, offset); offset += 2;
  }
  return buffer;
}

function primitiveTriangles(primitive: CadPrimitive): Triangle[] {
  if (primitive.type === "cylinder") return cylinderTriangles(primitive);
  if (primitive.type === "roof") return roofTriangles(primitive);
  if (primitive.type === "leaf") return leafTriangles(primitive);
  return boxTriangles(primitive);
}

function leafTriangles({ position, size: [length, width, thickness], rotation = [0, 0, 0] }: CadPrimitive): Triangle[] {
  const segments = 18;
  const lower: Array<[Vec3, Vec3]> = [];
  const upper: Array<[Vec3, Vec3]> = [];
  const transform = (point: Vec3): Vec3 => {
    const radians = rotation.map((angle) => angle * Math.PI / 180);
    let [x, y, z] = point;
    [y, z] = [y * Math.cos(radians[0]) - z * Math.sin(radians[0]), y * Math.sin(radians[0]) + z * Math.cos(radians[0])];
    [x, z] = [x * Math.cos(radians[1]) + z * Math.sin(radians[1]), -x * Math.sin(radians[1]) + z * Math.cos(radians[1])];
    [x, y] = [x * Math.cos(radians[2]) - y * Math.sin(radians[2]), x * Math.sin(radians[2]) + y * Math.cos(radians[2])];
    return [x + position[0], y + position[1], z + position[2]];
  };
  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    const taper = Math.pow(Math.sin(Math.PI * t), 0.72);
    const halfWidth = Math.max(thickness * 0.35, width * 0.5 * taper);
    const arch = Math.sin(Math.PI * t) * length * 0.12 - t * t * length * 0.08;
    lower.push([
      transform([length * t, -halfWidth, arch]),
      transform([length * t, halfWidth, arch])
    ]);
    upper.push([
      transform([length * t, -halfWidth, arch + thickness]),
      transform([length * t, halfWidth, arch + thickness])
    ]);
  }
  const triangles: Triangle[] = [];
  for (let index = 0; index < segments; index += 1) {
    const [bl0, br0] = lower[index], [bl1, br1] = lower[index + 1];
    const [tl0, tr0] = upper[index], [tl1, tr1] = upper[index + 1];
    triangles.push(
      [tl0, tr0, tr1], [tl0, tr1, tl1],
      [bl0, br1, br0], [bl0, bl1, br1],
      [bl0, tl1, bl1], [bl0, tl0, tl1],
      [br0, br1, tr1], [br0, tr1, tr0]
    );
  }
  const [bottomLeft, bottomRight] = lower[0], [topLeft, topRight] = upper[0];
  const [endBottomLeft, endBottomRight] = lower[segments], [endTopLeft, endTopRight] = upper[segments];
  triangles.push(
    [bottomLeft, bottomRight, topRight], [bottomLeft, topRight, topLeft],
    [endBottomLeft, endTopRight, endBottomRight], [endBottomLeft, endTopLeft, endTopRight]
  );
  return triangles;
}

function boxTriangles({ position: [x, y, z], size: [w, d, h] }: CadPrimitive): Triangle[] {
  const v: Vec3[] = [
    [x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z],
    [x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]
  ];
  return faces(v, [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]]);
}

function roofTriangles({ position: [x, y, z], size: [w, d, h] }: CadPrimitive): Triangle[] {
  const v: Vec3[] = [
    [x, y, z], [x + w, y, z], [x + w / 2, y, z + h],
    [x, y + d, z], [x + w, y + d, z], [x + w / 2, y + d, z + h]
  ];
  return faces(v, [[0, 2, 1], [3, 4, 5], [0, 1, 4], [0, 4, 3], [1, 2, 5], [1, 5, 4], [2, 0, 3], [2, 3, 5]]);
}

function cylinderTriangles({ position: [x, y, z], size: [diameter, , height] }: CadPrimitive): Triangle[] {
  const segments = 48, radius = diameter / 2;
  const bottom: Vec3 = [x, y, z], top: Vec3 = [x, y, z + height];
  const triangles: Triangle[] = [];
  for (let index = 0; index < segments; index += 1) {
    const a = index / segments * Math.PI * 2, b = (index + 1) / segments * Math.PI * 2;
    const p1: Vec3 = [x + Math.cos(a) * radius, y + Math.sin(a) * radius, z];
    const p2: Vec3 = [x + Math.cos(b) * radius, y + Math.sin(b) * radius, z];
    const p3: Vec3 = [p1[0], p1[1], z + height], p4: Vec3 = [p2[0], p2[1], z + height];
    triangles.push([bottom, p2, p1], [top, p3, p4], [p1, p2, p4], [p1, p4, p3]);
  }
  return triangles;
}

function faces(vertices: Vec3[], indices: number[][]): Triangle[] {
  return indices.map(([a, b, c]) => [vertices[a], vertices[b], vertices[c]]);
}

function normalOf(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz) || 1;
  return [nx / length, ny / length, nz / length];
}
