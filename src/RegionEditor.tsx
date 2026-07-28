import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { ChevronDown, ChevronUp, Minus, Palette, Plus, Redo2, RotateCcw, Scissors, Undo2, WandSparkles, X } from "lucide-react";
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
  smooth: "Gleicht kleine Höhenunterschiede innerhalb der Auswahl aus.\nBeispiel: Bildrauschen auf einer großen Fläche reduzieren.",
  round: "Glättet die Auswahl zweimal für weichere Übergänge.\nBeispiel: Harte Stufen an einer runden Rolle abrunden."
};

type EditorData = {
  segmentation: Segmentation;
  source: Uint8ClampedArray;
};

export function RegionEditor({
  imageUrl,
  reliefMm,
  colors,
  onHeightmapChange,
  onColorMapChange,
  onClose
}: {
  imageUrl: string;
  reliefMm: number;
  colors: string[];
  onHeightmapChange: (dataUrl: string | null) => void;
  onColorMapChange: (dataUrl: string | null) => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<EditorData | null>(null);
  const [levels, setLevels] = useState<Uint8ClampedArray | null>(null);
  const [selection, setSelection] = useState<Set<number>>(new Set());
  const [undoStack, setUndoStack] = useState<Uint8ClampedArray[]>([]);
  const [redoStack, setRedoStack] = useState<Uint8ClampedArray[]>([]);
  const [colorAssignments, setColorAssignments] = useState<Uint8ClampedArray | null>(null);

  useEffect(() => {
    let active = true;
    const image = new Image();
    image.onload = () => {
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
      const initial = initialRegionLevels(segmentation);
      setData({ segmentation, source: source.slice() });
      setLevels(initial);
      setSelection(new Set());
      setUndoStack([]);
      setRedoStack([]);
      setColorAssignments(new Uint8ClampedArray(width * height).fill(255));
    };
    image.src = imageUrl;
    return () => { active = false; };
  }, [imageUrl]);

  useEffect(() => {
    if (!data || !levels) return;
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
      onColorMapChange(null);
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
  }, [colorAssignments, colors, data, selection]);

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
  const selectCanvasRegion = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!data || !canvasRef.current) return;
    const bounds = canvasRef.current.getBoundingClientRect();
    const x = Math.min(data.segmentation.width - 1, Math.max(0, Math.floor((event.clientX - bounds.left) / bounds.width * data.segmentation.width)));
    const y = Math.min(data.segmentation.height - 1, Math.max(0, Math.floor((event.clientY - bounds.top) / bounds.height * data.segmentation.height)));
    const id = data.segmentation.regionIds[y * data.segmentation.width + x];
    setSelection((current) => {
      if (!event.shiftKey) return new Set([id]);
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
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
      <div className="region-editor-grid">
        <div className="region-canvas-panel">
          <span className="panel-label">2D-AUSWAHL · GRÜN MARKIERT</span>
          {data ? <canvas ref={canvasRef} onPointerDown={selectCanvasRegion} /> : <div className="editor-loading">Flächen werden erkannt …</div>}
        </div>
        <EditorReliefPreview segmentation={data?.segmentation ?? null} levels={levels} />
      </div>
      <div className="selection-toolbar">
        <button className="has-tooltip" disabled={!selection.size || !data} onClick={() => data && setSelection(expandRegionSelection(selection, data.segmentation.regions))}><Plus /> Angrenzend erweitern<SettingTooltip text={editorTooltips.expand} /></button>
        <button className="has-tooltip" disabled={!selection.size || !data} onClick={() => data && setSelection(reduceRegionSelection(selection, data.segmentation.regions))}><Minus /> Rand reduzieren<SettingTooltip text={editorTooltips.reduce} /></button>
        <button className="has-tooltip" disabled={selection.size !== 1 || !data} onClick={() => data && setSelection(selectSimilarRegions([...selection][0], data.segmentation.regions))}><WandSparkles /> Ähnliche Farbe<SettingTooltip text={editorTooltips.similar} /></button>
        <button className="has-tooltip" disabled={!data} onClick={() => data && setSelection(new Set(data.segmentation.regions.map((region) => region.id).filter((id) => !selection.has(id))))}><RotateCcw /> Umkehren<SettingTooltip text={editorTooltips.invert} /></button>
        <button className="has-tooltip" disabled={!selection.size} onClick={() => setSelection(new Set())}><X /> Auswahl aufheben<SettingTooltip text={editorTooltips.clear} /></button>
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
            type="range"
            min={0}
            max={255}
            step={1}
            value={currentLevel}
            disabled={!selection.size}
            onInput={(event) => setLevel(Number(event.currentTarget.value))}
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
        <button className="has-tooltip" disabled={!selection.size} onClick={() => setLevel(0)}><Scissors /> Vertiefen<SettingTooltip text={"Senkt die Auswahl auf die Grundfläche und erzeugt eine sichtbare Vertiefung.\nBeispiel: Eine ausgesparte Schriftfläche oder Nut vorbereiten."} /></button>
        <button className="has-tooltip" disabled={!selection.size || !data || !levels} onClick={() => data && levels && commitLevels(smoothSelectedLevels(levels, selection, data.segmentation))}>Glätten<SettingTooltip text={editorTooltips.smooth} /></button>
        <button className="has-tooltip" disabled={!selection.size || !data || !levels} onClick={() => {
          if (!data || !levels) return;
          const once = smoothSelectedLevels(levels, selection, data.segmentation);
          commitLevels(smoothSelectedLevels(once, selection, data.segmentation));
        }}>Kanten abrunden<SettingTooltip text={editorTooltips.round} /></button>
      </div>
      <div className="editor-status">
        <span>{selection.size ? selection.size <= 20 ? `✓ ${selection.size} Fläche${selection.size === 1 ? "" : "n"} grün ausgewählt` : "✓ Mehrere angrenzende Teilflächen grün ausgewählt" : "Klicke links im Bild auf eine Fläche – sie wird deutlich grün markiert."}</span>
        <strong>Danach unten „Relief erstellen“ klicken, um das Modell neu zu berechnen.</strong>
      </div>
    </section>
  );
}

function hexToRgb(color: string): [number, number, number] {
  return [Number.parseInt(color.slice(1, 3), 16), Number.parseInt(color.slice(3, 5), 16), Number.parseInt(color.slice(5, 7), 16)];
}

function EditorReliefPreview({ segmentation, levels }: { segmentation: Segmentation | null; levels: Uint8ClampedArray | null }) {
  const geometry = useMemo(() => {
    const next = new THREE.BufferGeometry();
    if (!segmentation || !levels) return next;
    const stride = Math.max(1, Math.ceil(Math.max(segmentation.width, segmentation.height) / 90));
    const columns = Math.ceil((segmentation.width - 1) / stride) + 1;
    const rows = Math.ceil((segmentation.height - 1) / stride) + 1;
    const positions: number[] = [], indices: number[] = [];
    for (let y = 0; y < rows; y += 1) for (let x = 0; x < columns; x += 1) {
      const sourceX = Math.min(segmentation.width - 1, x * stride);
      const sourceY = Math.min(segmentation.height - 1, y * stride);
      positions.push(x - columns / 2, levels[sourceY * segmentation.width + sourceX] / 32, y - rows / 2);
    }
    for (let y = 0; y < rows - 1; y += 1) for (let x = 0; x < columns - 1; x += 1) {
      const a = y * columns + x, b = a + 1, c = a + columns, d = c + 1;
      indices.push(a, d, b, a, c, d);
    }
    next.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    next.setIndex(indices);
    next.computeVertexNormals();
    return next;
  }, [segmentation, levels]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const size = Math.min(92, Math.max(segmentation?.width ?? 92, segmentation?.height ?? 92));
  return (
    <div className="editor-preview-panel">
      <span className="panel-label">LIVE-3D-VORSCHAU</span>
      <Canvas camera={{ position: [size * 0.65, size * 0.55, size * 0.9], fov: 42 }}>
        <ambientLight intensity={1.7} />
        <directionalLight position={[40, 80, 50]} intensity={3} />
        <mesh geometry={geometry}><meshStandardMaterial color="#b7f58a" roughness={0.65} side={THREE.DoubleSide} /></mesh>
        <OrbitControls makeDefault enableDamping />
      </Canvas>
    </div>
  );
}
