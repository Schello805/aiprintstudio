import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const files = [
  ["electron/vendor/SVGLoader.js", "dist-electron/vendor/SVGLoader.js"]
];

for (const [source, target] of files) {
  mkdirSync(dirname(target), { recursive: true });
  cpSync(join(process.cwd(), source), join(process.cwd(), target));
}
