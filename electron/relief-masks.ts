export function buildSubjectPixelMask(rgba: Buffer, width: number, height: number): boolean[] {
  const pixelCount = width * height;
  let hasTransparency = false;
  for (let i = 0; i < pixelCount; i += 1) {
    if (rgba[i * 4 + 3] < 245) { hasTransparency = true; break; }
  }
  if (hasTransparency) {
    return Array.from({ length: pixelCount }, (_, i) => rgba[i * 4 + 3] >= 64);
  }

  const corners = [0, width - 1, (height - 1) * width, pixelCount - 1];
  const background = [0, 1, 2].map((channel) =>
    corners.reduce((sum, pixel) => sum + rgba[pixel * 4 + channel], 0) / corners.length
  );
  const closeToBackground = (pixel: number) => {
    const offset = pixel * 4;
    return Math.hypot(
      rgba[offset] - background[0],
      rgba[offset + 1] - background[1],
      rgba[offset + 2] - background[2]
    ) < 52;
  };
  const outside = new Uint8Array(pixelCount);
  const queue: number[] = [];
  const enqueue = (pixel: number) => {
    if (!outside[pixel] && closeToBackground(pixel)) {
      outside[pixel] = 1;
      queue.push(pixel);
    }
  };
  for (let x = 0; x < width; x += 1) { enqueue(x); enqueue((height - 1) * width + x); }
  for (let y = 0; y < height; y += 1) { enqueue(y * width); enqueue(y * width + width - 1); }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const pixel = queue[cursor], x = pixel % width, y = Math.floor(pixel / width);
    if (x > 0) enqueue(pixel - 1);
    if (x + 1 < width) enqueue(pixel + 1);
    if (y > 0) enqueue(pixel - width);
    if (y + 1 < height) enqueue(pixel + width);
  }
  return Array.from({ length: pixelCount }, (_, i) => outside[i] === 0);
}

export function buildWordmarkPixelMask(rgba: Buffer, width: number, height: number): boolean[] {
  const pixelCount = width * height;
  if (hasUsefulTransparency(rgba)) {
    return Array.from({ length: pixelCount }, (_, index) => rgba[index * 4 + 3] >= 64);
  }

  // Anders als beim Wappen wird nicht nur der von außen erreichbare
  // Hintergrund entfernt. Auch eingeschlossene, hintergrundfarbene Bereiche
  // in a, e, d, o oder ö bleiben echte Löcher. Ein robust angepasstes
  // quadratisches Flächenmodell bildet auch radiale Lichtverläufe und
  // Vignetten ab. Die frühere Interpolation aus nur vier Ecken konnte solche
  // Hintergründe in der Bildmitte nicht erklären und hob sie fälschlich an.
  const background = fitSmoothBackground(rgba, width, height);
  return Array.from({ length: pixelCount }, (_, index) => {
    const x = index % width, y = Math.floor(index / width);
    const expected = background.at(x, y);
    const offset = index * 4;
    return Math.hypot(
      rgba[offset] - expected[0],
      rgba[offset + 1] - expected[1],
      rgba[offset + 2] - expected[2]
    ) >= background.threshold;
  });
}

export function buildWordmarkForegroundPixelMask(rgba: Buffer, width: number, height: number): boolean[] {
  const pixelCount = width * height;

  const result = Array(pixelCount).fill(false) as boolean[];
  const visited = new Uint8Array(pixelCount);
  const colorKeyAt = (index: number) => {
    const offset = index * 4;
    if (rgba[offset + 3] < 64) return "transparent";
    // 32er-Farbklassen verbinden antialiaste Buchstaben noch ausreichend,
    // trennen aber große Logo-Flächen, Text und Signets robust genug für die
    // anschließende Komponentenbewertung.
    return `${rgba[offset] >> 5}:${rgba[offset + 1] >> 5}:${rgba[offset + 2] >> 5}`;
  };
  const maxComponentArea = Math.max(24, pixelCount * 0.065);
  const maxFullWidth = width * 0.82;
  const maxFullHeight = height * 0.82;
  const queue: number[] = [];
  for (let start = 0; start < pixelCount; start += 1) {
    if (visited[start]) continue;
    visited[start] = 1;
    queue.length = 0;
    queue.push(start);
    const key = colorKeyAt(start);
    let cursor = 0, minX = width, maxX = 0, minY = height, maxY = 0, touchesBorder = false;
    while (cursor < queue.length) {
      const pixel = queue[cursor++];
      const x = pixel % width, y = Math.floor(pixel / width);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      touchesBorder ||= x === 0 || y === 0 || x === width - 1 || y === height - 1;
      const neighbors = [
        pixel - 1, pixel + 1,
        pixel - width, pixel + width
      ];
      for (const next of neighbors) {
        if (next < 0 || next >= pixelCount || visited[next]) continue;
        if ((next === pixel - 1 && x === 0) || (next === pixel + 1 && x === width - 1)) continue;
        if (colorKeyAt(next) !== key) continue;
        visited[next] = 1;
        queue.push(next);
      }
    }
    const area = queue.length;
    const boxWidth = maxX - minX + 1, boxHeight = maxY - minY + 1;
    const boxArea = Math.max(1, boxWidth * boxHeight);
    const fillRatio = area / boxArea;
    const slender = fillRatio <= 0.68 || boxWidth / Math.max(1, boxHeight) >= 2.2 || boxHeight / Math.max(1, boxWidth) >= 2.2;
    const compactMotif = area <= maxComponentArea && boxWidth <= maxFullWidth && boxHeight <= maxFullHeight;
    const likelyBackground = touchesBorder && (area > pixelCount * 0.015 || boxWidth > width * 0.35 || boxHeight > height * 0.35);
    const likelyOuterRingSegment = area > pixelCount * 0.015
      && boxHeight > height * 0.45
      && boxWidth < width * 0.24;
    if (area >= 3 && compactMotif && slender && !likelyBackground && !likelyOuterRingSegment) {
      for (const pixel of queue) result[pixel] = true;
    }
  }
  // Keine pauschale Verbreiterung an dieser Stelle: Bei runden Badges mit
  // Textfarben, die auch im Hintergrund vorkommen, verteilt eine Expansion
  // kleine Antialias-Komponenten über große Flächen. Die druckbare
  // Mindestbreite wird später kontrolliert und deutlich vorsichtiger
  // angewendet.
  return result;
}

export function fitSmoothBackground(rgba: Buffer, width: number, height: number): {
  at: (x: number, y: number) => readonly [number, number, number];
  threshold: number;
} {
  const basisAt = (x: number, y: number) => {
    const nx = x / Math.max(1, width - 1) * 2 - 1;
    const ny = y / Math.max(1, height - 1) * 2 - 1;
    return [1, nx, ny, nx * nx, nx * ny, ny * ny];
  };
  const bandX = Math.max(2, Math.round(width * 0.12));
  const bandY = Math.max(2, Math.round(height * 0.12));
  const stride = Math.max(1, Math.floor(Math.max(width, height) / 140));
  let samples: { basis: number[]; rgb: readonly [number, number, number] }[] = [];
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      if (x >= bandX && x < width - bandX && y >= bandY && y < height - bandY) continue;
      const offset = (y * width + x) * 4;
      samples.push({ basis: basisAt(x, y), rgb: [rgba[offset], rgba[offset + 1], rgba[offset + 2]] });
    }
  }
  const fit = (channel: number) => {
    const matrix = Array.from({ length: 6 }, () => Array(6).fill(0));
    const vector = Array(6).fill(0);
    for (const sample of samples) for (let row = 0; row < 6; row += 1) {
      vector[row] += sample.basis[row] * sample.rgb[channel];
      for (let column = 0; column < 6; column += 1) matrix[row][column] += sample.basis[row] * sample.basis[column];
    }
    return solveLinearSystem(matrix, vector);
  };
  let coefficients = [fit(0), fit(1), fit(2)];
  // Helle oder dunkle Motivpixel, die bis an den Rand reichen, werden nach
  // zwei Anpassungsrunden aus den Stützpunkten entfernt.
  for (let pass = 0; pass < 2; pass += 1) {
    const residuals = samples.map((sample) => Math.hypot(...sample.rgb.map((value, channel) =>
      value - sample.basis.reduce((sum, basis, index) => sum + basis * coefficients[channel][index], 0)
    )));
    const sorted = residuals.slice().sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const keepBelow = Math.max(18, median * 2.8);
    const filtered = samples.filter((_, index) => residuals[index] <= keepBelow);
    if (filtered.length < 24 || filtered.length === samples.length) break;
    samples = filtered;
    coefficients = [fit(0), fit(1), fit(2)];
  }
  const borderResiduals = samples.map((sample) => Math.hypot(...sample.rgb.map((value, channel) =>
    value - sample.basis.reduce((sum, basis, index) => sum + basis * coefficients[channel][index], 0)
  ))).sort((a, b) => a - b);
  const residual95 = borderResiduals[Math.floor(borderResiduals.length * 0.95)] ?? 0;
  const threshold = Math.max(38, Math.min(58, residual95 * 1.8 + 12));
  return {
    at: (x, y) => {
      const basis = basisAt(x, y);
      return coefficients.map((channel) => Math.max(0, Math.min(255,
        channel.reduce((sum, value, index) => sum + value * basis[index], 0)
      ))) as [number, number, number];
    },
    threshold
  };
}

function solveLinearSystem(matrix: number[][], vector: number[]): number[] {
  const size = vector.length;
  const rows = matrix.map((row, index) => [...row, vector[index]]);
  for (let pivot = 0; pivot < size; pivot += 1) {
    let best = pivot;
    for (let row = pivot + 1; row < size; row += 1) if (Math.abs(rows[row][pivot]) > Math.abs(rows[best][pivot])) best = row;
    [rows[pivot], rows[best]] = [rows[best], rows[pivot]];
    const divisor = rows[pivot][pivot];
    if (Math.abs(divisor) < 1e-8) return [0, 0, 0, 0, 0, 0];
    for (let column = pivot; column <= size; column += 1) rows[pivot][column] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === pivot) continue;
      const factor = rows[row][pivot];
      for (let column = pivot; column <= size; column += 1) rows[row][column] -= factor * rows[pivot][column];
    }
  }
  return rows.map((row) => row[size]);
}

export function buildCellMask(pixels: boolean[], columns: number, rows: number, threshold = 2): boolean[] {
  const cells: boolean[] = [];
  for (let y = 0; y < rows - 1; y += 1) {
    for (let x = 0; x < columns - 1; x += 1) {
      const a = y * columns + x;
      const occupied = Number(pixels[a]) + Number(pixels[a + 1]) + Number(pixels[a + columns]) + Number(pixels[a + columns + 1]);
      cells.push(occupied >= threshold);
    }
  }
  return cells;
}

export function hasUsefulTransparency(rgba: Buffer): boolean {
  let transparent = 0;
  for (let index = 0; index < rgba.length; index += 4) if (rgba[index + 3] < 245) transparent += 1;
  return transparent > rgba.length / 4 * 0.01;
}

export function cleanSubjectPixelMask(pixels: boolean[], width: number, height: number): boolean[] {
  let current = pixels.slice();
  for (let pass = 0; pass < 2; pass += 1) {
    const next = current.slice();
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let occupied = 0;
        for (let oy = -1; oy <= 1; oy += 1) for (let ox = -1; ox <= 1; ox += 1) {
          const nx = x + ox, ny = y + oy;
          if (nx >= 0 && ny >= 0 && nx < width && ny < height && current[ny * width + nx]) occupied += 1;
        }
        next[y * width + x] = occupied >= 5;
      }
    }
    current = next;
  }
  return current;
}

export function buildSolidOuterSilhouette(pixels: boolean[], width: number, height: number): boolean[] {
  const left = Array(height).fill(Number.POSITIVE_INFINITY) as number[];
  const right = Array(height).fill(Number.NEGATIVE_INFINITY) as number[];
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (!pixels[y * width + x]) continue;
    left[y] = Math.min(left[y], x);
    right[y] = Math.max(right[y], x);
  }
  const radius = Math.max(2, Math.min(12, Math.round(height / 70)));
  const smooth = (values: number[], fallback: number) => values.map((value, y) => {
    if (!Number.isFinite(value)) return fallback;
    let weighted = 0, weight = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const row = y + offset;
      if (row < 0 || row >= height || !Number.isFinite(values[row])) continue;
      const sampleWeight = radius + 1 - Math.abs(offset);
      weighted += values[row] * sampleWeight;
      weight += sampleWeight;
    }
    return weight ? weighted / weight : value;
  });
  const smoothLeft = smooth(left, 0);
  const smoothRight = smooth(right, width - 1);
  const result = Array(width * height).fill(false) as boolean[];
  for (let y = 0; y < height; y += 1) {
    if (!Number.isFinite(left[y]) || !Number.isFinite(right[y])) continue;
    const from = Math.max(0, Math.floor(smoothLeft[y]));
    const to = Math.min(width - 1, Math.ceil(smoothRight[y]));
    for (let x = from; x <= to; x += 1) result[y * width + x] = true;
  }
  return result;
}

export function expandPixelMask(pixels: boolean[], width: number, height: number, radius: number): boolean[] {
  if (radius <= 0) return pixels.slice();
  const expanded = pixels.slice();
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (!pixels[y * width + x]) continue;
    for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
      for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
        if (offsetX * offsetX + offsetY * offsetY > radius * radius) continue;
        const targetX = x + offsetX, targetY = y + offsetY;
        if (targetX >= 0 && targetY >= 0 && targetX < width && targetY < height) {
          expanded[targetY * width + targetX] = true;
        }
      }
    }
  }
  return expanded;
}

export function expandPixelMaskPreservingHoles(pixels: boolean[], width: number, height: number, radius: number): boolean[] {
  const expanded = expandPixelMask(pixels, width, height, radius);
  if (radius <= 0) return expanded;

  // Hintergrund, der vom Bildrand erreichbar ist, darf durch die
  // Mindestbreitenkorrektur enger werden. Eingeschlossene Innenräume wie in
  // a, e, o, ö oder R werden dagegen aus der Originalmaske zurückgeschnitten.
  const outside = new Uint8Array(width * height);
  const queue: number[] = [];
  const enqueue = (index: number) => {
    if (index < 0 || index >= pixels.length || pixels[index] || outside[index]) return;
    outside[index] = 1;
    queue.push(index);
  };
  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor], x = index % width, y = Math.floor(index / width);
    if (x > 0) enqueue(index - 1);
    if (x + 1 < width) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y + 1 < height) enqueue(index + width);
  }
  for (let index = 0; index < pixels.length; index += 1) {
    if (!pixels[index] && !outside[index]) expanded[index] = false;
  }
  return expanded;
}

export function applyBoundaryRim(levels: number[], mask: boolean[], width: number, height: number, radius: number): number[] {
  const next = levels.slice();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!mask[index]) { next[index] = 0; continue; }
      let boundary = false;
      for (let oy = -radius; oy <= radius && !boundary; oy += 1) {
        for (let ox = -radius; ox <= radius; ox += 1) {
          const nx = x + ox, ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height || !mask[ny * width + nx]) {
            boundary = true; break;
          }
        }
      }
      if (boundary) next[index] = 0;
    }
  }
  return next;
}

export function suggestImageProfile(
  rgba: Buffer,
  width: number,
  height: number,
  format?: string
): "logo" | "photo" {
  if (format === "svg") return "logo";
  if (hasUsefulTransparency(rgba)) return "logo";
  const coarseColors = new Set<string>();
  const fineColors = new Set<string>();
  let flatNeighbors = 0;
  let neighborPairs = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const r = rgba[offset], g = rgba[offset + 1], b = rgba[offset + 2];
      coarseColors.add(`${r >> 5}:${g >> 5}:${b >> 5}`);
      fineColors.add(`${r >> 4}:${g >> 4}:${b >> 4}`);
      if (x + 1 < width && y + 1 < height) {
        neighborPairs += 1;
        const right = offset + 4;
        const down = offset + width * 4;
        const diffRight = Math.max(
          Math.abs(r - rgba[right]),
          Math.abs(g - rgba[right + 1]),
          Math.abs(b - rgba[right + 2])
        );
        const diffDown = Math.max(
          Math.abs(r - rgba[down]),
          Math.abs(g - rgba[down + 1]),
          Math.abs(b - rgba[down + 2])
        );
        if (diffRight <= 4 && diffDown <= 4) flatNeighbors += 1;
      }
    }
  }
  const flatRatio = flatNeighbors / Math.max(1, neighborPairs);
  if (coarseColors.size <= 32 && fineColors.size <= 96) return "logo";
  if (flatRatio >= 0.35 && fineColors.size <= 260) return "logo";
  return "photo";
}

