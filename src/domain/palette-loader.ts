// Import detection may finish after a saved project has been restored.
export function createPaletteLoader(detect: (source: string) => Promise<string[]>) {
  let generation = 0;
  return {
    cancel() { generation++; },
    async load(source: string, apply: (palette: string[]) => void) {
      const request = ++generation;
      let palette: string[];
      try { palette = await detect(source); }
      catch { palette = ["#111827", "#F5F5F4", "#22C55E", "#F59E0B"]; }
      if (request === generation) apply(palette);
    }
  };
}
