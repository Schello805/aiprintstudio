import { expect, it } from "vitest";
import sharp from "sharp";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareDepthInput } from "./depth-input";

it("rasterizes a transparent SVG to an opaque RGB depth input", async () => {
  const directory = await mkdtemp(join(tmpdir(), "depth-input-test-"));
  try {
    const source = join(directory, "artwork.svg");
    const destination = join(directory, "input.png");
    await writeFile(source, '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="100" height="100" fill="red"/></svg>');
    await prepareDepthInput(source, destination);
    const { data, info } = await sharp(destination).raw().toBuffer({ resolveWithObject: true });
    expect(info).toMatchObject({ width: 200, height: 100, channels: 3 });
    expect([...data.subarray(0, 3)]).toEqual([255, 0, 0]);
    expect([...data.subarray(199 * 3, 200 * 3)]).toEqual([255, 255, 255]);
    expect((await sharp(destination).metadata()).format).toBe("png");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
