export type CadPrimitive = {
  type: "box" | "cylinder" | "roof";
  name: string;
  position: [number, number, number];
  size: [number, number, number];
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
  for (const primitive of plan.primitives) {
    if (!["box", "cylinder", "roof"].includes(primitive.type) || !Array.isArray(primitive.position) || !Array.isArray(primitive.size)) {
      throw new Error("Der CAD-Bauplan enthält eine unbekannte Form.");
    }
    if ([...primitive.position, ...primitive.size].some((number) => !Number.isFinite(number) || Math.abs(number) > 300)) {
      throw new Error("Der CAD-Bauplan enthält ungültige Abmessungen.");
    }
    if (primitive.size.some((number) => number < 1.2)) throw new Error("OpenAI hat ein Bauteil unter 1,2 mm erzeugt.");
  }
  return plan as CadPlan;
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
  return boxTriangles(primitive);
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
