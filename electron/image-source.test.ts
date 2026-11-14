import { expect, it } from "vitest";
import sharp from "sharp";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRelief } from "./relief";
import { orientedDimensions } from "./image-source";

it("uses upright EXIF dimensions for the actual relief", async () => {
  expect(orientedDimensions({width:80,height:40,orientation:6})).toEqual({width:40,height:80});
  const directory = await mkdtemp(join(tmpdir(), "relief-exif-"));
  try {
    const source = join(directory,"portrait.jpg");
    await sharp({create:{width:80,height:40,channels:3,background:"#808080"}}).jpeg().withMetadata({orientation:6}).toFile(source);
    const result = await createRelief(source, directory, {widthMm:100,resolution:32,pipelineKind:"photo",processingMode:"height",profile:"photo"});
    expect([result.widthMm,result.heightMm]).toEqual([100,200]);
  } finally { await rm(directory,{recursive:true,force:true}); }
});
