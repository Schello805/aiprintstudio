import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { ChevronDown, ChevronUp, Redo2, Undo2, X } from "lucide-react";
import {
  initialRegionLevels,
  segmentRgba,
  setSelectedRegionLevel,
  type Segmentation
} from "./domain/region-editor";
import { SettingTooltip } from "./SettingTooltip";

const editorTooltips = {
  undo: "Nimmt die letzte Höhenänderung zurück.\nBeispiel: Ein versehentlich angehobener Bereich erhält wieder seine vorherige Höhe.",
  redo: "Stellt die zuletzt zurückgenommene Höhenänderung wieder her.",
  height: "Legt die absolute Reliefhöhe der markierten Flächen fest.\nBeispiel: 3,0 mm hebt Rollen deutlich über die Grundfläche.",
  higher: "Hebt die Auswahl um eine kleine Höhenstufe an.\nBeispiel: Eine Kontur schrittweise stärker hervorheben.",
  lower: "Senkt die Auswahl um eine kleine Höhenstufe ab.\nBeispiel: Einen zu dominanten Bereich zurücknehmen."
};

type EditorData = {
  segmentation: Segmentation;
  source: Uint8ClampedArray;
};

export function RegionEditor({
  imageUrl,
  initialHeightmapUrl,
  reliefMm,
  onHeightmapChange,
  onClose
}: {
  imageUrl: string;
  initialHeightmapUrl?: string | null;
  reliefMm: number;
  onHeightmapChange: (dataUrl: string | null) => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sliderStartRef = useRef<Uint8ClampedArray | null>(null);
  // Die beim Öffnen sichtbare, bereits berechnete Form ist die verbindliche
  // Ausgangsbasis. Änderungen, die wir nach oben melden, dürfen den Editor
  // nicht erneut mit einer neuen Prop-Version initialisieren.
  const initialHeightmapRef = useRef(initialHeightmapUrl);
  const heightmapReadyRef = useRef(false);
  const [data, setData] = useState<EditorData | null>(null);
  const [levels, setLevels] = useState<Uint8ClampedArray | null>(null);
  const [selection, setSelection] = useState<Set<number>>(new Set());
  const [undoStack, setUndoStack] = useState<Uint8ClampedArray[]>([]);
  const [redoStack, setRedoStack] = useState<Uint8ClampedArray[]>([]);

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
      if (!active) return;
      setData({ segmentation, source: source.slice() });
      setLevels(initial);
      setSelection(new Set());
      setUndoStack([]);
      setRedoStack([]);
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
      if (!selection.has(data.segmentation.regionIds[index])) continue;
      const offset = index * 4;
      display[offset] = Math.round(display[offset] * 0.2 + 165 * 0.8);
      display[offset + 1] = Math.round(display[offset + 1] * 0.2 + 243 * 0.8);
      display[offset + 2] = Math.round(display[offset + 2] * 0.2 + 109 * 0.8);
      display[offset + 3] = 255;
    }
    context.putImageData(new ImageData(display, canvas.width, canvas.height), 0, 0);
  }, [data, levels, selection]);

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
  const handleCanvasDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!data || !levels) return;
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
  return (
    <section className="region-editor" aria-label="Motivbereiche bearbeiten">
      <div className="region-editor-heading">
        <div><span className="option-label">FLÄCHENEDITOR</span><strong>Erkannte Flächen anheben oder absenken</strong><p>Fläche links anklicken · Umschalt-Klick wählt mehrere Flächen.</p></div>
        <div className="editor-history">
          <button className="has-tooltip" onClick={undo} disabled={!undoStack.length} aria-description={editorTooltips.undo}><Undo2 /><SettingTooltip text={editorTooltips.undo} /></button>
          <button className="has-tooltip" onClick={redo} disabled={!redoStack.length} aria-description={editorTooltips.redo}><Redo2 /><SettingTooltip text={editorTooltips.redo} /></button>
          <button onClick={onClose} title="Editor schließen"><X /></button>
        </div>
      </div>
      <div className="region-editor-grid">
        <div className="region-canvas-panel">
          <span className="panel-label">2D-AUSWAHL · GRÜN MARKIERT</span>
          {data ? <canvas
            ref={canvasRef}
            className="editor-canvas tool-select"
            onPointerDown={handleCanvasDown}
          /> : <div className="editor-loading">Flächen werden erkannt …</div>}
        </div>
        <EditorReliefPreview segmentation={data?.segmentation ?? null} source={data?.source ?? null} levels={levels} reliefMm={reliefMm} />
      </div>
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
        <button disabled={!selection.size} onClick={() => setSelection(new Set())}><X /> Auswahl aufheben</button>
      </div>
      <div className="editor-status">
        <span>{selection.size ? selection.size <= 20 ? `✓ ${selection.size} Fläche${selection.size === 1 ? "" : "n"} grün ausgewählt` : "✓ Mehrere angrenzende Teilflächen grün ausgewählt" : "Klicke links im Bild auf eine Fläche – erst danach wird der Höhenregler aktiv."}</span>
        <strong>Danach unten „Relief erstellen“ klicken, um das Modell neu zu berechnen.</strong>
      </div>
    </section>
  );
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
