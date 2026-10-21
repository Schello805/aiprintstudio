import { expect, it } from "vitest";
import JSZip from "jszip";
import { encodePaintColor, encodeThreeMf, type Mesh } from "./relief-export";
import { buildWatertightHeightMesh } from "./relief-meshing";

it("paints only the top while keeping the closed mesh and a black back", async () => {
  const mesh = buildWatertightHeightMesh(3, 3, 10, 10, Array(9).fill(2));
  // Deliberately simulate a legacy file with red assigned even to the bottom.
  const zip = await JSZip.loadAsync(await encodeThreeMf(mesh, undefined,
    mesh.triangles.map(() => 1), ["#000000", "#FF0000"], 0));
  const model = await zip.file("3D/3dmodel.model")!.async("string");
  const triangles = [...model.matchAll(/<triangle\b[^>]*\/>/g)];
  expect(triangles).toHaveLength(mesh.triangles.length);
  let top = 0, bottom = 0;
  triangles.forEach(([xml], index) => {
    const [a, b, c] = mesh.triangles[index].map(i => mesh.vertices[i]);
    const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (nz > 0) { expect(xml).toContain('paint_color="8"'); top++; }
    else { expect(xml).toContain('paint_color="4"'); bottom++; }
  });
  expect(top).toBeGreaterThan(0);
  expect(bottom).toBeGreaterThan(0);
  expect(model.match(/<object\b/g)).toHaveLength(1);
  expect(model).not.toContain("<component ");
  expect(await zip.file("Metadata/model_settings.config")!.async("string"))
    .toContain('<part id="3" subtype="normal_part">');
  const settings = JSON.parse(await zip.file("Metadata/project_settings.config")!.async("string"));
  expect(settings).toEqual({ filament_colour: ["#000000", "#FF0000"] });
});

it("uses the selected body filament on the bottom even when black is not slot one", async () => {
  const mesh: Mesh = { vertices: [[0, 0, 0], [0, 1, 0], [1, 0, 0]], triangles: [[0, 1, 2]] };
  const zip = await JSZip.loadAsync(await encodeThreeMf(mesh, undefined, [0], ["#FFFFFF", "#000000"], 1));
  expect(await zip.file("3D/3dmodel.model")!.async("string")).toContain('p1="1" paint_color="8"');
});

it("encodes Anycubic/Orca filament slots including extended leaf states", () => {
  expect([1, 2, 3, 4, 16].map(encodePaintColor)).toEqual(["4", "8", "0C", "1C", "DC"]);
  expect(() => encodePaintColor(17)).toThrow();
});

it("keeps direct SVG backs in the body color and deduplicates repeated fills", async () => {
  const { mkdtemp, writeFile, readFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { createRelief } = await import("./relief");
  const directory = await mkdtemp(join(tmpdir(), "svg-color-back-"));
  try {
    const source = join(directory, "logo.svg");
    await writeFile(source, '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="#ffffff"/><rect x="5" y="5" width="5" height="5" fill="#ff0000"/><rect x="20" y="5" width="5" height="5" fill="#ff0000"/></svg>');
    const relief = await createRelief(source, directory, {
      pipelineKind: "wordmark", processingMode: "wordmark", profile: "logo",
      widthMm: 40, resolution: 128, includeBackground: true,
      colors: ["#FFFFFF", "#FF0000", "#000000"], sideColorIndex: 2
    });
    const zip = await JSZip.loadAsync(await readFile(relief.threeMfPath));
    const xml = await zip.file("3D/3dmodel.model")!.async("string");
    const settings = JSON.parse(await zip.file("Metadata/project_settings.config")!.async("string"));
    expect(settings.filament_colour).toEqual(["#FFFFFF", "#FF0000", "#000000"]);
    const vertices = [...xml.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/g)].map(m => m.slice(1).map(Number));
    let bottom = 0;
    for (const [triangle] of xml.matchAll(/<triangle\b[^>]*\/>/g)) {
      const ids = [...triangle.matchAll(/v[123]="(\d+)"/g)].map(m => +m[1]);
      if (ids.every(i => vertices[i][2] === 0)) {
        expect(triangle).toContain('paint_color="0C"');
        bottom++;
      }
    }
    expect(bottom).toBeGreaterThan(0);
    expect(xml).toContain('paint_color="8"');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
