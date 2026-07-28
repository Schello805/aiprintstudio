import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const svg = `
<svg width="640" height="420" viewBox="0 0 640 420" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#11151c"/>
      <stop offset="1" stop-color="#080b10"/>
    </linearGradient>
    <linearGradient id="arrow" x1="0" y1="0" x2="1" y2="0">
      <stop stop-color="#7eea72"/>
      <stop offset="1" stop-color="#b9ff65"/>
    </linearGradient>
  </defs>
  <rect width="640" height="420" fill="url(#bg)"/>
  <rect x="0.5" y="0.5" width="639" height="419" fill="none" stroke="#252c35"/>
  <text x="320" y="48" text-anchor="middle" fill="#f0f4f8" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="20" font-weight="700">AI Print Studio installieren</text>
  <text x="320" y="74" text-anchor="middle" fill="#99a3af" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="13">Die App links auf „Programme“ rechts ziehen</text>
  <path d="M250 226h103v-24l57 48-57 48v-24H250z" fill="url(#arrow)"/>
  <text x="320" y="355" text-anchor="middle" fill="#a5f36d" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="13" font-weight="600">Danach AI Print Studio aus „Programme“ öffnen</text>
  <text x="320" y="380" text-anchor="middle" fill="#697480" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="11">Nicht die heruntergeladene DMG-Datei in „Programme“ verschieben.</text>
</svg>`;

await mkdir("build", { recursive: true });
await writeFile("build/background.png", await sharp(Buffer.from(svg)).png().toBuffer());
