import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { ChevronDown, ChevronUp, Minus, Plus, Redo2, RotateCcw, Undo2, WandSparkles, X } from "lucide-react";
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

type EditorData = {
  segmentation: Segmentation;
  source: Uint8ClampedArray;
};

export function RegionEditor({
  imageUrl,
  reliefMm,
  onHeightmapChange,
  onClose
}: {
  imageUrl: string;
  reliefMm: number;
  onHeightmapChange: (dataUrl: string | null) => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<EditorData | null>(null);
  const [levels, setLevels] = useState<Uint8ClampedArray | null>(null);
  const [selection, setSelection] = useState<Set<number>>(new Set());
  const [undoStack, setUndoStack] = useState<Uint8ClampedArray[]>([]);
  const [redoStack, setRedoStack] = useState<Uint8ClampedArray[]>([]);

  useEffect(() => {
    let active = true;
    const image = new Image();
    image.onload = () => {
      if (!active) return;
      const scale = Math.min(1, 220 / Math.max(image.naturalWidth, image.naturalHeight));
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
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    canvas.width = data.segmentation.width; canvas.height = data.segmentation.height;
    const context = canvas.getContext("2d");
    if (!context) return;
    const display = data.source.slice();
    for (let index = 0; index < data.segmentation.regionIds.length; index += 1) {
      if (!selection.has(data.segmentation.regionIds[index])) continue;
      const offset = index * 4;
      display[offset] = Math.round(display[offset] * 0.35 + 165 * 0.65);
      display[offset + 1] = Math.round(display[offset + 1] * 0.35 + 243 * 0.65);
      display[offset + 2] = Math.round(display[offset + 2] * 0.35 + 109 * 0.65);
      display[offset + 3] = 255;
    }
    context.putImageData(new ImageData(display, canvas.width, canvas.height), 0, 0);
  }, [data, selection]);

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
  const clickCanvas = (event: React.MouseEvent<HTMLCanvasElement>) => {
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
          <button onClick={undo} disabled={!undoStack.length} title="Rückgängig"><Undo2 /></button>
          <button onClick={redo} disabled={!redoStack.length} title="Wiederholen"><Redo2 /></button>
          <button onClick={onClose} title="Editor schließen"><X /></button>
        </div>
      </div>
      <div className="region-editor-grid">
        <div className="region-canvas-panel">
          <span className="panel-label">2D-AUSWAHL · GRÜN MARKIERT</span>
          {data ? <canvas ref={canvasRef} onClick={clickCanvas} /> : <div className="editor-loading">Flächen werden erkannt …</div>}
        </div>
        <EditorReliefPreview segmentation={data?.segmentation ?? null} levels={levels} />
      </div>
      <div className="selection-toolbar">
        <button disabled={!selection.size || !data} onClick={() => data && setSelection(expandRegionSelection(selection, data.segmentation.regions))}><Plus /> Angrenzend erweitern</button>
        <button disabled={!selection.size || !data} onClick={() => data && setSelection(reduceRegionSelection(selection, data.segmentation.regions))}><Minus /> Rand reduzieren</button>
        <button disabled={selection.size !== 1 || !data} onClick={() => data && setSelection(selectSimilarRegions([...selection][0], data.segmentation.regions))}><WandSparkles /> Ähnliche Farbe</button>
        <button disabled={!data} onClick={() => data && setSelection(new Set(data.segmentation.regions.map((region) => region.id).filter((id) => !selection.has(id))))}><RotateCcw /> Umkehren</button>
        <button disabled={!selection.size} onClick={() => setSelection(new Set())}><X /> Auswahl aufheben</button>
      </div>
      <div className="height-toolbar">
        <label>
          <span>HÖHE DER AUSWAHL</span>
          <input type="range" min={0} max={255} value={currentLevel} disabled={!selection.size} onChange={(event) => setLevel(Number(event.target.value))} />
          <strong>{(currentLevel / 255 * reliefMm).toFixed(1)} mm</strong>
        </label>
        <button disabled={!selection.size} onClick={() => setLevel(currentLevel + 20)}><ChevronUp /> Höher</button>
        <button disabled={!selection.size} onClick={() => setLevel(currentLevel - 20)}><ChevronDown /> Tiefer</button>
        <button disabled={!selection.size} onClick={() => setLevel(0)}>Auf Grundfläche</button>
        <button disabled={!selection.size || !data || !levels} onClick={() => data && levels && commitLevels(smoothSelectedLevels(levels, selection, data.segmentation))}>Glätten</button>
        <button disabled={!selection.size || !data || !levels} onClick={() => {
          if (!data || !levels) return;
          const once = smoothSelectedLevels(levels, selection, data.segmentation);
          commitLevels(smoothSelectedLevels(once, selection, data.segmentation));
        }}>Kanten abrunden</button>
      </div>
      <div className="editor-status">
        <span>{selection.size ? selection.size <= 20 ? `${selection.size} Fläche${selection.size === 1 ? "" : "n"} ausgewählt` : "Mehrere angrenzende Teilflächen ausgewählt" : "Klicke im Bild auf eine Fläche."}</span>
        <strong>Änderungen werden direkt für Vorschau und Export übernommen.</strong>
      </div>
    </section>
  );
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
