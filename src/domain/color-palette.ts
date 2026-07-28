type Rgb = readonly [number, number, number];

const distanceSquared = (a: Rgb, b: Rgb) =>
  (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

const toHex = ([red, green, blue]: Rgb) =>
  `#${[red, green, blue].map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("")}`.toUpperCase();

export function extractColorPalette(rgba: Uint8ClampedArray, colorCount: number): string[] {
  const target = Math.max(2, Math.min(16, Math.round(colorCount)));
  const histogram = new Map<string, { color: Rgb; count: number }>();
  const step = Math.max(1, Math.floor(rgba.length / 4 / 40_000));
  for (let pixel = 0; pixel < rgba.length / 4; pixel += step) {
    const offset = pixel * 4;
    if (rgba[offset + 3] < 48) continue;
    const color: Rgb = [
      Math.round(rgba[offset] / 8) * 8,
      Math.round(rgba[offset + 1] / 8) * 8,
      Math.round(rgba[offset + 2] / 8) * 8
    ];
    const key = color.join(":");
    const entry = histogram.get(key);
    if (entry) entry.count += 1;
    else histogram.set(key, { color, count: 1 });
  }
  const samples = [...histogram.values()];
  if (!samples.length) return Array.from({ length: target }, (_, index) => toHex([index * 255 / Math.max(1, target - 1), 0, 0]));

  const centers: Rgb[] = [samples.sort((a, b) => b.count - a.count)[0].color];
  while (centers.length < target) {
    const candidate = samples
      .map((sample) => ({ sample, score: Math.min(...centers.map((center) => distanceSquared(sample.color, center))) * sample.count }))
      .sort((a, b) => b.score - a.score)[0]?.sample.color;
    centers.push(candidate ?? centers[centers.length - 1]);
  }

  let weights = Array(target).fill(0) as number[];
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const sums = Array.from({ length: target }, () => [0, 0, 0, 0]);
    for (const sample of samples) {
      let best = 0, bestDistance = Number.POSITIVE_INFINITY;
      centers.forEach((center, index) => {
        const distance = distanceSquared(sample.color, center);
        if (distance < bestDistance) { best = index; bestDistance = distance; }
      });
      sums[best][0] += sample.color[0] * sample.count;
      sums[best][1] += sample.color[1] * sample.count;
      sums[best][2] += sample.color[2] * sample.count;
      sums[best][3] += sample.count;
    }
    weights = sums.map((sum) => sum[3]);
    centers.splice(0, centers.length, ...centers.map((center, index) =>
      sums[index][3] ? [sums[index][0] / sums[index][3], sums[index][1] / sums[index][3], sums[index][2] / sums[index][3]] as Rgb : center
    ));
  }
  return centers
    .map((color, index) => ({ color, weight: weights[index] }))
    .sort((a, b) => b.weight - a.weight)
    .map(({ color }) => toHex(color));
}

