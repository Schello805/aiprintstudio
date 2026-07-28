import sharp from "sharp";

export type TextImageOptions = {
  text?: string;
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  alignment?: "left" | "center" | "right";
};

const escapeSvgText = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
})[character] ?? character);

export async function renderTextImage(options: TextImageOptions): Promise<{
  png: Buffer;
  text: string;
  width: number;
  height: number;
}> {
  const text = (options.text ?? "").trim();
  if (!text || text.length > 240) throw new Error("Der Text muss zwischen 1 und 240 Zeichen enthalten.");
  const allowedFonts = ["Helvetica", "Avenir Next", "Arial", "Times New Roman", "Courier New"];
  const fontFamily = allowedFonts.includes(options.fontFamily ?? "") ? options.fontFamily ?? "Helvetica" : "Helvetica";
  const alignment = ["left", "center", "right"].includes(options.alignment ?? "") ? options.alignment ?? "center" : "center";
  const lines = text.split(/\r?\n/).slice(0, 6);
  const width = 1600;
  const lineHeight = 230;
  const height = Math.max(420, 160 + lines.length * lineHeight);
  const anchor = alignment === "left" ? "start" : alignment === "right" ? "end" : "middle";
  const x = alignment === "left" ? 80 : alignment === "right" ? width - 80 : width / 2;
  const tspans = lines.map((line, index) =>
    `<tspan x="${x}" y="${130 + (index + 0.72) * lineHeight}">${escapeSvgText(line || " ")}</tspan>`
  ).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="100%" height="100%" fill="none"/>
<text text-anchor="${anchor}" font-family="${escapeSvgText(fontFamily)}" font-size="190" font-weight="${options.bold ? 700 : 400}" font-style="${options.italic ? "italic" : "normal"}" fill="#111111">${tspans}</text>
</svg>`;
  const rendered = sharp(Buffer.from(svg)).png();
  const { data, info } = await rendered
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 })
    .extend({ top: 48, bottom: 48, left: 48, right: 48, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer({ resolveWithObject: true });
  return { png: data, text, width: info.width, height: info.height };
}
