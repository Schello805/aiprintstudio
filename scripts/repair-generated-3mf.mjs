import JSZip from "jszip";
import { readFile, writeFile } from "node:fs/promises";
import { encodeThreeMf } from "../dist-electron/relief-export.js";

// Migration for legacy AI Print Studio exports. Run npm run build first.
const [source, destination] = process.argv.slice(2);
if (!source || !destination) throw new Error("Usage: node scripts/repair-generated-3mf.mjs source.3mf destination.3mf");
const zip = await JSZip.loadAsync(await readFile(source));
const model = await zip.file("3D/3dmodel.model")?.async("string");
if (!model?.includes("AI Print Studio")) throw new Error("Expected an AI Print Studio export.");
const vertices = [...model.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/g)].map(m => m.slice(1).map(Number));
const sourceColors = [...model.matchAll(/<base\b[^>]*displaycolor="(#[A-Fa-f0-9]{6})[A-Fa-f0-9]{2}"/g)].map(m => m[1].toUpperCase());
const colors = [...new Set(sourceColors)];
const matches = [...model.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)" pid="2" p1="(\d+)"/g)];
const triangles = matches.map(m => m.slice(1, 4).map(Number));
const materials = matches.map(m => colors.indexOf(sourceColors[+m[4]]));
if (!triangles.length || !vertices.length || materials.some(i => i < 0)) throw new Error("Invalid legacy mesh.");
const result = await encodeThreeMf({ vertices, triangles }, undefined, materials, colors, Math.max(0, colors.indexOf("#000000")));
await writeFile(destination, result);
console.log(`Saved ${destination}: ${triangles.length} triangles, ${colors.length} colors; bottom and walls use the body filament.`);
