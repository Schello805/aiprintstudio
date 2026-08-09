import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const appPath = resolve(process.argv[2] || "release/mac-arm64/AI Print Studio.app");
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const required = [
  "Contents/MacOS/AI Print Studio",
  "Contents/Info.plist",
  "Contents/Resources/app.asar",
  "Contents/Resources/depth/depth-worker",
  "Contents/Resources/depth/DepthAnythingV2SmallF16P6.mlmodelc"
];

if (!existsSync(appPath)) throw new Error(`App-Bundle fehlt: ${appPath}`);
for (const relative of required) {
  const path = join(appPath, relative);
  if (!existsSync(path)) throw new Error(`Release-Bestandteil fehlt: ${relative}`);
}
if (statSync(join(appPath, "Contents/Resources/app.asar")).size < 1_000_000) throw new Error("app.asar ist unerwartet klein.");

const plistBuddy = "/usr/libexec/PlistBuddy";
const version = execFileSync(plistBuddy, ["-c", "Print :CFBundleShortVersionString", join(appPath, "Contents/Info.plist")], { encoding: "utf8" }).trim();
if (version !== packageJson.version) throw new Error(`Bundle-Version ${version} stimmt nicht mit package.json ${packageJson.version} überein.`);
const architecture = execFileSync("/usr/bin/file", [join(appPath, "Contents/MacOS/AI Print Studio")], { encoding: "utf8" });
if (!architecture.includes("arm64")) throw new Error("App-Binary enthält kein arm64-Abbild.");
execFileSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", appPath], { stdio: "inherit" });
const electronVersion = execFileSync(join(appPath, "Contents/MacOS/AI Print Studio"), ["-e", "process.stdout.write(process.versions.electron || '')"], {
  encoding: "utf8",
  env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  timeout: 15_000
}).trim();
if (!electronVersion) throw new Error("Das gepackte Electron-Laufzeitsystem startet nicht.");
const reliefModuleUrl = pathToFileURL(join(appPath, "Contents/Resources/app.asar/dist-electron/relief.js")).href;
const reliefImportCheck = execFileSync(join(appPath, "Contents/MacOS/AI Print Studio"), ["-e", `import(${JSON.stringify(reliefModuleUrl)}).then(() => process.stdout.write('ok'))`], {
  encoding: "utf8",
  env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  timeout: 15_000
}).trim();
if (reliefImportCheck !== "ok") throw new Error("Das gepackte Relief-Modul konnte nicht geladen werden.");
console.log(`Release-Smoke-Test bestanden: AI Print Studio ${version}, Electron ${electronVersion}, arm64`);
