import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const packageFile = new URL("../package.json", import.meta.url);
const packageJson = JSON.parse(await readFile(packageFile, "utf8"));
const tag = process.env.GITHUB_REF_NAME;
if (tag?.startsWith("v")) packageJson.version = tag.slice(1);
const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
await writeFile(packageFile, `${JSON.stringify(packageJson, null, 2)}\n`);
console.log(`Rev. ${packageJson.version}+${commit}`);
