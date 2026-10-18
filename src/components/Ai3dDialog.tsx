import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { CheckCircle2, ChevronRight, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import {
  formatApiCost,
  type Ai3dDiagnostic,
  type Ai3dModel,
  type Ai3dResult,
  type CadPlan,
  type CadPrimitive,
  type SettingsStatus
} from "../types/studio";
import { SaveExportButton } from "./CommonControls";

export function Ai3dDialog({ close }: { close: () => void }) {
  const [prompt, setPrompt] = useState("Ein kleines Haus mit vier Fenstern, einem Stockwerk und einem Spitzdach");
  const [followUp, setFollowUp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagnostic, setDiagnostic] = useState<Ai3dDiagnostic>(null);
  const [result, setResult] = useState<Ai3dResult | null>(null);
  const [previousResults, setPreviousResults] = useState<Ai3dResult[]>([]);
  const [apiStatus, setApiStatus] = useState<SettingsStatus | null>(null);
  const [models, setModels] = useState<Ai3dModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<Ai3dModel["id"]>(() => {
    const saved = localStorage.getItem("ai-print-studio.ai3d-model");
    return saved === "gpt-5.6-sol" || saved === "gpt-5.6-luna" ? saved : "gpt-5.6-terra";
  });
  const [progress, setProgress] = useState({
    phase: "Anfrage vorbereiten",
    progress: 0,
    estimatedCostEur: 0,
    exactTokenUsage: false,
    inputTokens: 0,
    outputTokens: 0
  });

  const refreshApiStatus = useCallback(async () => {
    if (!window.desktop) return;
    setApiStatus(await window.desktop.getSettingsStatus());
  }, []);

  useEffect(() => {
    void refreshApiStatus();
    void window.desktop?.getAi3dModels().then(setModels);
  }, [refreshApiStatus]);
  useEffect(() => window.desktop?.onAi3dProgress((nextProgress) => setProgress(nextProgress)), []);
  useEffect(() => localStorage.setItem("ai-print-studio.ai3d-model", selectedModel), [selectedModel]);

  const [inlineApiKey, setInlineApiKey] = useState("");
  const [inlineBusy, setInlineBusy] = useState(false);

  async function saveInlineKey() {
    setInlineBusy(true); setError(null);
    try {
      if (!window.desktop) throw new Error("Die Desktop-Verbindung ist nicht verfügbar.");
      await window.desktop.saveOpenAiKey(inlineApiKey);
      await refreshApiStatus();
      setInlineApiKey("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Der API-Schlüssel konnte nicht gespeichert werden.");
    } finally { setInlineBusy(false); }
  }
  async function submit(instruction: string, existing?: Ai3dResult) {
    setProgress({
      phase: "Anfrage vorbereiten",
      progress: 2,
      estimatedCostEur: 0,
      exactTokenUsage: false,
      inputTokens: 0,
      outputTokens: 0
    });
    setBusy(true); setError(null); setDiagnostic(null);
    try {
      if (!window.desktop) throw new Error("Prompt zu 3D ist nur in der installierten App verfügbar.");
      const next = await window.desktop.createAi3d(instruction, existing?.plan, selectedModel);
      if (existing) setPreviousResults((current) => [...current, existing]);
      else setPreviousResults([]);
      setResult(next);
      setFollowUp("");
    } catch (nextError) {
      const nextDiagnostic = await window.desktop?.getLastAi3dDiagnostic() ?? null;
      setDiagnostic(nextDiagnostic);
      setError(nextDiagnostic?.message ?? (nextError instanceof Error ? nextError.message : "Das KI-Modell konnte nicht erstellt werden."));
    } finally { setBusy(false); }
  }
  function undoRevision() {
    setPreviousResults((current) => {
      const previous = current.at(-1);
      if (previous) setResult(previous);
      return current.slice(0, -1);
    });
  }
  const selectedModelDetails = models.find((model) => model.id === selectedModel);
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busy && close()}>
      <section className="modal ai3d-modal" role="dialog" aria-modal="true" aria-labelledby="ai3d-title">
        <button className="modal-close" onClick={close} disabled={busy} aria-label="Dialog schließen"><X /></button>
        <div className="modal-icon"><Sparkles /></div>
        <p className="eyebrow">KI · VOLLSTÄNDIGES 3D-OBJEKT</p>
        <h2 id="ai3d-title">{result ? "3D-Modell prüfen und weiterentwickeln" : "Prompt zu druckbarer STL"} <span className="beta-badge">BETA</span></h2>
        {!apiStatus?.openAiConfigured && (
          <div className="ai-key-inline-panel notice">
            <Sparkles />
            <div style={{ flex: 1 }}>
              <strong>OpenAI API-Schlüssel hinterlegen</strong>
              <p>Für Prompt zu 3D wird ein OpenAI API-Schlüssel benötigt. Er wird lokal gespeichert und steht dir direkt ohne Passwort zur Verfügung.</p>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input
                  type="password"
                  value={inlineApiKey}
                  onChange={(event) => setInlineApiKey(event.target.value)}
                  placeholder="sk-••••••••••••••••••••"
                  autoComplete="off"
                  spellCheck={false}
                  style={{ flex: 1, padding: "8px 12px", borderRadius: 8, background: "#1c222b", border: "1px solid #333d4b", color: "#f3f4f6" }}
                />
                <button
                  className="primary-button"
                  onClick={() => void saveInlineKey()}
                  disabled={inlineBusy || inlineApiKey.trim().length < 10}
                >
                  {inlineBusy ? "Speichert …" : "Schlüssel speichern"}
                </button>
              </div>
            </div>
          </div>
        )}
        {apiStatus?.openAiConfigured && !result && <div className="notice"><CheckCircle2 /> Der gespeicherte OpenAI API-Schlüssel ist einsatzbereit.</div>}
        {!result && <>
          <p>OpenAI erstellt einen validierten CAD-Bauplan aus druckbaren Grundkörpern; Vorschau, Geometrie und STL erzeugt die App anschließend lokal.</p>
          <div className="ai-model-picker">
            <label htmlFor="ai3d-model">OPENAI-MODELL</label>
            <select id="ai3d-model" value={selectedModel} onChange={(event) => setSelectedModel(event.target.value as Ai3dModel["id"])} disabled={busy}>
              {models.map((model) => <option key={model.id} value={model.id}>{model.name} · {model.role} · typisch ca. {formatApiCost(model.typicalCostEur)}</option>)}
            </select>
            {selectedModelDetails && <div className="ai-model-detail">
              <div><strong>{selectedModelDetails.role}</strong><span>{selectedModelDetails.description}</span></div>
              <div><small>TYPISCHE ANFRAGE</small><strong>ca. {formatApiCost(selectedModelDetails.typicalCostEur)}</strong></div>
              <div><small>PREIS JE 1 MIO. TOKEN</small><span>${selectedModelDetails.inputUsdPerMillion} Eingabe · ${selectedModelDetails.outputUsdPerMillion} Ausgabe</span></div>
            </div>}
            <small className="ai-model-disclaimer">„Typisch“ rechnet beispielhaft mit 1.000 Eingabe- und 2.000 Ausgabetoken. Komplexe Modelle und Folgeänderungen können abweichen.</small>
          </div>
          <label htmlFor="ai3d-prompt">OBJEKT BESCHREIBEN</label>
          <textarea id="ai3d-prompt" rows={5} maxLength={800} value={prompt} onChange={(event) => setPrompt(event.target.value)} disabled={busy} />
        </>}
        {result && <div className="ai3d-workspace">
          <CadPlanPreview plan={result.plan} />
          <div className="ai3d-result-summary">
            <div><strong>{result.plan.title}</strong><small>{result.plan.primitives.length} Bauteile · {result.plan.widthMm} × {result.plan.depthMm} × {result.plan.heightMm} mm</small></div>
            <div className="ai3d-result-actions">
              {previousResults.length > 0 && <button className="secondary-button" onClick={undoRevision} disabled={busy}>Letzte Änderung zurück</button>}
              <SaveExportButton path={result.stlPath} label="STL speichern" />
            </div>
          </div>
          <div className="ai3d-follow-up">
            <label htmlFor="ai3d-follow-up">MODELL WEITER BEARBEITEN</label>
            <textarea
              id="ai3d-follow-up"
              rows={3}
              maxLength={800}
              value={followUp}
              placeholder="Zum Beispiel: Füge unten links und rechts zwei Haustüren hinzu."
              onChange={(event) => setFollowUp(event.target.value)}
              disabled={busy}
            />
            <button className="primary-button" disabled={busy || followUp.trim().length < 3} onClick={() => void submit(followUp, result)}>
              {busy ? "Änderung wird konstruiert …" : "Änderung anwenden"} <ChevronRight />
            </button>
          </div>
        </div>}
        <div className="notice">{result ? "Für Änderungen werden deine Folgeanweisung und der aktuelle CAD-Bauplan an OpenAI übertragen. Vorschau, Geometrie und STL werden lokal erzeugt." : "Nur deine Beschreibung wird an OpenAI übertragen. Geometrie und STL werden anschließend lokal auf deinem Mac erzeugt."}</div>
        <div className="api-cost-notice">
          <strong>OpenAI-API-Kosten</strong>
          <span>OpenAI rechnet jede Erstellung und Folgeänderung direkt über deinen eigenen API-Account ab. Während der Erstellung zeigt AI Print Studio eine laufende Schätzung in Euro; der Tokenverbrauch wird nach Abschluss korrigiert. AI Print Studio erhebt keine zusätzlichen Gebühren.</span>
        </div>
        {busy && <div className="ai-live-progress" aria-live="polite">
          <div className="ai-progress-heading">
            <div>
              <strong>{progress.phase}</strong>
              <small>Phasenfortschritt · geschätzt</small>
            </div>
            <span>{Math.round(progress.progress)} %</span>
          </div>
          <div className="ai-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.progress)}>
            <span style={{ width: `${Math.max(2, progress.progress)}%` }} />
          </div>
          <div className="ai-cost-live">
            <div>
              <small>AKTUELLE API-KOSTEN</small>
              <strong>ca. {formatApiCost(progress.estimatedCostEur)}</strong>
            </div>
            <span>{progress.exactTokenUsage ? "Tokenverbrauch vollständig" : `${progress.inputTokens + progress.outputTokens} Token · laufende Schätzung`}</span>
          </div>
          <p>Der Balken zeigt den Arbeitsabschnitt, da OpenAI keinen exakten Gesamtfortschritt liefert. Die Euro-Anzeige nutzt die gemeldeten bzw. während des Streams geschätzten Token und einen festen USD/EUR-Schätzkurs.</p>
        </div>}
        {!busy && result?.billing && <div className="ai-cost-result">
          <span>Letzte OpenAI-Anfrage</span>
          <strong>ca. {formatApiCost(result.billing.estimatedCostEur)}</strong>
          <small>{result.billing.inputTokens.toLocaleString("de-DE")} Eingabe-Token · {result.billing.outputTokens.toLocaleString("de-DE")} Ausgabe-Token</small>
        </div>}
        {error && <div className="ai-error-diagnostic">
          <div>
            <strong>Erstellung fehlgeschlagen</strong>
            <p>{error}</p>
          </div>
          {diagnostic && <dl>
            <div><dt>Diagnose-ID</dt><dd>{diagnostic.id}</dd></div>
            <div><dt>Letzte Phase</dt><dd>{diagnostic.stage}</dd></div>
            <div><dt>Modell</dt><dd>{diagnostic.model}</dd></div>
            <div><dt>Laufzeit</dt><dd>{Math.max(1, Math.round(diagnostic.elapsedMs / 1000))} s</dd></div>
            <div><dt>Technische Ursache</dt><dd>{diagnostic.technicalCause}</dd></div>
          </dl>}
          <div className="ai-error-actions">
            {diagnostic && <button className="secondary-button" onClick={() => void window.desktop?.showItemInFolder(diagnostic.logPath)}>Diagnose-Log im Finder</button>}
            <button className="secondary-button" disabled={busy || (result ? followUp.trim().length < 3 : prompt.trim().length < 10)} onClick={() => void submit(result ? followUp : prompt, result ?? undefined)}>Bewusst erneut versuchen</button>
          </div>
          <small>Die App startet fehlgeschlagene API-Anfragen nicht automatisch neu, damit bei unklarer Übertragung keine doppelten OpenAI-Kosten entstehen. API-Schlüssel und Prompttext stehen nicht im Log.</small>
        </div>}
        <div className="modal-actions">
          <button className="secondary-button" onClick={close} disabled={busy}>{result ? "Schließen" : "Abbrechen"}</button>
          {!result && <button className="primary-button" disabled={busy || apiStatus?.openAiConfigured !== true || prompt.trim().length < 10} onClick={() => void submit(prompt)}>{busy ? "OpenAI konstruiert …" : "3D-Modell erstellen"} <ChevronRight /></button>}
        </div>
      </section>
    </div>
  );
}

function CadPlanPreview({ plan }: { plan: CadPlan }) {
  const span = Math.max(plan.widthMm, plan.depthMm, plan.heightMm, 20);
  return (
    <div className="cad-preview">
      <div className="panel-label">3D-VORSCHAU · ZIEHEN ZUM DREHEN</div>
      <Canvas camera={{ position: [span * 1.25, span * 0.9, span * 1.35], fov: 42, near: 0.1, far: span * 10 }} shadows>
        <color attach="background" args={["#090d13"]} />
        <ambientLight intensity={1.15} />
        <directionalLight position={[span, span * 1.5, span]} intensity={2.1} castShadow />
        <group position={[-plan.widthMm / 2, 0, -plan.depthMm / 2]}>
          {plan.primitives.map((primitive, index) => <CadPrimitiveMesh primitive={primitive} key={`${primitive.name}-${index}`} />)}
        </group>
        <gridHelper args={[span * 2.5, 24, "#344151", "#202936"]} position={[0, -0.05, 0]} />
        <OrbitControls makeDefault target={[0, plan.heightMm * 0.35, 0]} enableDamping minDistance={span * 0.65} maxDistance={span * 4} />
      </Canvas>
    </div>
  );
}

function CadPrimitiveMesh({ primitive }: { primitive: CadPrimitive }) {
  const [x, y, z] = primitive.position;
  const [width, depth, height] = primitive.size;
  const color = primitive.type === "roof" ? "#d98f5c" : primitive.name.toLowerCase().includes("fenster") ? "#71b8ed" : primitive.name.toLowerCase().includes("tür") ? "#9b6848" : "#d9e5cf";
  if (primitive.type === "cylinder") {
    return <mesh position={[x, z + height / 2, y]} castShadow receiveShadow>
      <cylinderGeometry args={[width / 2, width / 2, height, 48]} />
      <meshStandardMaterial color={color} roughness={0.68} metalness={0.02} />
    </mesh>;
  }
  if (primitive.type === "roof") {
    return <RoofMesh primitive={primitive} color={color} />;
  }
  if (primitive.type === "leaf") {
    return <LeafMesh primitive={primitive} color="#8fd58a" />;
  }
  return <mesh position={[x + width / 2, z + height / 2, y + depth / 2]} castShadow receiveShadow>
    <boxGeometry args={[width, height, depth]} />
    <meshStandardMaterial color={color} roughness={0.72} metalness={0.01} />
  </mesh>;
}

function LeafMesh({ primitive, color }: { primitive: CadPrimitive; color: string }) {
  const geometry = useMemo(() => {
    const [length, width, thickness] = primitive.size;
    const [px, py, pz] = primitive.position;
    const rotation = primitive.rotation ?? [0, 0, 0];
    const radians = rotation.map((angle) => angle * Math.PI / 180);
    const segments = 18;
    const positions: number[] = [];
    const indices: number[] = [];
    const transform = (point: [number, number, number]) => {
      let [x, y, z] = point;
      [y, z] = [y * Math.cos(radians[0]) - z * Math.sin(radians[0]), y * Math.sin(radians[0]) + z * Math.cos(radians[0])];
      [x, z] = [x * Math.cos(radians[1]) + z * Math.sin(radians[1]), -x * Math.sin(radians[1]) + z * Math.cos(radians[1])];
      [x, y] = [x * Math.cos(radians[2]) - y * Math.sin(radians[2]), x * Math.sin(radians[2]) + y * Math.cos(radians[2])];
      positions.push(x + px, z + pz, y + py);
    };
    for (let index = 0; index <= segments; index += 1) {
      const t = index / segments;
      const taper = Math.pow(Math.sin(Math.PI * t), 0.72);
      const halfWidth = Math.max(thickness * 0.35, width * 0.5 * taper);
      const arch = Math.sin(Math.PI * t) * length * 0.12 - t * t * length * 0.08;
      transform([length * t, -halfWidth, arch]);
      transform([length * t, halfWidth, arch]);
      transform([length * t, -halfWidth, arch + thickness]);
      transform([length * t, halfWidth, arch + thickness]);
    }
    for (let index = 0; index < segments; index += 1) {
      const current = index * 4, next = (index + 1) * 4;
      indices.push(
        current + 2, current + 3, next + 3, current + 2, next + 3, next + 2,
        current, next + 1, current + 1, current, next, next + 1,
        current, current + 2, next + 2, current, next + 2, next,
        current + 1, next + 1, next + 3, current + 1, next + 3, current + 3
      );
    }
    const end = segments * 4;
    indices.push(0, 1, 3, 0, 3, 2, end, end + 3, end + 1, end, end + 2, end + 3);
    const next = new THREE.BufferGeometry();
    next.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    next.setIndex(indices);
    next.computeVertexNormals();
    return next;
  }, [primitive]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} castShadow receiveShadow><meshStandardMaterial color={color} roughness={0.72} /></mesh>;
}

function RoofMesh({ primitive, color }: { primitive: CadPrimitive; color: string }) {
  const [x, y, z] = primitive.position;
  const [width, depth, height] = primitive.size;
  const geometry = useMemo(() => {
    const next = new THREE.BufferGeometry();
    next.setAttribute("position", new THREE.Float32BufferAttribute([
      -width / 2, -height / 2, -depth / 2, width / 2, -height / 2, -depth / 2, 0, height / 2, -depth / 2,
      -width / 2, -height / 2, depth / 2, width / 2, -height / 2, depth / 2, 0, height / 2, depth / 2
    ], 3));
    next.setIndex([0, 2, 1, 3, 4, 5, 0, 1, 4, 0, 4, 3, 1, 2, 5, 1, 5, 4, 2, 0, 3, 2, 3, 5]);
    next.computeVertexNormals();
    return next;
  }, [width, depth, height]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} position={[x + width / 2, z + height / 2, y + depth / 2]} castShadow receiveShadow>
    <meshStandardMaterial color={color} roughness={0.7} />
  </mesh>;
}
