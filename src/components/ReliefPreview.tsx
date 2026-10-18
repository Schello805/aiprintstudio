import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Box, CheckCircle2, Wrench, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { SettingTooltip } from "../SettingTooltip";
import { isExcellentReliefResult, type ReliefResult } from "../types/studio";
import { SaveExportButton } from "./CommonControls";

export function ReliefPreview({ result }: { result: NonNullable<ReliefResult> }) {
  const modelSize = Math.max(result.widthMm, result.heightMm);
  const [materialView, setMaterialView] = useState<"original" | "white" | "black" | "gold" | "light" | "normals" | "wireframe">(result.options.outputMode === "lithophane" ? "light" : "original");
  const [showGrid, setShowGrid] = useState(true);
  const [previewBackground, setPreviewBackground] = useState<"dark" | "light">("dark");
  const [autoRotate, setAutoRotate] = useState(false);
  const [cameraRevision, setCameraRevision] = useState(0);
  const geometries = useMemo(() => {
    const parts = result.preview.colorParts.length
      ? result.preview.colorParts
      : [{ color: "#B7F58A", indices: result.preview.indices }];
    return parts.map((part) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(result.preview.positions, 3));
      geometry.setIndex(part.indices);
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      return { geometry, color: part.color };
    });
  }, [result]);

  useEffect(() => () => geometries.forEach(({ geometry }) => geometry.dispose()), [geometries]);

  const isEmblemPreview = result.options.pipelineKind === "emblem";
  const previewColor = (color: string) => {
    if (materialView === "white") return "#F5F3EA";
    if (materialView === "black") return "#22262C";
    if (materialView === "gold") return "#D7A827";
    if (!isEmblemPreview) return color;
    const rgb = /^#?([0-9a-f]{6})$/i.exec(color)?.[1];
    if (!rgb) return color;
    const r = parseInt(rgb.slice(0, 2), 16), g = parseInt(rgb.slice(2, 4), 16), b = parseInt(rgb.slice(4, 6), 16);
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    // Nur die Vorschau wird entschärft: fast schwarze Wappen-Seiten sehen im
    // WebGL-Licht sonst welliger aus als der echte STL/3MF-Export im Slicer.
    return luminance < 34 ? "#24282E" : color;
  };

  return (
    <div className="preview-card">
      <div className="panel-label">3D-VORSCHAU · ZIEHEN ZUM DREHEN</div>
      <div className="preview-canvas">
        <Canvas
          key={`${result.stlPath}-${cameraRevision}`}
          camera={{ position: [modelSize * 0.82, modelSize * 0.72, modelSize * 1.25], fov: 31 }}
          dpr={[1.5, 2.5]}
          gl={{ antialias: true, powerPreference: "high-performance" }}
        >
        <color attach="background" args={[previewBackground === "dark" ? "#0b0e13" : "#F4F5F2"]} />
        <ambientLight intensity={materialView === "light" ? 0.45 : isEmblemPreview ? 2.1 : 1.5} />
        <directionalLight position={[60, 100, 80]} intensity={isEmblemPreview ? 1.65 : 3.2} />
        <directionalLight position={[-50, 35, -60]} intensity={isEmblemPreview ? 0.7 : 1.1} color="#b6d7ff" />
        {materialView === "light" && <pointLight position={[0, -modelSize * 0.45, 0]} intensity={180} color="#ffdca0" distance={modelSize * 2.5} />}
        {geometries.map(({ geometry, color }, index) => (
          <mesh geometry={geometry} key={`${color}-${index}`}>
            {materialView === "normals" ? <meshNormalMaterial side={THREE.DoubleSide} />
              : materialView === "wireframe" ? <meshBasicMaterial color="#79c7ff" wireframe />
              : materialView === "light" ? <meshPhysicalMaterial color="#fff4d6" roughness={0.4} transmission={0.72} thickness={result.options.baseMm + result.options.reliefMm} transparent opacity={0.94} side={THREE.DoubleSide} />
              : <meshStandardMaterial color={previewColor(color)} roughness={materialView === "gold" ? 0.24 : isEmblemPreview ? 0.92 : materialView === "black" ? 0.82 : 0.62} metalness={materialView === "gold" ? 0.68 : 0.02} side={THREE.FrontSide} />}
          </mesh>
        ))}
        {showGrid && <gridHelper args={[modelSize * 1.6, 18, previewBackground === "dark" ? "#2e3944" : "#89939D", previewBackground === "dark" ? "#1b222b" : "#CDD2D6"]} />}
        <OrbitControls makeDefault autoRotate={autoRotate} autoRotateSpeed={1.6} target={[0, result.options.baseMm + result.options.reliefMm / 2, 0]} minDistance={modelSize * 0.72} maxDistance={modelSize * 2.8} enableDamping />
        </Canvas>
      </div>
      <div className="preview-tools" aria-label="3D-Prüfansichten">
        <select value={materialView} onChange={(event) => setMaterialView(event.target.value as typeof materialView)} aria-label="Materialansicht">
          <option value="original">Originalfarben</option><option value="white">Weißes PLA</option><option value="black">Schwarzes PLA</option><option value="gold">Gold Silk</option><option value="light">Lithophan-Licht</option><option value="normals">Normalen prüfen</option><option value="wireframe">Drahtgitter</option>
        </select>
        <button className={autoRotate ? "active" : ""} onClick={() => setAutoRotate((current) => !current)}>Drehen</button>
        <button className={showGrid ? "active" : ""} onClick={() => setShowGrid((current) => !current)}>Druckbett</button>
        <button
          className={previewBackground === "light" ? "active" : ""}
          onClick={() => setPreviewBackground((current) => current === "dark" ? "light" : "dark")}
          title="Wechselt nur den Hintergrund der Vorschau. Der Export bleibt unverändert."
        >Hintergrund: {previewBackground === "dark" ? "Schwarz" : "Weiß"}</button>
        <button onClick={() => setCameraRevision((current) => current + 1)}>Kamera zurücksetzen</button>
      </div>
    </div>
  );
}

export function ReliefPreviewPlaceholder() {
  return (
    <div className="preview-card preview-placeholder">
      <div className="panel-label">3D-VORSCHAU</div>
      <Box />
      <strong>Dein Modell erscheint hier</strong>
      <span>Links eine Datei auswählen und die Verarbeitung starten.</span>
    </div>
  );
}

export function ReliefLoadingPreview({
  progress,
  onCancel
}: {
  progress: { phase: string; detail: string; progress: number };
  onCancel: () => void;
}) {
  return (
    <div className="preview-card preview-loading" aria-live="polite">
      <div className="panel-label">3D-VORSCHAU WIRD ERSTELLT</div>
      <div className="mesh-spinner" aria-hidden="true"><span /><span /><span /><Box /></div>
      <strong>{progress.phase}</strong>
      <p>{progress.detail}</p>
      <div className="relief-progress-line">
        <div className="relief-progress-track"><span style={{ width: `${Math.max(2, progress.progress)}%` }} /></div>
        <small>{Math.round(progress.progress)} %</small>
      </div>
      <button className="cancel-job-button" onClick={onCancel}><X /> Abbrechen</button>
    </div>
  );
}

export function ReliefResultCard({ result, optimize }: { result: NonNullable<ReliefResult>; optimize: () => void }) {
  const excellent = isExcellentReliefResult(result);
  return (
    <div className={`result-card preview-result ${result.printability.status}`}>
      <div className="result-check"><CheckCircle2 /></div>
      <div>
        <strong>{excellent ? "Hervorragendes Modell" : "Modell erfolgreich erstellt"} · Druckscore {result.printability.score}/100</strong>
        <p>{result.triangleCount.toLocaleString("de-DE")} Dreiecke · {result.widthMm.toFixed(0)} × {result.heightMm.toFixed(0)} mm · ca. {result.printability.estimatedVolumeCm3.toFixed(1)} cm³ · Kontur {result.contourQuality.score}/100{result.options.colors.length ? ` · ${result.options.colors.length} AMS-Farben` : ""}</p>
        <p>{result.printability.issues.join(" ")}</p>
        <div className="print-checks"><span className="ok" title="Dateistruktur, Koordinaten und grundlegende Meshintegrität von STL und 3MF wurden geprüft.">✓ Exportprüfung</span>{result.printability.checks.map((check) => <span className={check.status} key={check.label} title={check.detail}>{check.status === "ok" ? "✓" : "!"} {check.label}</span>)}</div>
      </div>
      <img className="heightmap-preview" src={result.heightmapDataUrl} alt="Berechnete Höhenkarte" title="Berechnete Höhenkarte" />
      {!excellent && <button className="optimize-button" onClick={optimize}><Wrench /> Automatisch optimieren</button>}
      <div className="export-save-actions">
        <SaveExportButton path={result.stlPath} label="STL speichern" />
        <SaveExportButton path={result.threeMfPath} label="3MF speichern" />
      </div>
    </div>
  );
}

export function SlicerAnalysisCard({ result }: { result: NonNullable<ReliefResult> }) {
  return (
    <section className="slicer-card">
      <div className="slicer-summary">
        <div className="slicer-title"><div><strong>Lokale Druckschätzung</strong><span>0,4-mm-Düse · {result.slicer.layerHeightMm.toFixed(1).replace(".", ",")} mm Schichthöhe</span></div><SettingTooltip text={"Schätzt den späteren Druck lokal aus der Modellgeometrie.\nBeispiel: Prüfe vor dem Export grob Druckdauer, Materialbedarf, Schichten und Farbwechsel."} /></div>
        <dl>
          <div><dt>Druckzeit <SettingTooltip text={"Geometriebasierte Näherung für die reine Druckdauer.\nBeispiel: Bewegungs- und Beschleunigungswerte deines Druckerprofils können die echte Zeit verändern."} /></dt><dd>ca. {Math.floor(result.slicer.estimatedMinutes / 60)} h {result.slicer.estimatedMinutes % 60} min</dd></div>
          <div><dt>Material <SettingTooltip text={"Schätzt Gewicht und Filamentlänge mit PLA-Dichte und 1,75-mm-Filament.\nBeispiel: Andere Materialien und die Fülldichte im Slicer verändern den realen Verbrauch."} /></dt><dd>{result.slicer.materialGrams.toFixed(1)} g · {result.slicer.filamentMeters.toFixed(1)} m</dd></div>
          <div><dt>Schichten <SettingTooltip text={"Berechnet die Zahl der horizontalen Lagen aus Modellhöhe und 0,2-mm-Schichthöhe.\nBeispiel: 5,4 mm Modellhöhe ergeben ungefähr 27 Schichten."} /></dt><dd>{result.slicer.layerCount}</dd></div>
          <div><dt>Farbwechsel <SettingTooltip text={"Schätzt notwendige Wechsel zwischen den aktivierten AMS-Farben über alle Schichten.\nBeispiel: Mehr gleichzeitig sichtbare Farben erhöhen Wechsel und Druckdauer."} /></dt><dd>{result.slicer.colorChanges}</dd></div>
        </dl>
      </div>
      <small>Geometriebasierte lokale Schätzung – die endgültige Druckzeit hängt vom Druckerprofil im Slicer ab.</small>
    </section>
  );
}
