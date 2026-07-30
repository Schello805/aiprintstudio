import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { Brush, ChevronDown, ChevronUp, Eraser, Link2, Minus, MousePointer2, Palette, Plus, Redo2, RotateCcw, Scissors, Undo2, Unlink2, WandSparkles, X } from "lucide-react";
import {
  expandRegionSelection,
  initialRegionLevels,
  reduceRegionSelection,
  segmentRgba,
  selectSimilarRegions,
  setSelectedRegionLevel,
  smoothSelectedLevels,
  type Segmentation
} from "./domain/region-editor";
import { SettingTooltip } from "./SettingTooltip";

const editorTooltips = {
  undo: "Nimmt die letzte Höhenänderung zurück.\nBeispiel: Ein versehentlich angehobener Bereich erhält wieder seine vorherige Höhe.",
  redo: "Stellt eine zurückgenommene Änderung wieder her.\nBeispiel: Die zuletzt rückgängig gemachte Glättung wird erneut angewendet.",
  expand: "Fügt alle direkt angrenzenden Teilflächen zur Auswahl hinzu.\nBeispiel: Von der Rollenkontur aus auch den Rollenkörper auswählen.",
  reduce: "Entfernt die äußeren angrenzenden Teilflächen aus der Auswahl.\nBeispiel: Eine zu weit gewachsene Auswahl wieder auf den Kern verkleinern.",
  similar: "Wählt getrennte Flächen mit einer ähnlichen Farbe aus.\nBeispiel: Alle vier weißen Rollenflächen gemeinsam auswählen.",
  invert: "Tauscht ausgewählte und nicht ausgewählte Flächen.\nBeispiel: Statt des Motivs den gesamten Hintergrund bearbeiten.",
  clear: "Hebt die aktuelle Markierung auf, ohne Höhen zu verändern.\nBeispiel: Eine neue Einzelauswahl beginnen.",
  height: "Legt die absolute Reliefhöhe der markierten Flächen fest.\nBeispiel: 3,0 mm hebt Rollen deutlich über die Grundfläche.",
  higher: "Hebt die Auswahl um eine kleine Höhenstufe an.\nBeispiel: Eine Kontur schrittweise stärker hervorheben.",
  lower: "Senkt die Auswahl um eine kleine Höhenstufe ab.\nBeispiel: Einen zu dominanten Hintergrund zurücknehmen.",
  base: "Setzt die Auswahl vollständig auf die Grundfläche.\nBeispiel: Unerwünschte Bilddetails verschwinden aus dem Relief.",
  recess: "Senkt die Auswahl um eine Höhenstufe unter ihre Umgebung.\nBeispiel: Eine Nut oder vertiefte Schrift sichtbar einprägen.",
  smooth: "Gleicht kleine Höhenunterschiede innerhalb der Auswahl aus.\nBeispiel: Bildrauschen auf einer großen Fläche reduzieren.",
  round: "Glättet die Auswahl zweimal für weichere Übergänge.\nBeispiel: Harte Stufen an einer runden Rolle abrunden."
};

type EditorData = {
  segmentation: Segmentation;
  source: Uint8ClampedArray;
};

export function RegionEditor({
  imageUrl,
  initialHeightmapUrl,
  initialColorMapUrl,
  reliefMm,
  colors,
  onHeightmapChange,
  onColorMapChange,
  onClose
}: {
  imageUrl: string;
  initialHeightmapUrl?: string | null;
  initialColorMapUrl?: string | null;
  reliefMm: number;
  colors: string[];
  onHeightmapChange: (dataUrl: string | null) => void;
  onColorMapChange: (dataUrl: string | null) => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sliderStartRef = useRef<Uint8ClampedArray | null>(null);
  // Die beim Öffnen sichtbare, bereits berechnete Form ist die verbindliche
  // Ausgangsbasis. Änderungen, die wir nach oben melden, dürfen den Editor
  // nicht erneut mit einer neuen Prop-Version initialisieren.
  const initialHeightmapRef = useRef(initialHeightmapUrl);
  const initialColorMapRef = useRef(initialColorMapUrl);
  const heightmapReadyRef = useRef(false);
  const colorMapReadyRef = useRef(false);
  const [data, setData] = useState<EditorData | null>(null);
  const [levels, setLevels] = useState<Uint8ClampedArray | null>(null);
  const [selection, setSelection] = useState<Set<number>>(new Set());
  const [undoStack, setUndoStack] = useState<Uint8ClampedArray[]>([]);
  const [redoStack, setRedoStack] = useState<Uint8ClampedArray[]>([]);
  const [colorAssignments, setColorAssignments] = useState<Uint8ClampedArray | null>(null);
  const [tool, setTool] = useState<"select" | "brush" | "eraser">("select");
  const [brushSize, setBrushSize] = useState(12);
  const [brushLevel, setBrushLevel] = useState(210);
  const [brushColor, setBrushColor] = useState(0);
  const paintingRef = useRef(false);

  useEffect(() => {
    let active = true;
    const image = new Image();
    image.onload = async () => {
      if (!active) return;
      const scale = Math.min(1, 480 / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(16, Math.round(image.naturalWidth * scale));
      const height = Math.max(16, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      const source = context.getImageData(0, 0, width, height).data;
      const segmentation = segmentRgba(source, width, height);
      const loadMap = async (url: string | null | undefined, fallback: Uint8ClampedArray) => {
        if (!url) return fallback;
        try {
          const map = new Image();
          map.src = url;
          await map.decode();
          if (!active) return fallback;
          const mapCanvas = document.createElement("canvas");
          mapCanvas.width = width; mapCanvas.height = height;
          const mapContext = mapCanvas.getContext("2d", { willReadFrequently: true });
          if (!mapContext) return fallback;
          mapContext.drawImage(map, 0, 0, width, height);
          const pixels = mapContext.getImageData(0, 0, width, height).data;
          return Uint8ClampedArray.from({ length: width * height }, (_, index) => pixels[index * 4]);
        } catch {
          return fallback;
        }
      };
      const initial = await loadMap(initialHeightmapRef.current, initialRegionLevels(segmentation));
      const initialColors = await loadMap(initialColorMapRef.current, new Uint8ClampedArray(width * height).fill(255));
      if (!active) return;
      setData({ segmentation, source: source.slice() });
      setLevels(initial);
      setSelection(new Set());
      setUndoStack([]);
      setRedoStack([]);
      setColorAssignments(initialColors);
    };
    image.src = imageUrl;
    return () => { active = false; };
  }, [imageUrl]);

  useEffect(() => {
    if (!data || !levels) return;
    if (!heightmapReadyRef.current) {
      heightmapReadyRef.current = true;
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = data.segmentation.width; canvas.height = data.segmentation.height;
    const context = canvas.getContext("2d");
    if (!context) return;
    const pixels = new Uint8ClampedArray(levels.length * 4);
    for (let index = 0; index < levels.length; index += 1) {
      pixels[index * 4] = levels[index];
      pixels[index * 4 + 1] = levels[index];
      pixels[index * 4 + 2] = levels[index];
      pixels[index * 4 + 3] = 255;
    }
    context.putImageData(new ImageData(pixels, canvas.width, canvas.height), 0, 0);
    onHeightmapChange(canvas.toDataURL("image/png"));
  }, [data, levels, onHeightmapChange]);

  useEffect(() => {
    if (!data || !colorAssignments || !colors.length) {
      if (colorMapReadyRef.current) onColorMapChange(null);
      return;
    }
    if (!colorMapReadyRef.current) {
      colorMapReadyRef.current = true;
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = data.segmentation.width; canvas.height = data.segmentation.height;
    const context = canvas.getContext("2d");
    if (!context) return;
    const pixels = new Uint8ClampedArray(colorAssignments.length * 4);
    for (let index = 0; index < colorAssignments.length; index += 1) {
      pixels[index * 4] = colorAssignments[index];
      pixels[index * 4 + 1] = colorAssignments[index];
      pixels[index * 4 + 2] = colorAssignments[index];
      pixels[index * 4 + 3] = 255;
    }
    context.putImageData(new ImageData(pixels, canvas.width, canvas.height), 0, 0);
    onColorMapChange(canvas.toDataURL("image/png"));
  }, [colorAssignments, colors.length, data, onColorMapChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    canvas.width = data.segmentation.width; canvas.height = data.segmentation.height;
    const context = canvas.getContext("2d");
    if (!context) return;
    const display = data.source.slice();
    for (let index = 0; index < data.segmentation.regionIds.length; index += 1) {
      if (levels) {
        const offset = index * 4;
        display[offset] = Math.round(display[offset] * 0.82 + levels[index] * 0.18);
        display[offset + 1] = Math.round(display[offset + 1] * 0.82 + levels[index] * 0.18);
        display[offset + 2] = Math.round(display[offset + 2] * 0.82 + levels[index] * 0.18);
      }
      const assigned = colorAssignments?.[index] ?? 255;
      if (assigned < colors.length) {
        const [r, g, b] = hexToRgb(colors[assigned]);
        const offset = index * 4;
        display[offset] = Math.round(display[offset] * 0.45 + r * 0.55);
        display[offset + 1] = Math.round(display[offset + 1] * 0.45 + g * 0.55);
        display[offset + 2] = Math.round(display[offset + 2] * 0.45 + b * 0.55);
      }
      if (!selection.has(data.segmentation.regionIds[index])) continue;
      const offset = index * 4;
      display[offset] = Math.round(display[offset] * 0.2 + 165 * 0.8);
      display[offset + 1] = Math.round(display[offset + 1] * 0.2 + 243 * 0.8);
      display[offset + 2] = Math.round(display[offset + 2] * 0.2 + 109 * 0.8);
      display[offset + 3] = 255;
    }
    context.putImageData(new ImageData(display, canvas.width, canvas.height), 0, 0);
  }, [colorAssignments, colors, data, levels, selection]);

  const commitLevels = (next: Uint8ClampedArray) => {
    if (!levels) return;
    setUndoStack((current) => [...current.slice(-29), levels.slice()]);
    setRedoStack([]);
    setLevels(next);
  };
  const currentLevel = useMemo(() => {
    if (!data || !levels || selection.size === 0) return 0;
    const values = [...selection].map((id) => levels[data.segmentation.regions[id]?.pixels[0] ?? 0]);
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  }, [data, levels, selection]);
  const setLevel = (value: number) => {
    if (!data || !levels || !selection.size) return;
    commitLevels(setSelectedRegionLevel(levels, selection, data.segmentation.regions, value));
  };
  const previewLevel = (value: number) => {
    if (!data || !levels || !selection.size) return;
    setLevels(setSelectedRegionLevel(levels, selection, data.segmentation.regions, value));
  };
  const beginSliderDrag = () => {
    if (!levels || !selection.size) return;
    if (sliderStartRef.current) return;
    sliderStartRef.current = levels.slice();
  };
  const endSliderDrag = () => {
    const original = sliderStartRef.current;
    if (!original) return;
    sliderStartRef.current = null;
    setUndoStack((current) => [...current.slice(-29), original]);
    setRedoStack([]);
  };
  const assignColor = (colorIndex: number) => {
    if (!data || !colorAssignments || !selection.size) return;
    const next = colorAssignments.slice();
    for (const regionId of selection) {
      for (const pixel of data.segmentation.regions[regionId]?.pixels ?? []) next[pixel] = colorIndex;
    }
    setColorAssignments(next);
  };
  const undo = () => {
    const previous = undoStack.at(-1);
    if (!previous || !levels) return;
    setUndoStack((current) => current.slice(0, -1));
    setRedoStack((current) => [...current, levels.slice()]);
    setLevels(previous);
  };
  const redo = () => {
    const next = redoStack.at(-1);
    if (!next || !levels) return;
    setRedoStack((current) => current.slice(0, -1));
    setUndoStack((current) => [...current, levels.slice()]);
    setLevels(next);
  };
  const pointerPixel = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!data || !canvasRef.current) return;
    const bounds = canvasRef.current.getBoundingClientRect();
    const x = Math.min(data.segmentation.width - 1, Math.max(0, Math.floor((event.clientX - bounds.left) / bounds.width * data.segmentation.width)));
    const y = Math.min(data.segmentation.height - 1, Math.max(0, Math.floor((event.clientY - bounds.top) / bounds.height * data.segmentation.height)));
    return { x, y };
  };
  const paintAt = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = pointerPixel(event);
    if (!point || !data || !levels) return;
    const next = levels.slice();
    const nextColors = colorAssignments?.slice();
    const radius = Math.max(1, Math.round(brushSize / 2));
    for (let offsetY = -radius; offsetY <= radius; offsetY += 1) for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
      if (offsetX * offsetX + offsetY * offsetY > radius * radius) continue;
      const x = point.x + offsetX, y = point.y + offsetY;
      if (x < 0 || y < 0 || x >= data.segmentation.width || y >= data.segmentation.height) continue;
      const index = y * data.segmentation.width + x;
      next[index] = tool === "eraser" ? 0 : brushLevel;
      if (tool === "brush" && nextColors && colors.length) nextColors[index] = brushColor;
      if (tool === "eraser" && nextColors) nextColors[index] = 255;
    }
    setLevels(next);
    if (nextColors) setColorAssignments(nextColors);
  };
  const handleCanvasDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!data || !levels) return;
    if (tool !== "select") {
      paintingRef.current = true;
      setUndoStack((current) => [...current.slice(-29), levels.slice()]);
      setRedoStack([]);
      event.currentTarget.setPointerCapture(event.pointerId);
      paintAt(event);
      return;
    }
    const point = pointerPixel(event);
    if (!point) return;
    const { x, y } = point;
    const id = data.segmentation.regionIds[y * data.segmentation.width + x];
    setSelection((current) => {
      if (!event.shiftKey) return new Set([id]);
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectDetectedMotif = () => {
    if (!data) return;
    const background = [...data.segmentation.regions].sort((a, b) => b.pixels.length - a.pixels.length)[0]?.id;
    const motif = data.segmentation.regions.filter((region) => region.id !== background).map((region) => region.id);
    setSelection(new Set(motif.length ? motif : data.segmentation.regions.map((region) => region.id)));
  };

  return (
    <section className="region-editor" aria-label="Motivbereiche bearbeiten">
      <div className="region-editor-heading">
        <div><span className="option-label">FLÄCHENEDITOR</span><strong>Motiv wie in einem einfachen 3D-Baukasten korrigieren</strong><p>Fläche anklicken · Umschalt-Klick fügt hinzu oder entfernt sie.</p></div>
        <div className="editor-history">
          <button className="has-tooltip" onClick={undo} disabled={!undoStack.length} aria-description={editorTooltips.undo}><Undo2 /><SettingTooltip text={editorTooltips.undo} /></button>
          <button className="has-tooltip" onClick={redo} disabled={!redoStack.length} aria-description={editorTooltips.redo}><Redo2 /><SettingTooltip text={editorTooltips.redo} /></button>
          <button onClick={onClose} title="Editor schließen"><X /></button>
        </div>
      </div>
      <div className="editor-tool-palette">
        <button className={tool === "select" ? "selected" : ""} onClick={() => setTool("select")}><MousePointer2 /> Flächen</button>
        <button className={tool === "brush" ? "selected" : ""} onClick={() => setTool("brush")}><Brush /> Pinsel</button>
        <button className={tool === "eraser" ? "selected" : ""} onClick={() => setTool("eraser")}><Eraser /> Radierer</button>
        <label><span>Größe {brushSize}px</span><input type="range" min={2} max={60} value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} /></label>
        <label><span>Pinselhöhe {(brushLevel / 255 * reliefMm).toFixed(1)} mm</span><input type="range" min={0} max={255} value={brushLevel} onChange={(event) => setBrushLevel(Number(event.target.value))} /></label>
        {colors.length > 0 && <label><span>Pinsel-Farbe</span><select value={brushColor} onChange={(event) => setBrushColor(Number(event.target.value))}>{colors.map((color, index) => <option value={index} key={color}>AMS {index + 1}</option>)}</select></label>}
      </div>
      <div className="region-editor-grid">
        <div className="region-canvas-panel">
          <span className="panel-label">2D-AUSWAHL · GRÜN MARKIERT</span>
          {data ? <canvas
            ref={canvasRef}
            className={`editor-canvas tool-${tool}`}
            onPointerDown={handleCanvasDown}
            onPointerMove={(event) => paintingRef.current && paintAt(event)}
            onPointerUp={() => { paintingRef.current = false; }}
            onPointerCancel={() => { paintingRef.current = false; }}
          /> : <div className="editor-loading">Flächen werden erkannt …</div>}
        </div>
        <EditorReliefPreview segmentation={data?.segmentation ?? null} source={data?.source ?? null} levels={levels} reliefMm={reliefMm} />
      </div>
      <div className="selection-toolbar">
        <button className="has-tooltip" disabled={!selection.size || !data} onClick={() => data && setSelection(expandRegionSelection(selection, data.segmentation.regions))}><Plus /> Angrenzend erweitern<SettingTooltip text={editorTooltips.expand} /></button>
        <button className="has-tooltip" disabled={!selection.size || !data} onClick={() => data && setSelection(reduceRegionSelection(selection, data.segmentation.regions))}><Minus /> Rand reduzieren<SettingTooltip text={editorTooltips.reduce} /></button>
        <button className="has-tooltip" disabled={selection.size !== 1 || !data} onClick={() => data && setSelection(selectSimilarRegions([...selection][0], data.segmentation.regions))}><WandSparkles /> Ähnliche Farbe<SettingTooltip text={editorTooltips.similar} /></button>
        <button className="has-tooltip" disabled={!data} onClick={() => data && setSelection(new Set(data.segmentation.regions.map((region) => region.id).filter((id) => !selection.has(id))))}><RotateCcw /> Umkehren<SettingTooltip text={editorTooltips.invert} /></button>
        <button className="has-tooltip" disabled={!selection.size} onClick={() => setSelection(new Set())}><X /> Auswahl aufheben<SettingTooltip text={editorTooltips.clear} /></button>
        <button title="Setzt alle ausgewählten Flächen auf dieselbe Höhe" disabled={selection.size < 2 || !data || !levels} onClick={() => {
          if (!data || !levels || selection.size < 2) return;
          const value = Math.max(...[...selection].map((id) => levels[data.segmentation.regions[id]?.pixels[0] ?? 0]));
          commitLevels(setSelectedRegionLevel(levels, selection, data.segmentation.regions, value));
        }}><Link2 /> Höhe verbinden</button>
        <button title="Löst die Auswahl vom Motiv, indem sie auf die Grundfläche gesetzt wird" disabled={!selection.size} onClick={() => setLevel(0)}><Unlink2 /> Vom Motiv trennen</button>
      </div>
      {colors.length > 0 && (
        <div className="editor-color-toolbar">
          <span><Palette /> AUSWAHL EINER AMS-FARBE ZUWEISEN</span>
          {colors.map((color, index) => (
            <button key={color} disabled={!selection.size} onClick={() => assignColor(index)}>
              <i style={{ background: color }} /> AMS {index + 1}
            </button>
          ))}
        </div>
      )}
      <div className="height-toolbar">
        <label className="has-tooltip">
          <span>HÖHE DER AUSWAHL</span>
          <input
            className="height-range"
            type="range"
            min={0}
            max={255}
            step={1}
            value={currentLevel}
            disabled={!selection.size}
            onPointerDown={beginSliderDrag}
            onInput={(event) => previewLevel(Number(event.currentTarget.value))}
            onPointerUp={endSliderDrag}
            onPointerCancel={endSliderDrag}
            onKeyDown={beginSliderDrag}
            onKeyUp={endSliderDrag}
            aria-label="Höhe der ausgewählten Fläche"
          />
          <span className="height-value">
            <input
              type="number"
              min={0}
              max={reliefMm}
              step={0.1}
              value={(currentLevel / 255 * reliefMm).toFixed(1)}
              disabled={!selection.size}
              onChange={(event) => setLevel(Number(event.target.value) / reliefMm * 255)}
              aria-label="Höhe in Millimetern"
            />
            mm
          </span>
          <SettingTooltip text={editorTooltips.height} />
        </label>
        <button className="has-tooltip" disabled={!selection.size} onClick={() => setLevel(currentLevel + 20)}><ChevronUp /> Höher<SettingTooltip text={editorTooltips.higher} /></button>
        <button className="has-tooltip" disabled={!selection.size} onClick={() => setLevel(currentLevel - 20)}><ChevronDown /> Tiefer<SettingTooltip text={editorTooltips.lower} /></button>
        <button className="has-tooltip" disabled={!selection.size} onClick={() => setLevel(0)}>Auf Grundfläche<SettingTooltip text={editorTooltips.base} /></button>
        <button className="has-tooltip" disabled={!selection.size} onClick={() => setLevel(currentLevel - 40)}><Scissors /> Vertiefen<SettingTooltip text={editorTooltips.recess} /></button>
        <button className="has-tooltip" disabled={!selection.size || !data || !levels} onClick={() => data && levels && commitLevels(smoothSelectedLevels(levels, selection, data.segmentation))}>Glätten<SettingTooltip text={editorTooltips.smooth} /></button>
        <button className="has-tooltip" disabled={!selection.size || !data || !levels} onClick={() => {
          if (!data || !levels) return;
          const once = smoothSelectedLevels(levels, selection, data.segmentation);
          commitLevels(smoothSelectedLevels(once, selection, data.segmentation));
        }}>Kanten abrunden<SettingTooltip text={editorTooltips.round} /></button>
      </div>
      <div className="editor-status">
        <span>{selection.size ? selection.size <= 20 ? `✓ ${selection.size} Fläche${selection.size === 1 ? "" : "n"} grün ausgewählt` : "✓ Mehrere angrenzende Teilflächen grün ausgewählt" : "Klicke links im Bild auf eine Fläche – erst danach wird der Höhenregler aktiv."}</span>
        {!selection.size && <button onClick={selectDetectedMotif}>Motiv automatisch auswählen</button>}
        <strong>Danach unten „Relief erstellen“ klicken, um das Modell neu zu berechnen.</strong>
      </div>
    </section>
  );
}

function hexToRgb(color: string): [number, number, number] {
  return [Number.parseInt(color.slice(1, 3), 16), Number.parseInt(color.slice(3, 5), 16), Number.parseInt(color.slice(5, 7), 16)];
}

function EditorReliefPreview({
  segmentation,
  source,
  levels,
  reliefMm
}: {
  segmentation: Segmentation | null;
  source: Uint8ClampedArray | null;
  levels: Uint8ClampedArray | null;
  reliefMm: number;
}) {
  const preview = useMemo(() => {
    const next = new THREE.BufferGeometry();
    if (!segmentation || !source || !levels) return { geometry: next, extent: 92 };
    // 90 Abtastpunkte waren für kleine Logos ausreichend, ließen aber gerade
    // Schriftkanten im Editor sichtbar ausfransen. 320 bleibt auf Apple
    // Silicon interaktiv und bewahrt Rundungen sowie diagonale Konturen.
    const previewResolution = 320;
    const stride = Math.max(1, Math.ceil(Math.max(segmentation.width, segmentation.height) / previewResolution));
    const columns = Math.ceil((segmentation.width - 1) / stride) + 1;
    const rows = Math.ceil((segmentation.height - 1) / stride) + 1;
    const positions: number[] = [], indices: number[] = [];
    for (let y = 0; y < rows; y += 1) for (let x = 0; x < columns; x += 1) {
      const sourceX = Math.min(segmentation.width - 1, x * stride);
      const sourceY = Math.min(segmentation.height - 1, y * stride);
      positions.push(
        x - columns / 2,
        levels[sourceY * segmentation.width + sourceX] / 255 * reliefMm,
        y - rows / 2
      );
    }
    for (let y = 0; y < rows - 1; y += 1) for (let x = 0; x < columns - 1; x += 1) {
      const a = y * columns + x, b = a + 1, c = a + columns, d = c + 1;
      const sample = (column: number, row: number) => {
        const sourceX = Math.min(segmentation.width - 1, column * stride);
        const sourceY = Math.min(segmentation.height - 1, row * stride);
        const index = sourceY * segmentation.width + sourceX;
        return source[index * 4 + 3] >= 24 && levels[index] > 1;
      };
      if (![sample(x, y), sample(x + 1, y), sample(x, y + 1), sample(x + 1, y + 1)].some(Boolean)) continue;
      indices.push(a, d, b, a, c, d);
    }
    next.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    next.setIndex(indices);
    next.computeVertexNormals();
    next.computeBoundingSphere();
    return { geometry: next, extent: Math.max(columns, rows) };
  }, [levels, reliefMm, segmentation, source]);
  useEffect(() => () => preview.geometry.dispose(), [preview]);
  const size = preview.extent;
  return (
    <div className="editor-preview-panel">
      <span className="panel-label">LIVE-3D-VORSCHAU</span>
      <Canvas dpr={[1, 2]} gl={{ antialias: true, powerPreference: "high-performance" }} camera={{ position: [size * 0.64, size * 0.5, size * 0.88], fov: 38 }}>
        <ambientLight intensity={1.45} />
        <directionalLight position={[size * 0.35, size * 0.75, size * 0.5]} intensity={3.4} />
        <directionalLight position={[-size * 0.4, size * 0.2, -size * 0.2]} intensity={0.7} />
        <mesh geometry={preview.geometry}>
          <meshStandardMaterial color="#c8f59d" roughness={0.58} metalness={0.02} side={THREE.DoubleSide} flatShading={false} />
        </mesh>
        <OrbitControls makeDefault enableDamping />
      </Canvas>
    </div>
  );
}
