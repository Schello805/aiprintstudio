import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";

const execFileAsync = promisify(execFile);
const workspace = await mkdtemp(join(tmpdir(), "ai-print-depth-smoke-"));
try {
  const input = join(workspace, "input.png");
  const output = join(workspace, "depth.png");
  const pixels = Buffer.alloc(128 * 128 * 3);
  for (let y = 0; y < 128; y += 1) {
    for (let x = 0; x < 128; x += 1) {
      const offset = (y * 128 + x) * 3;
      pixels[offset] = Math.round(x / 127 * 255);
      pixels[offset + 1] = Math.round(y / 127 * 255);
      pixels[offset + 2] = x > 32 && x < 96 && y > 32 && y < 96 ? 230 : 30;
    }
  }
  await sharp(pixels, { raw: { width: 128, height: 128, channels: 3 } }).png().toFile(input);
  await execFileAsync(
    resolve("resources/depth/depth-worker"),
    [resolve("resources/depth/DepthAnythingV2SmallF16P6.mlmodelc"), input, output],
    { timeout: 120_000, maxBuffer: 1024 * 1024 }
  );
  const metadata = await sharp(output).metadata();
  if (metadata.format !== "png" || !metadata.width || !metadata.height) {
    throw new Error("Depth-Worker hat keine gültige PNG-Tiefenkarte erzeugt.");
  }
  console.log(`Depth smoke OK: ${metadata.width}x${metadata.height}`);
} finally {
  await rm(workspace, { recursive: true, force: true });
}
