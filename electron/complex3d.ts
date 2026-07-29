import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { spawn } from "node:child_process";
import { join } from "node:path";

export const complex3dModel = {
  id: "hunyuan3d-mlx-shape-small",
  name: "Hunyuan3D Shape Small (MLX)",
  version: "b7536809d38ad13fe6a9b7769a41fd5d42e520df",
  sizeBytes: 3_819_958_234,
  requiredFreeBytes: 5_500_000_000,
  sourceUrl: "https://huggingface.co/zimengxiong/hunyuan3d-mlx-shape-small",
  licenseUrl: "https://github.com/Tencent-Hunyuan/Hunyuan3D-2/blob/main/LICENSE",
  codeUrl: "https://github.com/ZimengXiong/Hunyuan3D-Swift",
  weightsSha256: "3cc66f3bea33e4062b7dbc875ffe1d70c4888914aec3e91b60f94e9bd01b522b",
  notice: "Das Modell unterliegt der Tencent Hunyuan Community License. Die Swift-Implementierung steht unter MIT."
} as const;

const base = `https://huggingface.co/zimengxiong/hunyuan3d-mlx-shape-small/resolve/${complex3dModel.version}`;

export function modelDirectory(userData: string): string {
  return join(userData, "models", complex3dModel.id);
}

export async function getComplex3dStatus(userData: string, workerPath: string, acceptedAt?: string) {
  const directory = modelDirectory(userData);
  const weights = join(directory, "model.fp16.safetensors");
  const config = join(directory, "config.yaml");
  const installed = existsSync(weights) && existsSync(config);
  return {
    ...complex3dModel,
    installed,
    workerAvailable: existsSync(workerPath),
    accepted: Boolean(acceptedAt),
    acceptedAt: acceptedAt ?? null,
    installedBytes: installed ? (await stat(weights)).size : 0
  };
}

async function sha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function downloadFile(url: string, target: string, expectedBytes: number | undefined, signal: AbortSignal, progress: (loaded: number) => void) {
  const temporary = `${target}.part`;
  let offset = 0;
  try { offset = (await stat(temporary)).size; } catch { /* neuer Download */ }
  const response = await fetch(url, { signal, headers: offset ? { Range: `bytes=${offset}-` } : undefined });
  if (!response.ok || !response.body) throw new Error(`Modelldownload fehlgeschlagen (HTTP ${response.status}).`);
  if (offset && response.status !== 206) {
    await rm(temporary, { force: true });
    return downloadFile(url, target, expectedBytes, signal, progress);
  }
  const output = createWriteStream(temporary, { flags: offset ? "a" : "w", mode: 0o600 });
  let loaded = offset;
  const source = Readable.fromWeb(response.body as never);
  source.on("data", (chunk: Buffer) => { loaded += chunk.length; progress(loaded); });
  await pipeline(source, output);
  if (expectedBytes && loaded !== expectedBytes) throw new Error(`Der Download ist unvollständig (${loaded} statt ${expectedBytes} Bytes).`);
  await rename(temporary, target);
}

export async function downloadComplex3dModel(
  userData: string,
  signal: AbortSignal,
  onProgress: (progress: { phase: string; loadedBytes: number; totalBytes: number; progress: number }) => void
) {
  const directory = modelDirectory(userData);
  await mkdir(directory, { recursive: true });
  const configPath = join(directory, "config.yaml");
  const weightsPath = join(directory, "model.fp16.safetensors");
  await downloadFile(`${base}/config.yaml`, configPath, 1628, signal, () => undefined);
  await downloadFile(`${base}/model.fp16.safetensors`, weightsPath, complex3dModel.sizeBytes, signal, (loadedBytes) => {
    onProgress({ phase: "Lokales 3D-Modell wird geladen", loadedBytes, totalBytes: complex3dModel.sizeBytes, progress: loadedBytes / complex3dModel.sizeBytes * 100 });
  });
  onProgress({ phase: "Prüfsumme wird kontrolliert", loadedBytes: complex3dModel.sizeBytes, totalBytes: complex3dModel.sizeBytes, progress: 99 });
  const digest = await sha256(weightsPath);
  if (digest !== complex3dModel.weightsSha256) {
    await rm(weightsPath, { force: true });
    throw new Error("Die SHA-256-Prüfsumme der Modellgewichte stimmt nicht. Die Datei wurde entfernt.");
  }
  return directory;
}

export async function removeComplex3dModel(userData: string) {
  await rm(modelDirectory(userData), { recursive: true, force: true });
}

type GlbMesh = { positions: number[]; indices: number[] };
type GlbAccessor = { bufferView: number; byteOffset?: number; componentType: 5125 | 5126; count: number };
type GlbJson = {
  meshes: Array<{ primitives: Array<{ attributes: { POSITION: number }; indices: number }> }>;
  accessors: GlbAccessor[];
  bufferViews: Array<{ byteOffset?: number }>;
};

export function parseSimpleGlb(buffer: Buffer): GlbMesh {
  if (buffer.readUInt32LE(0) !== 0x46546c67 || buffer.readUInt32LE(4) !== 2) throw new Error("Der lokale Worker hat keine gültige GLB-Datei erzeugt.");
  let cursor = 12;
  let json: GlbJson | undefined;
  let binary: Buffer | undefined;
  while (cursor + 8 <= buffer.length) {
    const length = buffer.readUInt32LE(cursor);
    const type = buffer.readUInt32LE(cursor + 4);
    const chunk = buffer.subarray(cursor + 8, cursor + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString("utf8").replace(/\0+$/g, "").trim()) as GlbJson;
    if (type === 0x004e4942) binary = chunk;
    cursor += 8 + length;
  }
  if (!json || !binary) throw new Error("GLB enthält keine lesbare Geometrie.");
  const primitive = json.meshes?.[0]?.primitives?.[0];
  const positionAccessor = json.accessors?.[primitive?.attributes?.POSITION];
  const indexAccessor = json.accessors?.[primitive?.indices];
  const readAccessor = (accessor: GlbAccessor, components: number) => {
    const view = json.bufferViews[accessor.bufferView];
    const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const values: number[] = [];
    for (let index = 0; index < accessor.count * components; index += 1) {
      const offset = start + index * (accessor.componentType === 5125 ? 4 : 4);
      values.push(accessor.componentType === 5126 ? binary!.readFloatLE(offset) : binary!.readUInt32LE(offset));
    }
    return values;
  };
  return { positions: readAccessor(positionAccessor, 3), indices: readAccessor(indexAccessor, 1) };
}

export function normalizeMesh(mesh: GlbMesh, targetMm = 120): GlbMesh {
  const mins = [Infinity, Infinity, Infinity], maxs = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length; i += 3) for (let axis = 0; axis < 3; axis += 1) {
    mins[axis] = Math.min(mins[axis], mesh.positions[i + axis]);
    maxs[axis] = Math.max(maxs[axis], mesh.positions[i + axis]);
  }
  const scale = targetMm / Math.max(maxs[0] - mins[0], maxs[1] - mins[1], maxs[2] - mins[2]);
  const positions: number[] = [];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    positions.push((mesh.positions[i] - (mins[0] + maxs[0]) / 2) * scale);
    positions.push((mesh.positions[i + 2] - mins[2]) * scale);
    positions.push((mesh.positions[i + 1] - (mins[1] + maxs[1]) / 2) * scale);
  }
  return { positions, indices: mesh.indices };
}

export function encodeMeshStl(mesh: GlbMesh): Buffer {
  const triangleCount = Math.floor(mesh.indices.length / 3);
  const output = Buffer.alloc(84 + triangleCount * 50);
  output.write("AI Print Studio Complex 3D", 0, "ascii");
  output.writeUInt32LE(triangleCount, 80);
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const offset = 84 + triangle * 50;
    for (let vertex = 0; vertex < 3; vertex += 1) {
      const source = mesh.indices[triangle * 3 + vertex] * 3;
      for (let axis = 0; axis < 3; axis += 1) output.writeFloatLE(mesh.positions[source + axis], offset + 12 + vertex * 12 + axis * 4);
    }
  }
  return output;
}

export async function generateComplexMesh(workerPath: string, userData: string, imagePath: string, outputGlb: string, signal: AbortSignal) {
  const weights = modelDirectory(userData);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(workerPath, ["shape", imagePath, "-o", outputGlb, "--weights", weights], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    const abort = () => child.kill("SIGTERM");
    signal.addEventListener("abort", abort, { once: true });
    child.once("error", reject);
    child.once("exit", (code) => {
      signal.removeEventListener("abort", abort);
      if (signal.aborted) reject(new Error("Lokale 3D-Erstellung abgebrochen."));
      else if (code === 0) resolve();
      else reject(new Error(`Lokales 3D-Modell fehlgeschlagen${stderr ? `: ${stderr.slice(-500)}` : "."}`));
    });
  });
  return normalizeMesh(parseSimpleGlb(await readFile(outputGlb)));
}
