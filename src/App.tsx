import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import {
  Box,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Cpu,
  FolderOpen,
  Github,
  HardDrive,
  History,
  ImagePlus,
  Info,
  Layers3,
  MemoryStick,
  Palette,
  Save,
  Settings2,
  ShieldCheck,
  Sparkles,
  Type,
  UploadCloud,
  Wrench,
  X
} from "lucide-react";
import { RegionEditor } from "./RegionEditor";
import { SettingTooltip } from "./SettingTooltip";
import { extractColorPalette } from "./domain/color-palette";
import appLogoMark from "../build/icon-mark.png";
type View = "studio" | "history" | "settings" | "info";
type StudioTool = "home" | "image" | "text" | "prompt";
type LegalPage = "imprint" | "privacy" | "cookies" | null;
type SelectedImage = { path: string; name: string; size: number; width: number; height: number; suggestedProfile: "logo" | "photo"; dataUrl: string };
type ReliefResult = Awaited<ReturnType<NonNullable<typeof window.desktop>["createRelief"]>>;
type Ai3dResult = Awaited<ReturnType<NonNullable<typeof window.desktop>["createAi3d"]>>;
type Ai3dModel = Awaited<ReturnType<NonNullable<typeof window.desktop>["getAi3dModels"]>>[number];
type Ai3dDiagnostic = Awaited<ReturnType<NonNullable<typeof window.desktop>["getLastAi3dDiagnostic"]>>;
type CadPlan = Ai3dResult["plan"];
type CadPrimitive = CadPlan["primitives"][number];
type UpdateInfo = Awaited<ReturnType<NonNullable<typeof window.desktop>["checkForUpdate"]>>;

function formatApiCost(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: value < 0.01 ? 4 : 2,
    maximumFractionDigits: value < 0.01 ? 4 : 2
  }).format(value);
}

function formatStorage(bytes: number): string {
  return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(bytes / 1_000_000_000)} GB`;
}

type QualityProfile = "fast" | "balanced" | "fine" | "photo" | "logo";
type ProcessingMode = "auto" | "vector" | "wordmark" | "depth" | "height";
type HistoryEntry = {
  id: string; name: string; createdAt: string; stlPath: string; threeMfPath: string;
  triangleCount: number; widthMm: number; heightMm: number; profile: QualityProfile; score: number;
};
type StudioProject = {
  schemaVersion: 1;
  savedAt: string;
  source: SelectedImage;
  tool: "image" | "text";
  settings: {
    widthMm: number; baseMm: number; reliefMm: number; smoothing: number; detail: number;
    processingMode: ProcessingMode; profile: QualityProfile; raiseLightAreas: boolean;
    multicolorEnabled: boolean; colorCount: number; sourceColors: string[]; colors: string[];
    sideColorIndex: number; includeLogoBackground: boolean; optimizeForStandardNozzle: boolean;
    reduceTo250kTriangles: boolean;
  };
  editorHeightmap: string | null;
  editorColorMap: string | null;
};

const optimalResolution: Record<QualityProfile, number> = {
  fast: 192,
  balanced: 320,
  fine: 512,
  photo: 384,
  logo: 512
};

const modeTooltips: Record<ProcessingMode, string> = {
  auto: "Analysiert das Bild und verwendet automatisch die hochwertigste passende Methode.\nBeispiel: Ein Wappen nutzt saubere Flächen, ein Foto die lokale KI-Tiefenschätzung.",
  vector: "Bewahrt geschlossene Innenflächen und ordnet Motivbereichen feste Höhen zu.\nBeispiel: Weiße Felder und Rollen innerhalb eines Wappens bleiben erhalten.",
  wordmark: "Entfernt den Hintergrund auch aus geschlossenen Buchstaben und setzt das Motiv auf eine ruhige gemeinsame Höhe.\nBeispiel: Die Innenräume von a, e, d, o und ö bleiben offen.",
  depth: "Schätzt mit Depth Anything V2 die räumliche Tiefe eines Fotos.\nBeispiel: Eine Person wird vom Hintergrund räumlich getrennt.",
  height: "Übernimmt die Helligkeit des Bildes direkt als Höhe.\nBeispiel: Weiß entspricht hoch und Schwarz niedrig – oder umgekehrt."
};

const parameterTooltips = {
  width: "Bestimmt die Gesamtbreite des fertigen Modells; die Höhe folgt dem Bildformat.\nBeispiel: 100 mm erzeugt ein etwa handgroßes Wappen.",
  base: "Dicke der stabilen Platte unter dem Relief.\nBeispiel: 1,6 mm eignet sich meist für ein leichtes Wandschild.",
  relief: "Maximaler Höhenunterschied zwischen tiefster und höchster Motivfläche.\nBeispiel: 4 mm lässt Rollen deutlich aus dem Wappen hervortreten.",
  smoothing: "Glättet kleine Unebenheiten und Bildrauschen; hohe Werte entfernen Details.\nBeispiel: 2 glättet Kanten moderat, 4 eignet sich für unruhige Fotos.",
  detail: "Führt feine Bildinformationen nach der Glättung wieder zurück.\nBeispiel: 1 ist neutral, 1,5 betont feine Linien stärker.",
  dark: "Dunkle Bildbereiche werden höher als helle Bereiche ausgegeben.\nBeispiel: Schwarze Schrift steht erhaben auf weißem Grund.",
  light: "Helle Bildbereiche werden höher als dunkle Bereiche ausgegeben.\nBeispiel: Ein weißes Motiv steht erhaben auf schwarzem Grund."
};

const navigation = [
  { id: "studio" as const, label: "Studio", icon: Sparkles },
  { id: "history" as const, label: "Verlauf", icon: History },
  { id: "settings" as const, label: "Einstellungen", icon: Settings2 },
  { id: "info" as const, label: "Über & Technik", icon: Info }
];

export function App() {
  const [view, setView] = useState<View>("studio");
  const [studioTool, setStudioTool] = useState<StudioTool>("home");
  const [legalPage, setLegalPage] = useState<LegalPage>(null);
  const [version, setVersion] = useState("0.1.0");
  const [appMetrics, setAppMetrics] = useState<{
    cpuPercent: number;
    ramMb: number;
    totalMemoryMb: number;
    processCount: number;
    freeStorageBytes: number;
    totalStorageBytes: number;
    requiredDownloadBytes: number;
    downloadStorageSufficient: boolean;
  } | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateCheckFailed, setUpdateCheckFailed] = useState(false);
  const [file, setFile] = useState<SelectedImage | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reliefProgress, setReliefProgress] = useState({ phase: "Vorbereiten", detail: "Die lokale 3D-Engine wird gestartet …", progress: 0 });
  const activeReliefJob = useRef<string | null>(null);
  const [result, setResult] = useState<ReliefResult>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [raiseLightAreas, setRaiseLightAreas] = useState(false);
  const [profile, setProfile] = useState<QualityProfile>("balanced");
  const [widthMm, setWidthMm] = useState(100);
  const [baseMm, setBaseMm] = useState(1.6);
  const [reliefMm, setReliefMm] = useState(4);
  const [smoothing, setSmoothing] = useState(2);
  const [detail, setDetail] = useState(1);
  const [processingMode, setProcessingMode] = useState<ProcessingMode>("auto");
  const [includeLogoBackground, setIncludeLogoBackground] = useState(true);
  const [optimizeForStandardNozzle, setOptimizeForStandardNozzle] = useState(true);
  const [reduceTo250kTriangles, setReduceTo250kTriangles] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorHeightmap, setEditorHeightmap] = useState<string | null>(null);
  const [editorColorMap, setEditorColorMap] = useState<string | null>(null);
  const [multicolorEnabled, setMulticolorEnabled] = useState(false);
  const [colorCount, setColorCount] = useState(4);
  const [sourceColors, setSourceColors] = useState(["#111827", "#F5F5F4", "#22C55E", "#F59E0B"]);
  const [colors, setColors] = useState(["#111827", "#F5F5F4", "#22C55E", "#F59E0B"]);
  const [sideColorIndex, setSideColorIndex] = useState(0);
  const [textDialogOpen, setTextDialogOpen] = useState(false);
  const [ai3dDialogOpen, setAi3dDialogOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem("ai-print-studio-history") ?? "[]") as HistoryEntry[]; }
    catch { return []; }
  });

  useEffect(() => {
    void window.desktop?.getVersion().then(setVersion);
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = () => void window.desktop?.getAppMetrics()
      .then((metrics) => { if (active) setAppMetrics(metrics); })
      .catch(() => undefined);
    refresh();
    const timer = window.setInterval(refresh, 1_500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const check = () => {
      if (!window.desktop) return;
      void window.desktop.checkForUpdate()
        .then((update) => {
          if (!active) return;
          setUpdateInfo(update);
          setUpdateCheckFailed(false);
        })
        .catch(() => {
          if (active) setUpdateCheckFailed(true);
        });
    };
    const initial = window.setTimeout(check, 1_500);
    const timer = window.setInterval(check, 6 * 60 * 60 * 1_000);
    return () => {
      active = false;
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => window.desktop?.onReliefProgress((jobId, progress) => {
    if (activeReliefJob.current === jobId) setReliefProgress(progress);
  }), []);

  useEffect(() => {
    if (!preview) return;
    let active = true;
    void detectPalette(preview, colorCount)
      .then((palette) => {
        if (!active) return;
        setSourceColors(palette);
        setColors(palette);
        setSideColorIndex(darkestColorIndex(palette));
      })
      .catch(() => {
        if (!active) return;
        setSourceColors((current) => resizePalette(current, colorCount));
        setColors((current) => resizePalette(current, colorCount));
      });
    return () => { active = false; };
  }, [preview, colorCount]);

  async function selectFile() {
    setFileError(null);
    setUploadStatus("Dateiauswahl wird geöffnet …");
    try {
      if (!window.desktop) {
        throw new Error("Die Desktop-Verbindung ist nicht verfügbar. Bitte starte die installierte App neu und verwende nicht die Browser-Vorschau.");
      }
      const selected = await window.desktop.selectImage();
      if (!selected) {
        setUploadStatus("Keine Datei ausgewählt.");
        return;
      }
      applySelectedImage(selected);
      setStudioTool("image");
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Das Bild konnte nicht geöffnet werden.");
      setUploadStatus(null);
    }
  }

  function applySelectedImage(selected: SelectedImage) {
    setFileError(null);
    setFile(selected);
    setPreview(selected.dataUrl);
    setProfile(selected.suggestedProfile);
    setProcessingMode(selected.suggestedProfile === "logo" ? "vector" : "depth");
    setResult(null);
    setEditorOpen(false);
    setEditorHeightmap(null);
    setEditorColorMap(null);
    setUploadStatus(`${selected.width} × ${selected.height} Pixel geladen · Profil „${selected.suggestedProfile === "logo" ? "Logo" : "Foto"}“ empfohlen.`);
  }

  async function createTextSource(options: Parameters<NonNullable<typeof window.desktop>["createTextImage"]>[0]) {
    if (!window.desktop) throw new Error("Text zu STL ist nur in der installierten Desktop-App verfügbar.");
    const selected = await window.desktop.createTextImage(options);
    applySelectedImage(selected);
    setStudioTool("text");
    setTextDialogOpen(false);
  }

  async function generateRelief(repair = false) {
    if (!file) return;
    const jobId = crypto.randomUUID();
    activeReliefJob.current = jobId;
    setReliefProgress({ phase: "Vorbereiten", detail: "Die lokale 3D-Engine wird gestartet …", progress: 1 });
    setBusy(true); setFileError(null); setResult(null);
    try {
      if (!window.desktop) throw new Error("Die lokale 3D-Engine ist nicht erreichbar. Bitte starte die App neu.");
      const effectiveMode = repair && file.suggestedProfile === "logo"
        ? "wordmark"
        : processingMode === "auto" ? (file.suggestedProfile === "logo" ? "auto" : "depth") : processingMode;
      const effectiveResolution = effectiveMode === "auto" && file.suggestedProfile === "logo"
        ? 384
        : repair ? Math.min(384, optimalResolution[profile]) : optimalResolution[profile];
      const request: Parameters<NonNullable<typeof window.desktop>["createRelief"]>[2] = {
        widthMm, baseMm: repair ? Math.max(1.6, baseMm) : baseMm, reliefMm,
        resolution: effectiveResolution,
        invert: raiseLightAreas, profile, smoothing, detail,
        processingMode: effectiveMode,
        includeBackground: effectiveMode === "wordmark" && (repair || includeLogoBackground),
        nozzleMm: 0.4,
        minimumFeatureMm: repair || (optimizeForStandardNozzle && (effectiveMode === "wordmark" || (effectiveMode === "auto" && file.suggestedProfile === "logo"))) ? 0.8 : 0,
        sourceColors: multicolorEnabled ? sourceColors : [],
        colors: multicolorEnabled ? colors : [],
        sideColorIndex: multicolorEnabled ? sideColorIndex : 0
      };
      let currentResolution = effectiveResolution;
      let next = await window.desktop.createRelief(jobId, file.path, request, editorHeightmap ?? undefined, editorColorMap ?? undefined);
      for (let attempt = 0; next && reduceTo250kTriangles && next.triangleCount > 250_000 && attempt < 3; attempt += 1) {
        const reducedResolution = Math.max(64, Math.floor(currentResolution * Math.sqrt(235_000 / next.triangleCount)));
        if (reducedResolution >= currentResolution) break;
        setReliefProgress({
          phase: "Meshgröße reduzieren",
          detail: `Die Auflösung wird automatisch angepasst (${next.triangleCount.toLocaleString("de-DE")} → maximal 250.000 Dreiecke) …`,
          progress: 8
        });
        currentResolution = reducedResolution;
        next = await window.desktop.createRelief(jobId, file.path, {
          ...request,
          resolution: currentResolution
        }, editorHeightmap ?? undefined, editorColorMap ?? undefined);
      }
      if (next) {
        setResult(next);
        const entry: HistoryEntry = {
          id: crypto.randomUUID(), name: file.name, createdAt: new Date().toISOString(),
          stlPath: next.stlPath, threeMfPath: next.threeMfPath, triangleCount: next.triangleCount,
          widthMm: next.widthMm, heightMm: next.heightMm, profile, score: next.printability.score
        };
        setHistory((current) => {
          const updated = [entry, ...current].slice(0, 50);
          localStorage.setItem("ai-print-studio-history", JSON.stringify(updated));
          return updated;
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Das Modell konnte nicht erstellt werden.";
      if (message.includes("Vorgang abgebrochen")) setUploadStatus("Erstellung abgebrochen – dein bisheriger Studio-Stand bleibt erhalten.");
      else setFileError(message);
    } finally {
      if (activeReliefJob.current === jobId) activeReliefJob.current = null;
      setBusy(false);
    }
  }

  async function repairAndRegenerate() {
    if (!window.confirm("Druckprobleme automatisch korrigieren?\n\nDie App verstärkt Details auf 0,8 mm, verbindet Logo und Hintergrund, reduziert die Meshgröße und stellt mindestens 1,6 mm Grundplatte sicher.")) return;
    setOptimizeForStandardNozzle(true);
    setBaseMm((current) => Math.max(1.6, current));
    if (file?.suggestedProfile === "logo") {
      setProcessingMode("wordmark");
      setIncludeLogoBackground(true);
    }
    await generateRelief(true);
  }

  function currentProject(): StudioProject | null {
    if (!file || studioTool === "prompt" || studioTool === "home") return null;
    return {
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      source: file,
      tool: studioTool,
      settings: {
        widthMm, baseMm, reliefMm, smoothing, detail, processingMode, profile, raiseLightAreas,
        multicolorEnabled, colorCount, sourceColors, colors, sideColorIndex,
        includeLogoBackground, optimizeForStandardNozzle
        ,reduceTo250kTriangles
      },
      editorHeightmap,
      editorColorMap
    };
  }

  async function saveProject() {
    const project = currentProject();
    if (!project || !window.desktop) return;
    try {
      const path = await window.desktop.saveProject(project);
      if (path) setUploadStatus(`Projekt gespeichert: ${path.split("/").at(-1)}`);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Das Projekt konnte nicht gespeichert werden.");
    }
  }

  async function openProject() {
    if (!window.desktop) return;
    try {
      const loaded = await window.desktop.openProject() as StudioProject | null;
      if (!loaded?.source || loaded.schemaVersion !== 1) return;
      const settings = loaded.settings;
      setView("studio"); setStudioTool(loaded.tool); setFile(loaded.source); setPreview(loaded.source.dataUrl);
      setWidthMm(settings.widthMm); setBaseMm(settings.baseMm); setReliefMm(settings.reliefMm);
      setSmoothing(settings.smoothing); setDetail(settings.detail); setProcessingMode(settings.processingMode);
      setProfile(settings.profile); setRaiseLightAreas(settings.raiseLightAreas);
      setMulticolorEnabled(settings.multicolorEnabled); setColorCount(settings.colorCount);
      setSourceColors(settings.sourceColors); setColors(settings.colors); setSideColorIndex(settings.sideColorIndex);
      setIncludeLogoBackground(settings.includeLogoBackground); setOptimizeForStandardNozzle(settings.optimizeForStandardNozzle);
      setReduceTo250kTriangles(settings.reduceTo250kTriangles ?? false);
      setEditorHeightmap(loaded.editorHeightmap); setEditorColorMap(loaded.editorColorMap);
      setResult(null); setEditorOpen(false); setFileError(null); setUploadStatus("Projekt vollständig wiederhergestellt.");
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Das Projekt konnte nicht geöffnet werden.");
    }
  }

  async function cancelRelief() {
    const jobId = activeReliefJob.current;
    if (!jobId || !window.desktop) return;
    setReliefProgress((current) => ({
      ...current,
      phase: "Wird abgebrochen",
      detail: "Worker und laufende Berechnung werden sicher beendet …"
    }));
    await window.desktop.cancelRelief(jobId);
  }

  const updateEditorHeightmap = useCallback((dataUrl: string | null) => {
    setEditorHeightmap(dataUrl);
    setResult(null);
  }, []);
  const updateEditorColorMap = useCallback((dataUrl: string | null) => {
    setEditorColorMap(dataUrl);
    setResult(null);
  }, []);

  function returnToToolSelection() {
    const hasProgress = Boolean(file || result || editorHeightmap || editorColorMap);
    if (hasProgress && !window.confirm("Aktuellen Studio-Stand verwerfen?\n\nBild, Einstellungen, Farbauswahl und noch nicht exportierte Änderungen gehen dabei verloren.")) return;
    setStudioTool("home");
    setFile(null);
    setPreview(null);
    setResult(null);
    setEditorOpen(false);
    setEditorHeightmap(null);
    setEditorColorMap(null);
  }

  if (legalPage) {
    return <LegalView page={legalPage} onClose={() => setLegalPage(null)} version={version} />;
  }

  return (
    <div className="app-shell">
      <div className="window-titlebar" aria-hidden="true" />
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><img src={appLogoMark} alt="" /></div>
          <div><strong>AI Print</strong><span>STUDIO</span></div>
        </div>
        <nav aria-label="Hauptnavigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button key={id} className={view === id ? "nav-item active" : "nav-item"} onClick={() => setView(id)}>
              <Icon size={19} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-status sidebar-monitor">
          <div className="monitor-heading"><span className="status-dot" /><div><strong>Lokale Verarbeitung</strong><span>{busy ? "Berechnung läuft" : "Bereit · läuft offline"}</span></div></div>
          <div className="monitor-metric">
            <div><Cpu /><span>APP CPU</span><strong>{appMetrics ? `${appMetrics.cpuPercent.toFixed(0)} %` : "–"}</strong></div>
            <span className="monitor-track"><span style={{ width: `${Math.min(100, appMetrics?.cpuPercent ?? 0)}%` }} /></span>
          </div>
          <div className="monitor-metric">
            <div><MemoryStick /><span>APP RAM</span><strong>{appMetrics ? `${Math.round(appMetrics.ramMb)} MB` : "–"}</strong></div>
            <span className="monitor-track memory"><span style={{ width: `${Math.min(100, appMetrics ? appMetrics.ramMb / appMetrics.totalMemoryMb * 100 : 0)}%` }} /></span>
          </div>
          <div className={`monitor-metric storage ${appMetrics && !appMetrics.downloadStorageSufficient ? "insufficient" : ""}`}>
            <div><HardDrive /><span>FREIER SPEICHER</span><strong>{appMetrics?.freeStorageBytes ? formatStorage(appMetrics.freeStorageBytes) : "–"}</strong></div>
            <span className="monitor-track storage"><span style={{ width: `${Math.min(100, appMetrics?.totalStorageBytes ? appMetrics.freeStorageBytes / appMetrics.totalStorageBytes * 100 : 0)}%` }} /></span>
            {appMetrics?.freeStorageBytes ? (
              <em>{appMetrics.downloadStorageSufficient
                ? `Bereit für Downloads · mindestens ${formatStorage(appMetrics.requiredDownloadBytes)} benötigt`
                : `Zu wenig für das 3D-Modell · ${formatStorage(appMetrics.requiredDownloadBytes)} benötigt`}</em>
            ) : <em>Speicherprüfung nicht verfügbar</em>}
          </div>
          <div className={`monitor-update ${updateInfo?.available ? "available" : ""}`}>
            <UploadCloud />
            <div>
              <span>APP-UPDATE</span>
              <strong>{updateInfo?.available
                ? `Version ${updateInfo.latestVersion} verfügbar`
                : updateInfo
                  ? `Version ${updateInfo.currentVersion} aktuell`
                  : updateCheckFailed
                    ? "Prüfung momentan nicht möglich"
                    : "Wird geprüft …"}</strong>
            </div>
            {updateInfo?.available && <button onClick={() => void window.desktop?.openExternal(updateInfo.url)}>Öffnen</button>}
          </div>
          <small>{appMetrics ? `${appMetrics.processCount} App-Prozesse · Live` : "Messung wird gestartet …"}</small>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div><p className="eyebrow">LOKALE 3D-WERKSTATT</p><h1>{view === "studio" ? "Neues Modell" : view === "history" ? "Verlauf" : view === "settings" ? "Einstellungen" : "Über & Technik"}</h1></div>
          <div className="privacy-pill"><ShieldCheck size={16} /> Verarbeitung auf deinem Mac</div>
        </header>

        {view === "studio" && studioTool === "home" && (
          <StudioHub
            openImage={() => void selectFile()}
            openText={() => { setStudioTool("text"); setTextDialogOpen(true); }}
            openPrompt={() => { setStudioTool("prompt"); setAi3dDialogOpen(true); }}
            openProject={() => void openProject()}
          />
        )}

        {view === "studio" && studioTool !== "home" && (
          <section className="workspace">
            <div className="tool-context">
              <button onClick={returnToToolSelection}>← Alle Werkzeuge</button>
              <span>{studioTool === "image" ? <ImagePlus /> : studioTool === "text" ? <Type /> : <Sparkles />}{studioTool === "image" ? "Bild zu 3D" : studioTool === "text" ? "Schrift zu 3D" : "Prompt zu 3D"}</span>
              {studioTool !== "prompt" && <div className="project-actions">
                <button onClick={() => void openProject()}><FolderOpen /> Projekt öffnen</button>
                <button disabled={!file} onClick={() => void saveProject()}><Save /> Projekt speichern</button>
              </div>}
            </div>
            <div className="intro">
              <h2>{studioTool === "text" ? "Von Schrift zum druckbaren Objekt." : studioTool === "prompt" ? "Von deiner Idee zum vollständigen 3D-Modell." : "Vom Bild zum druckbaren Objekt."}</h2>
              <p>{studioTool === "text" ? "Gestalte saubere Schriftzüge und exportiere sie lokal als STL oder farbige 3MF." : studioTool === "prompt" ? "Beschreibe dein Objekt. Die KI optimiert die Konstruktion und erzeugt eine druckbare STL." : "Lade eine klare Aufnahme hoch. AI Print Studio rekonstruiert, repariert und exportiert dein Modell lokal."}</p>
            </div>
            {studioTool === "prompt" && !ai3dDialogOpen && (
              <div className="prompt-workspace-card">
                <Sparkles /><div><strong>KI-Modell aus einer Beschreibung</strong><p>Erstelle beispielsweise ein Haus, eine Figur oder ein Ersatzteil als vollständiges 3D-Objekt.</p></div>
                <button className="primary-button" onClick={() => setAi3dDialogOpen(true)}>Prompt eingeben <ChevronRight /></button>
              </div>
            )}
            {studioTool !== "prompt" && (
              <>
            <div className={result ? "preview-stage sticky" : "preview-stage"}>
            <div className={result ? "comparison-grid" : "comparison-grid single"}>
              <div
                className={preview ? "upload-card has-preview" : "upload-card"}
                onClick={() => void selectFile()}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => event.key === "Enter" && void selectFile()}
              >
                {preview ? (
                  <><div className="panel-label">ORIGINALBILD</div><img src={preview} alt="Vorschau des ausgewählten Bildes" /><div className="file-overlay"><ImagePlus size={18} /> Bild wechseln</div></>
                ) : (
                  <><div className="upload-icon">{studioTool === "text" ? <Type size={32} /> : <UploadCloud size={32} />}</div><h3>{studioTool === "text" ? "Schriftzug gestalten" : "Bild oder SVG auswählen"}</h3><p>{studioTool === "text" ? "Text, Schriftart und Ausrichtung festlegen" : "PNG, JPG, WEBP oder SVG"}</p><div className="source-actions"><button className="choose-file-button" onClick={(event) => { event.stopPropagation(); if (studioTool === "text") setTextDialogOpen(true); else void selectFile(); }}>{studioTool === "text" ? "Text eingeben" : "Datei auswählen"}</button></div><span>Die Verarbeitung erfolgt vollständig lokal</span></>
                )}
              </div>
              {result && <ReliefPreview result={result} />}
            </div>
            {fileError && <div className="error-banner" role="alert"><strong>Verarbeitung fehlgeschlagen</strong><span>{fileError}</span><button onClick={() => setFileError(null)} aria-label="Fehlermeldung schließen"><X /></button></div>}
            {uploadStatus && !fileError && <div className="upload-status"><CheckCircle2 /> {uploadStatus}</div>}
            {busy && (
              <div className="progress-card relief-progress-card">
                <div className="mesh-spinner" aria-hidden="true"><span /><span /><span /><Box /></div>
                <div className="progress-copy">
                  <strong>{reliefProgress.phase}</strong>
                  <p>{reliefProgress.detail}</p>
                  <div className="relief-progress-line">
                    <div className="relief-progress-track"><span style={{ width: `${Math.max(2, reliefProgress.progress)}%` }} /></div>
                    <small>{Math.round(reliefProgress.progress)} %</small>
                  </div>
                </div>
                <button className="cancel-job-button" onClick={() => void cancelRelief()}><X /> Abbrechen</button>
              </div>
            )}
            {result && !busy && <>
              <ReliefResultCard result={result} optimize={() => void repairAndRegenerate()} />
              <SlicerAnalysisCard result={result} />
            </>}
            </div>
            {file && !editorOpen && (
              <button className={editorHeightmap ? "editor-launch has-tooltip active" : "editor-launch has-tooltip"} onClick={() => setEditorOpen(true)}>
                <Layers3 /> {editorHeightmap ? "Flächenkorrekturen weiter bearbeiten" : "Motivbereiche manuell korrigieren"}
                {editorHeightmap && <span>Aktiv</span>}
                <SettingTooltip text={"Öffnet den Flächeneditor für gezielte Höhenkorrekturen.\nBeispiel: Rollen im Wappen auswählen und unabhängig vom Hintergrund anheben."} />
              </button>
            )}
            {file && preview && editorOpen && (
              <RegionEditor
                imageUrl={preview}
                reliefMm={reliefMm}
                colors={multicolorEnabled ? colors : []}
                onHeightmapChange={updateEditorHeightmap}
                onColorMapChange={updateEditorColorMap}
                onClose={() => setEditorOpen(false)}
              />
            )}
            <div className="workflow-row" aria-label="Verarbeitungsschritte">
              {[
                studioTool === "text" ? "Schrift rendern" : "Bild analysieren",
                studioTool === "text" ? "Konturen extrudieren" : "3D rekonstruieren",
                "Mesh reparieren",
                "Exportieren"
              ].map((step, index) => (
                <div className="workflow-step" key={step}><span>{index + 1}</span><p>{step}</p>{index < 3 && <ChevronRight size={15} />}</div>
              ))}
            </div>
            <div className="conversion-options">
              {studioTool === "image" ? <div className="option-group">
                <div className="option-heading"><span className="option-label">ERGEBNISART</span><span className="quality-pill">Optimale Qualität automatisch aktiv</span></div>
                <div className="mode-grid primary-modes">
                  <button className={processingMode === "auto" ? "mode-option has-tooltip selected" : "mode-option has-tooltip"} onClick={() => { setProcessingMode("auto"); if (file) setProfile(file.suggestedProfile); }} aria-description={modeTooltips.auto}>
                    <Sparkles /><div><strong>Automatisch</strong><span>Beste Methode wird gewählt</span></div><SettingTooltip text={modeTooltips.auto} />
                  </button>
                  <button className={processingMode === "vector" ? "mode-option has-tooltip selected" : "mode-option has-tooltip"} onClick={() => { setProcessingMode("vector"); setProfile("logo"); }} aria-description={modeTooltips.vector}>
                    <Layers3 /><div><strong>Wappen & Emblem</strong><span>Innenflächen bleiben erhalten</span></div><SettingTooltip text={modeTooltips.vector} />
                  </button>
                  <button className={processingMode === "wordmark" ? "mode-option has-tooltip selected" : "mode-option has-tooltip"} onClick={() => { setProcessingMode("wordmark"); setProfile("logo"); }} aria-description={modeTooltips.wordmark}>
                    <Type /><div><strong>Logo mit Text</strong><span>Offene Buchstabenräume</span></div><SettingTooltip text={modeTooltips.wordmark} />
                  </button>
                  <button className={processingMode === "depth" ? "mode-option has-tooltip selected" : "mode-option has-tooltip"} onClick={() => { setProcessingMode("depth"); setProfile("photo"); }} aria-description={modeTooltips.depth}>
                    <Box /><div><strong>Foto & 3D-Tiefe</strong><span>Lokale KI-Tiefenschätzung</span></div><SettingTooltip text={modeTooltips.depth} />
                  </button>
                </div>
              </div> : <div className="text-quality-summary"><Type /><div><strong>Saubere Schriftkonturen automatisch aktiv</strong><span>Die App verwendet die lokale Logo-Engine mit hoher Konturauflösung.</span></div></div>}
              <>
                  <div className="parameter-grid essential-parameters">
                    <NumberField label="BREITE" tooltip={parameterTooltips.width} value={widthMm} unit="mm" min={20} max={300} step={5} setValue={setWidthMm} />
                    <NumberField label="GRUNDPLATTE" tooltip={parameterTooltips.base} value={baseMm} unit="mm" min={0.8} max={10} step={0.2} setValue={setBaseMm} />
                    <NumberField label="RELIEF" tooltip={parameterTooltips.relief} value={reliefMm} unit="mm" min={0.5} max={20} step={0.5} setValue={setReliefMm} />
                  </div>
                  {processingMode === "wordmark" && (
                    <button
                      className={includeLogoBackground ? "background-toggle selected" : "background-toggle"}
                      onClick={() => setIncludeLogoBackground((current) => !current)}
                      aria-pressed={includeLogoBackground}
                    >
                      <Layers3 />
                      <div>
                        <strong>Hintergrund mitdrucken</strong>
                        <span>{includeLogoBackground ? "Grundfläche bleibt in Vorschau, STL und 3MF erhalten" : "Nur Signet und Schrift werden freigestellt exportiert"}</span>
                      </div>
                      <SettingTooltip text={"Legt fest, ob die Bildfläche als zusammenhängende Grundplatte Teil des Modells bleibt.\nBeispiel: Aktiv für ein quadratisches App-Logo; deaktiviert für einen freistehenden Schriftzug."} />
                      <span className="toggle-track"><span /></span>
                    </button>
                  )}
                  <button
                    className={reduceTo250kTriangles ? "background-toggle selected" : "background-toggle"}
                    onClick={() => setReduceTo250kTriangles((current) => !current)}
                    aria-pressed={reduceTo250kTriangles}
                  >
                    <Layers3 />
                    <div>
                      <strong>Auf 250.000 Dreiecke reduzieren</strong>
                      <span>{reduceTo250kTriangles ? "Meshgröße wird beim Erstellen automatisch begrenzt" : "Volle Detailauflösung beibehalten"}</span>
                    </div>
                    <SettingTooltip text={"Reduziert die Rasterauflösung nur dann automatisch, wenn das fertige Mesh mehr als 250.000 Dreiecke enthält.\nBeispiel: Erleichtert den Import in CAD- und Online-Programme mit begrenzter Meshgröße."} />
                    <span className="toggle-track"><span /></span>
                  </button>
                  {processingMode === "wordmark" && (
                    <button
                      className={optimizeForStandardNozzle ? "background-toggle selected" : "background-toggle"}
                      onClick={() => setOptimizeForStandardNozzle((current) => !current)}
                      aria-pressed={optimizeForStandardNozzle}
                    >
                      <Settings2 />
                      <div>
                        <strong>Für 0,4-mm-Düse optimieren</strong>
                        <span>{optimizeForStandardNozzle ? "Feine Logo-Stege werden automatisch auf mindestens 0,8 mm verstärkt" : "Originalbreiten bleiben unverändert"}</span>
                      </div>
                      <SettingTooltip text={"Verstärkt zu dünne Logo- und Schriftbereiche für zwei druckbare Linien mit der üblichen 0,4-mm-Düse.\nBeispiel: Ein 0,4-mm-Schriftstrich wird auf mindestens 0,8 mm verbreitert."} />
                      <span className="toggle-track"><span /></span>
                    </button>
                  )}
                  <div className={multicolorEnabled ? "multicolor-panel active" : "multicolor-panel"}>
                    <button className="multicolor-toggle" onClick={() => setMulticolorEnabled((current) => !current)} aria-pressed={multicolorEnabled}>
                      <Palette />
                      <div><strong>AMS-Farbdruck</strong><span>{multicolorEnabled ? `${colors.length} Farben werden als getrennte 3MF-Objekte exportiert` : "Mehrfarbige 3MF für Bambu Studio aktivieren"}</span></div>
                      <span className="toggle-track"><span /></span>
                    </button>
                    {multicolorEnabled && (
                      <div className="color-setup">
                        <label className="color-setting-label">
                          <span>ANZAHL FARBEN</span>
                          <SettingTooltip text={"Reduziert das Bild auf die gewählte Zahl druckbarer Filamentfarben.\nBeispiel: 4 Farben entsprechen einem vollständig belegten AMS."} />
                          <select value={colorCount} onChange={(event) => {
                            const count = Number(event.target.value);
                            setColorCount(count);
                            setSideColorIndex((current) => Math.min(current, count - 1));
                            setSourceColors((current) => resizePalette(current, count));
                            setColors((current) => resizePalette(current, count));
                          }}>
                            {Array.from({ length: 7 }, (_, index) => index + 2).map((count) => <option key={count} value={count}>{count} Farben</option>)}
                          </select>
                        </label>
                        <div className="color-swatches">
                          {colors.map((color, index) => (
                            // Der Key darf nicht den veränderlichen Farbwert
                            // enthalten. Sonst ersetzt React das native
                            // Farbfeld bei jeder Auswahl und macOS schließt
                            // seine Farbpalette sofort wieder.
                            <label className="color-swatch" key={index}>
                              <input
                                type="color"
                                value={color}
                                onChange={(event) => setColors((current) => current.map((entry, colorIndex) => colorIndex === index ? event.target.value.toUpperCase() : entry))}
                              />
                              <span><strong>AMS {index + 1}</strong><small>{sourceColors[index]} → {color}</small></span>
                            </label>
                          ))}
                        </div>
                        <label className="side-color-select color-setting-label">
                          <span>SEITEN & TRAGKÖRPER</span>
                          <SettingTooltip text={"Bestimmt die einheitliche Farbe aller Seitenflächen und der inneren Tragstruktur.\nBeispiel: Schwarz erzeugt saubere dunkle Seiten unter den farbigen Oberflächen."} />
                          <select value={sideColorIndex} onChange={(event) => setSideColorIndex(Number(event.target.value))}>
                            {colors.map((color, index) => <option value={index} key={index}>AMS {index + 1} · {color}</option>)}
                          </select>
                        </label>
                        <p>Die Oberseiten erhalten die erkannten Farben. Alle Seitenflächen und der Tragkörper werden einheitlich mit der hier gewählten Farbe gedruckt.</p>
                      </div>
                    )}
                  </div>
                  <button className="advanced-toggle has-tooltip" onClick={() => setAdvancedOpen((current) => !current)} aria-expanded={advancedOpen}>
                    <Settings2 /> {advancedOpen ? "Erweiterte Einstellungen schließen" : "Erweiterte Einstellungen"}
                    <SettingTooltip text={"Optionale Feineinstellungen für Sonderfälle. Die Automatik ist normalerweise die beste Wahl.\nBeispiel: Nur öffnen, wenn Helligkeitsrichtung oder Glättung bewusst geändert werden soll."} />
                  </button>
                  {advancedOpen && (
                    <div className="advanced-options">
                      <div className="parameter-grid advanced-parameters">
                        <NumberField label="GLÄTTUNG" tooltip={parameterTooltips.smoothing} value={smoothing} min={0} max={5} step={1} setValue={setSmoothing} />
                        <NumberField label="DETAIL" tooltip={parameterTooltips.detail} value={detail} min={0} max={2} step={0.25} setValue={setDetail} />
                      </div>
                      <div>
                        <span className="option-label">RELIEF-RICHTUNG</span>
                        <div className="segmented-control">
                          <button className={!raiseLightAreas ? "has-tooltip selected" : "has-tooltip"} onClick={() => setRaiseLightAreas(false)} aria-description={parameterTooltips.dark}>Dunkles anheben<SettingTooltip text={parameterTooltips.dark} /></button>
                          <button className={raiseLightAreas ? "has-tooltip selected" : "has-tooltip"} onClick={() => setRaiseLightAreas(true)} aria-description={parameterTooltips.light}>Helles anheben<SettingTooltip text={parameterTooltips.light} /></button>
                        </div>
                      </div>
                      <div className="secondary-modes">
                        <button className={processingMode === "height" ? "mode-option has-tooltip selected" : "mode-option has-tooltip"} onClick={() => { setProcessingMode("height"); setProfile("balanced"); }} aria-description={modeTooltips.height}>
                          <ImagePlus /><div><strong>Höhenkarte</strong><span>Helligkeit direkt übernehmen</span></div><SettingTooltip text={modeTooltips.height} />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              <div className="compact-cost"><strong>0,00 €</strong><span>lokal · keine API-Kosten</span></div>
            </div>
            <div className="action-bar">
              <div><Box size={20} /><div><strong>{file ? file.name : "Noch kein Bild gewählt"}</strong><span>{file ? `${(file.size / 1_048_576).toFixed(1)} MB · ${file.width} × ${file.height} px · bereit` : "Wähle zuerst eine geeignete Aufnahme aus."}</span></div></div>
              <button className="primary-button" disabled={!file || busy} onClick={() => void generateRelief()}>{busy ? "Modell wird erzeugt …" : "Relief erstellen"} <ChevronRight size={18} /></button>
            </div>
              </>
            )}
          </section>
        )}

        {view === "history" && (history.length ? <HistoryView entries={history} clear={() => { setHistory([]); localStorage.removeItem("ai-print-studio-history"); }} /> : <EmptyState icon={Clock3} title="Noch keine Modelle" text="Fertige Modelle erscheinen nach der ersten Umwandlung hier." />)}
        {view === "settings" && <Settings />}
        {view === "info" && <InfoView version={version} />}

        <Footer version={version} openLegal={setLegalPage} />
      </main>
      {textDialogOpen && <TextToStlDialog close={() => { setTextDialogOpen(false); if (!file) setStudioTool("home"); }} create={createTextSource} />}
      {ai3dDialogOpen && <Ai3dDialog
        close={() => { setAi3dDialogOpen(false); if (studioTool === "prompt") setStudioTool("home"); }}
        openSettings={() => { setAi3dDialogOpen(false); setStudioTool("home"); setView("settings"); }}
      />}
    </div>
  );
}

function InfoView({ version }: { version: string }) {
  const technologies = [
    ["Desktop-App", "Electron", "Fenster, sichere IPC-Brücke, Dateien und lokale Prozesse", "MIT"],
    ["Oberfläche", "React · TypeScript · Vite", "Studio, Editor und Zustandsverwaltung", "MIT"],
    ["3D-Vorschau", "Three.js · React Three Fiber · Drei", "Dreh- und zoombare Mesh-Vorschau", "MIT"],
    ["Bildverarbeitung", "Sharp", "Rasterung, Masken, Höhenkarten und Farbanalyse", "Apache-2.0"],
    ["Lokale Foto-Tiefe", "Depth Anything V2 Small · Core ML", "Monokulare Tiefenschätzung auf Apple Silicon", "Apache-2.0"],
    ["Komplexe Form", "Hunyuan3D Shape Small · MLX", "Optionale lokale Rekonstruktion aus einer bestätigten Referenz", "Tencent Hunyuan Community License / MIT"],
    ["Prompt zu 3D", "OpenAI Responses API · GPT Image", "Einfacher CAD-Bauplan oder sichtbares Referenzbild; Mesh entsteht lokal", "optional, nutzungsabhängige API-Kosten"],
    ["3MF-Verpackung", "JSZip", "Mehrfarbige 3MF-Archive und Slicer-Metadaten", "MIT/GPL-3.0+"]
  ];
  return (
    <section className="info-view">
      <div className="info-hero">
        <div className="info-hero-icon"><Info /></div>
        <div><p className="eyebrow">AI PRINT STUDIO · VERSION {version}</p><h2>So wird aus einer Idee ein druckbares Modell</h2><p>Die App kombiniert lokale Bildanalyse, deterministischen Meshaufbau und optionale KI-Planung. Bilder, Geometrie und Exporte bleiben grundsätzlich auf deinem Mac.</p></div>
      </div>

      <div className="info-section">
        <div className="info-heading"><span>01</span><div><h3>Die drei Arbeitswege</h3><p>Welcher Teil lokal läuft und wann ein externer Dienst beteiligt ist.</p></div></div>
        <div className="info-flow-grid">
          <article><ImagePlus /><h4>Bild zu 3D</h4><p>Das Bild wird lokal validiert, gerastert und in Motivmaske, Höhenwerte und optional AMS-Farben zerlegt. Daraus entsteht ein geschlossenes Reliefmesh.</p><strong>Vollständig lokal</strong></article>
          <article><Type /><h4>Schrift zu 3D</h4><p>Die Schrift wird lokal gerendert, konturiert, extrudiert und durch dieselbe Druckbarkeits- und Exportpipeline geführt.</p><strong>Vollständig lokal</strong></article>
          <article><Sparkles /><h4>Prompt zu 3D</h4><p>Nur Beschreibung und bei Änderungen der aktuelle CAD-Bauplan gehen an OpenAI. Die Antwort wird streng validiert; STL und Vorschau erzeugt die App lokal.</p><strong>OpenAI optional</strong></article>
        </div>
      </div>

      <div className="info-section">
        <div className="info-heading"><span>02</span><div><h3>Verarbeitungspipeline</h3><p>Die Ausgabe wird nicht einfach aus einem Bild „kopiert“, sondern schrittweise konstruiert.</p></div></div>
        <ol className="pipeline-list">
          <li><span>1</span><div><strong>Eingabe prüfen</strong><p>Format, Größe, Pixelabmessungen und Transparenz werden validiert.</p></div></li>
          <li><span>2</span><div><strong>Motiv verstehen</strong><p>Konturen, Flächen, Helligkeit, Tiefe oder eine bestätigte KI-Referenz werden passend zum Werkzeug analysiert.</p></div></li>
          <li><span>3</span><div><strong>Geometrie aufbauen</strong><p>Die App erzeugt Höhen, Grundplatte, geglättete Außenkontur und geschlossene Seitenflächen.</p></div></li>
          <li><span>4</span><div><strong>Druckbarkeit prüfen</strong><p>Zusammenhalt, Mindestbreiten, Steigungen, Dreiecksmenge und Materialvolumen fließen in den Druckscore ein.</p></div></li>
          <li><span>5</span><div><strong>Exportieren</strong><p>STL für einfarbige Modelle und 3MF für AMS-Farben.</p></div></li>
        </ol>
      </div>

      <div className="info-section">
        <div className="info-heading"><span>03</span><div><h3>Frameworks, Modelle und Werkzeuge</h3><p>Die wichtigsten technischen Bausteine dieses Builds.</p></div></div>
        <div className="technology-table">
          {technologies.map(([area, name, purpose, license]) => <div key={area}><strong>{area}</strong><span>{name}</span><p>{purpose}</p><small>{license}</small></div>)}
        </div>
      </div>

      <div className="info-section info-split">
        <div>
          <div className="info-heading"><span>04</span><div><h3>Datenschutz</h3><p>Klare Trennung zwischen lokalen und externen Vorgängen.</p></div></div>
          <ul className="info-checklist">
            <li><CheckCircle2 /> Kein Benutzerkonto und keine Werbe- oder Analyse-Tracker</li>
            <li><CheckCircle2 /> Bilder, Meshes, Höhenkarten und Exporte bleiben lokal</li>
            <li><CheckCircle2 /> OpenAI nur nach bewusst gestarteter Prompt-zu-3D-Aktion</li>
            <li><CheckCircle2 /> Optionale 3D-Gewichte erst nach Lizenzanzeige und ausdrücklicher Zustimmung</li>
            <li><CheckCircle2 /> API-Key lokal mit App-Passwort, scrypt und AES-256-GCM geschützt</li>
          </ul>
        </div>
        <div>
          <div className="info-heading"><span>05</span><div><h3>Grenzen</h3><p>Was die Ergebnisse beeinflusst.</p></div></div>
          <ul className="info-checklist neutral">
            <li><Info /> Ein einzelnes Bild liefert keine echte Rückseiteninformation</li>
            <li><Info /> Reliefs sind kontrollierte 2,5D-Modelle, keine vollständigen Scans</li>
            <li><Info /> Komplexe Prompt-Modelle sind KI-Näherungen, keine maßhaltigen Hersteller-CAD-Dateien</li>
            <li><Info /> Vor dem Druck sollte jedes Modell im Slicer kontrolliert werden</li>
          </ul>
        </div>
      </div>

      <div className="info-legal-note">
        <ShieldCheck /><div><strong>Lizenzen und rechtliche Hinweise</strong><p>Open-Source-Komponenten und optionale Modellgewichte behalten ihre jeweiligen Lizenzen. Hunyuan3D wird nur nach Anzeige der Tencent-Hunyuan-Lizenz geladen. Produktnamen dienen nur der Beschreibung; eine Partnerschaft oder Autorisierung wird nicht behauptet. Nutzer müssen Rechte an Referenzen, Designs und Marken selbst prüfen. Details stehen in THIRD_PARTY_NOTICES.md.</p></div>
      </div>
    </section>
  );
}

function StudioHub({
  openImage,
  openText,
  openPrompt,
  openProject
}: {
  openImage: () => void;
  openText: () => void;
  openPrompt: () => void;
  openProject: () => void;
}) {
  const tools = [
    {
      id: "image",
      icon: ImagePlus,
      eyebrow: "LOKAL · RELIEF & 3MF",
      title: "Bild zu 3D",
      description: "Fotos, Logos, Wappen und SVGs in druckbare Reliefs verwandeln.",
      detail: "Konturen, Tiefenschätzung, AMS-Farben",
      action: openImage
    },
    {
      id: "text",
      icon: Type,
      eyebrow: "LOKAL · TYPOGRAFIE",
      title: "Schrift zu 3D",
      description: "Schriftzüge, Namensschilder und mehrzeilige Texte als STL gestalten.",
      detail: "Schriftart, Höhe, Ausrichtung, Farbe",
      action: openText
    },
    {
      id: "prompt",
      icon: Sparkles,
      eyebrow: "KI · VOLLSTÄNDIGES OBJEKT",
      title: "Prompt zu 3D",
      description: "Eine Idee beschreiben und als vollständiges räumliches Modell erzeugen.",
      detail: "OpenAI-Bauplan + lokale STL",
      action: openPrompt
    }
  ];
  return (
    <section className="studio-hub">
      <div className="studio-hub-heading">
        <p className="eyebrow">DEINE 3D-WERKZEUGE</p>
        <h2>Was möchtest du erstellen?</h2>
        <p>Wähle den passenden Einstieg – jedes Werkzeug zeigt nur die Einstellungen, die du dafür brauchst.</p>
      </div>
      <div className="studio-tool-grid">
        {tools.map(({ id, icon: Icon, eyebrow, title, description, detail, action }) => (
          <button className={`studio-tool-card ${id}`} onClick={action} key={id}>
            <span className="tool-card-glow" />
            <div className="tool-card-icon"><Icon /></div>
            <span className="tool-card-eyebrow">{eyebrow}</span>
            <h3>{title}</h3>
            <p>{description}</p>
            <small>{detail}</small>
            <strong>Öffnen <ChevronRight /></strong>
          </button>
        ))}
      </div>
      <div className="studio-hub-footer">
        <span><ShieldCheck /> Lokale Werkzeuge bleiben auf deinem Mac</span>
        <span><Palette /> AMS-fähiger 3MF-Export</span>
        <span><CheckCircle2 /> Druckbarkeit wird automatisch geprüft</span>
        <button onClick={openProject}><FolderOpen /> Projekt öffnen</button>
      </div>
    </section>
  );
}

function ReliefPreview({ result }: { result: NonNullable<ReliefResult> }) {
  const modelSize = Math.max(result.widthMm, result.heightMm);
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

  return (
    <div className="preview-card">
      <div className="panel-label">3D-VORSCHAU · ZIEHEN ZUM DREHEN</div>
      <Canvas camera={{ position: [modelSize * 0.9, modelSize * 0.85, modelSize * 1.35], fov: 42 }} dpr={[1, 2]}>
        <color attach="background" args={["#0b0e13"]} />
        <ambientLight intensity={1.5} />
        <directionalLight position={[60, 100, 80]} intensity={3.2} />
        <directionalLight position={[-50, 35, -60]} intensity={1.1} color="#b6d7ff" />
        {geometries.map(({ geometry, color }, index) => (
          <mesh geometry={geometry} key={`${color}-${index}`}>
            <meshStandardMaterial color={color} roughness={0.62} metalness={0.05} side={THREE.DoubleSide} />
          </mesh>
        ))}
        <gridHelper args={[modelSize * 1.6, 18, "#2e3944", "#1b222b"]} />
        <OrbitControls makeDefault target={[0, result.options.baseMm + result.options.reliefMm / 2, 0]} minDistance={modelSize * 0.65} maxDistance={modelSize * 3} enableDamping />
      </Canvas>
    </div>
  );
}

function ReliefResultCard({ result, optimize }: { result: NonNullable<ReliefResult>; optimize: () => void }) {
  return (
    <div className={`result-card preview-result ${result.printability.status}`}>
      <div className="result-check"><CheckCircle2 /></div>
      <div>
        <strong>Modell erfolgreich erstellt · Druckscore {result.printability.score}/100</strong>
        <p>{result.triangleCount.toLocaleString("de-DE")} Dreiecke · {result.widthMm.toFixed(0)} × {result.heightMm.toFixed(0)} mm · ca. {result.printability.estimatedVolumeCm3.toFixed(1)} cm³{result.options.colors.length ? ` · ${result.options.colors.length} AMS-Farben` : ""}</p>
        <p>{result.printability.issues.join(" ")}</p>
        <div className="print-checks">{result.printability.checks.map((check) => <span className={check.status} key={check.label} title={check.detail}>{check.status === "ok" ? "✓" : "!"} {check.label}</span>)}</div>
      </div>
      <img className="heightmap-preview" src={result.heightmapDataUrl} alt="Berechnete Höhenkarte" title="Berechnete Höhenkarte" />
      {result.printability.score < 100 && <button className="optimize-button" onClick={optimize}><Wrench /> Automatisch optimieren</button>}
      <button className="secondary-button" onClick={() => void window.desktop?.showItemInFolder(result.stlPath)}>Im Finder zeigen</button>
    </div>
  );
}

function SlicerAnalysisCard({ result }: { result: NonNullable<ReliefResult> }) {
  const [layer, setLayer] = useState(result.slicer.layerCount);
  const height = layer * result.slicer.layerHeightMm;
  const visibleRatio = Math.min(1, height / Math.max(0.1, result.options.baseMm + result.options.reliefMm));
  return (
    <section className="slicer-card">
      <div className="slicer-summary">
        <div><strong>Lokale Schichtsimulation</strong><span>0,4-mm-Düse · {result.slicer.layerHeightMm.toFixed(1).replace(".", ",")} mm Schichthöhe</span></div>
        <dl>
          <div><dt>Druckzeit</dt><dd>ca. {Math.floor(result.slicer.estimatedMinutes / 60)} h {result.slicer.estimatedMinutes % 60} min</dd></div>
          <div><dt>Material</dt><dd>{result.slicer.materialGrams.toFixed(1)} g · {result.slicer.filamentMeters.toFixed(1)} m</dd></div>
          <div><dt>Schichten</dt><dd>{result.slicer.layerCount}</dd></div>
          <div><dt>Farbwechsel</dt><dd>{result.slicer.colorChanges}</dd></div>
        </dl>
      </div>
      <div className="layer-inspector">
        <div className="layer-image"><img src={result.heightmapDataUrl} alt="Schichtvorschau" style={{ opacity: 0.3 + visibleRatio * 0.7, filter: `contrast(${1 + visibleRatio}) brightness(${0.55 + visibleRatio * 0.7})` }} /><span>{height.toFixed(1)} mm</span></div>
        <label><span>Schicht {layer} / {result.slicer.layerCount}</span><input type="range" min={1} max={result.slicer.layerCount} value={layer} onChange={(event) => setLayer(Number(event.target.value))} /></label>
      </div>
      <small>Geometriebasierte lokale Schätzung – die endgültige Druckzeit hängt vom Druckerprofil im Slicer ab.</small>
    </section>
  );
}

async function detectPalette(dataUrl: string, colorCount: number): Promise<string[]> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Farben konnten nicht aus dem Bild gelesen werden."));
    image.src = dataUrl;
  });
  const scale = Math.min(1, 320 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return [];
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return extractColorPalette(context.getImageData(0, 0, canvas.width, canvas.height).data, colorCount);
}

function resizePalette(colors: string[], count: number): string[] {
  const defaults = ["#111827", "#F5F5F4", "#22C55E", "#F59E0B", "#3B82F6", "#EF4444", "#A855F7", "#FDE047"];
  return Array.from({ length: count }, (_, index) => colors[index] ?? defaults[index % defaults.length]);
}

function darkestColorIndex(colors: string[]): number {
  let darkest = 0, darkestLuminance = Number.POSITIVE_INFINITY;
  colors.forEach((color, index) => {
    const red = Number.parseInt(color.slice(1, 3), 16);
    const green = Number.parseInt(color.slice(3, 5), 16);
    const blue = Number.parseInt(color.slice(5, 7), 16);
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    if (luminance < darkestLuminance) { darkest = index; darkestLuminance = luminance; }
  });
  return darkest;
}

function NumberField({ label, tooltip, value, unit, min, max, step, setValue }: {
  label: string; tooltip: string; value: number; unit?: string; min: number; max: number; step: number; setValue: (value: number) => void;
}) {
  return (
    <label className="number-field has-tooltip">
      <span>{label}</span>
      <div><input type="number" aria-description={tooltip} value={value} min={min} max={max} step={step} onChange={(event) => setValue(Math.max(min, Math.min(max, Number(event.target.value))))} />{unit && <small>{unit}</small>}</div>
      <SettingTooltip text={tooltip} />
    </label>
  );
}

function TextToStlDialog({
  close,
  create
}: {
  close: () => void;
  create: (options: Parameters<NonNullable<typeof window.desktop>["createTextImage"]>[0]) => Promise<void>;
}) {
  const [text, setText] = useState("Mein Text");
  const [fontFamily, setFontFamily] = useState("Helvetica");
  const [bold, setBold] = useState(true);
  const [italic, setItalic] = useState(false);
  const [alignment, setAlignment] = useState<"left" | "center" | "right">("center");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    setBusy(true); setError(null);
    try { await create({ text, fontFamily, bold, italic, alignment }); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Der Text konnte nicht vorbereitet werden."); }
    finally { setBusy(false); }
  }
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className="modal text-to-stl-modal" role="dialog" aria-modal="true" aria-labelledby="text-to-stl-title">
        <button className="modal-close" onClick={close} aria-label="Dialog schließen"><X /></button>
        <div className="modal-icon"><Type /></div>
        <p className="eyebrow">LOKALE TEXTERSTELLUNG</p>
        <h2 id="text-to-stl-title">Schrift zu STL</h2>
        <p>Erzeuge freistehende Buchstaben oder ein Schrift-Relief. Danach kannst du Größe, Höhe und AMS-Farben wie bei einem Bild festlegen.</p>
        <label htmlFor="text-content">Text · maximal 6 Zeilen</label>
        <textarea id="text-content" maxLength={240} rows={4} value={text} onChange={(event) => setText(event.target.value)} />
        <div className="text-options">
          <label><span>SCHRIFTART</span><select value={fontFamily} onChange={(event) => setFontFamily(event.target.value)}>{["Helvetica", "Avenir Next", "Arial", "Times New Roman", "Courier New"].map((font) => <option key={font}>{font}</option>)}</select></label>
          <label><span>AUSRICHTUNG</span><select value={alignment} onChange={(event) => setAlignment(event.target.value as typeof alignment)}><option value="left">Links</option><option value="center">Zentriert</option><option value="right">Rechts</option></select></label>
        </div>
        <div className="text-style-options">
          <button className={bold ? "selected" : ""} onClick={() => setBold((current) => !current)}>Fett</button>
          <button className={italic ? "selected" : ""} onClick={() => setItalic((current) => !current)}>Kursiv</button>
        </div>
        {error && <div className="notice error">{error}</div>}
        <div className="modal-actions">
          <button className="secondary-button" onClick={close}>Abbrechen</button>
          <button className="primary-button" disabled={busy || !text.trim()} onClick={() => void submit()}>{busy ? "Text wird vorbereitet …" : "Text übernehmen"} <ChevronRight /></button>
        </div>
      </section>
    </div>
  );
}

type Complex3dStatus = {
  name: string; sizeBytes: number; sourceUrl: string; licenseUrl: string; codeUrl: string;
  installed: boolean; workerAvailable: boolean; accepted: boolean; acceptedAt: string | null;
  installedBytes: number; version: string; weightsSha256: string; notice: string;
};
type ComplexReference = {
  path: string;
  dataUrl: string;
  disclaimer: string;
  billing: {
    model: string; textTokens: number; imageTokens: number; outputTokens: number;
    costUsd: number; estimatedCostEur: number; exactUsageAvailable: boolean;
  };
};

function Ai3dDialog({ close, openSettings }: { close: () => void; openSettings: () => void }) {
  const [prompt, setPrompt] = useState("Ein kleines Haus mit vier Fenstern, einem Stockwerk und einem Spitzdach");
  const [followUp, setFollowUp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagnostic, setDiagnostic] = useState<Ai3dDiagnostic>(null);
  const [result, setResult] = useState<Ai3dResult | null>(null);
  const [previousResults, setPreviousResults] = useState<Ai3dResult[]>([]);
  const [apiStatus, setApiStatus] = useState<SettingsStatus | null>(null);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [models, setModels] = useState<Ai3dModel[]>([]);
  const [complexMode, setComplexMode] = useState(true);
  const [complexStatus, setComplexStatus] = useState<Complex3dStatus | null>(null);
  const [complexReference, setComplexReference] = useState<ComplexReference | null>(null);
  const [previousReferences, setPreviousReferences] = useState<ComplexReference[]>([]);
  const [referenceInstruction, setReferenceInstruction] = useState("");
  const [referenceCostsEur, setReferenceCostsEur] = useState(0);
  const [complexStage, setComplexStage] = useState<"idle" | "reference" | "mesh">("idle");
  const [complexResult, setComplexResult] = useState<{ stlPath: string; triangleCount: number; preview: { positions: number[]; indices: number[] } } | null>(null);
  const [complexProgress, setComplexProgress] = useState({ phase: "", progress: 0, loadedBytes: 0, totalBytes: 0 });
  const complexJob = useRef<string | null>(null);
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
    void window.desktop?.getComplex3dStatus().then(setComplexStatus);
  }, [refreshApiStatus]);
  useEffect(() => window.desktop?.onAi3dProgress((nextProgress) => setProgress(nextProgress)), []);
  useEffect(() => window.desktop?.onComplex3dProgress((jobId, nextProgress) => {
    if (complexJob.current === jobId) setComplexProgress(nextProgress);
  }), []);
  useEffect(() => localStorage.setItem("ai-print-studio.ai3d-model", selectedModel), [selectedModel]);

  async function unlockApiKey() {
    setUnlockBusy(true); setError(null);
    try {
      if (!window.desktop) throw new Error("Die Desktop-Verbindung ist nicht verfügbar.");
      await window.desktop.unlockOpenAiKey(unlockPassword);
      await refreshApiStatus();
      setUnlockPassword("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Der API-Schlüssel konnte nicht entsperrt werden.");
    } finally { setUnlockBusy(false); }
  }
  async function createComplexReference(editExisting = false) {
    if (!window.desktop) return;
    setBusy(true); setComplexStage("reference"); setError(null); setComplexResult(null);
    try {
      const next = await window.desktop.createComplex3dReference(
        prompt,
        editExisting ? complexReference?.path : undefined,
        editExisting ? referenceInstruction : undefined
      );
      if (complexReference) setPreviousReferences((current) => [...current, complexReference]);
      setComplexReference(next);
      setReferenceCostsEur((current) => current + next.billing.estimatedCostEur);
      setReferenceInstruction("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Die Referenz konnte nicht erzeugt werden.");
    } finally { setBusy(false); setComplexStage("idle"); }
  }
  function undoReference() {
    setPreviousReferences((current) => {
      const previous = current.at(-1);
      if (previous) setComplexReference(previous);
      return current.slice(0, -1);
    });
    setComplexResult(null);
  }
  async function createComplexModel() {
    if (!window.desktop || !complexReference) return;
    setBusy(true); setComplexStage("mesh"); setError(null);
    const jobId = crypto.randomUUID();
    complexJob.current = jobId;
    try {
      setComplexResult(await window.desktop.createComplex3dMesh(jobId, complexReference.path));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Die lokale 3D-Rekonstruktion ist fehlgeschlagen.");
    } finally { complexJob.current = null; setBusy(false); setComplexStage("idle"); }
  }
  async function cancelComplex() {
    if (complexJob.current) await window.desktop?.cancelComplex3d(complexJob.current);
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
        <h2 id="ai3d-title">{result ? "3D-Modell prüfen und weiterentwickeln" : "Prompt zu druckbarer STL"}</h2>
        {apiStatus?.openAiStored && !apiStatus.openAiConfigured && (
          <div className="ai-unlock-panel">
            <ShieldCheck />
            <div>
              <strong>API-Schlüssel für diese Sitzung entsperren</strong>
              <p>Der Schlüssel ist verschlüsselt gespeichert. Dein App-Passwort entschlüsselt ausschließlich diesen OpenAI-Schlüssel im Arbeitsspeicher; es wird nicht gespeichert.</p>
              <label htmlFor="ai3d-vault-password">AI-Print-Studio-Passwort</label>
              <div className="ai-unlock-actions">
                <input
                  id="ai3d-vault-password"
                  type="password"
                  value={unlockPassword}
                  onChange={(event) => setUnlockPassword(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && unlockPassword.length >= 10 && void unlockApiKey()}
                  placeholder="Mindestens 10 Zeichen"
                  autoComplete="off"
                  disabled={unlockBusy}
                />
                <button className="primary-button" onClick={() => void unlockApiKey()} disabled={unlockBusy || unlockPassword.length < 10}>
                  {unlockBusy ? "Entsperrt …" : "Entsperren"}
                </button>
              </div>
            </div>
          </div>
        )}
        {apiStatus && !apiStatus.openAiStored && (
          <div className="notice error">Es ist noch kein OpenAI API-Schlüssel gespeichert. Hinterlege ihn einmal unter Einstellungen → OpenAI.</div>
        )}
        {apiStatus?.openAiConfigured && !result && <div className="notice"><CheckCircle2 /> Der gespeicherte OpenAI API-Schlüssel ist für diese Sitzung entsperrt.</div>}
        {!result && <>
          <div className="ai-workflow-choice">
            <button className={complexMode ? "selected" : ""} onClick={() => setComplexMode(true)}><Sparkles /><span><strong>Komplexe Außenform</strong><small>KI-Referenz + lokales 3D-Modell</small></span></button>
            <button className={!complexMode ? "selected" : ""} onClick={() => setComplexMode(false)}><Box /><span><strong>Einfaches CAD</strong><small>Grundkörper, schnell und exakt</small></span></button>
          </div>
          <p>{complexMode ? "OpenAI erzeugt zunächst eine sichtbare Referenz. Erst nach deiner Prüfung rekonstruiert das optionale lokale Modell daraus ein Mesh." : "OpenAI erstellt einen validierten CAD-Bauplan aus einfachen Grundkörpern; die App erzeugt das STL lokal."}</p>
          {complexMode && complexStatus && !complexStatus.installed && <div className="complex-model-compact">
            <div><strong>Lokales 3D-Modell noch nicht installiert</strong><span>Download und Lizenzverwaltung findest du übersichtlich in den Einstellungen.</span></div>
            <button className="secondary-button" onClick={openSettings}><Settings2 /> Zu den Einstellungen</button>
          </div>}
          {complexMode && complexStatus?.installed && <div className="complex-model-ready"><CheckCircle2 /><span>Lokales 3D-Modell bereit</span></div>}
          {!complexMode && <div className="ai-model-picker">
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
          </div>}
          <label htmlFor="ai3d-prompt">OBJEKT BESCHREIBEN</label>
          <textarea id="ai3d-prompt" rows={5} maxLength={800} value={prompt} onChange={(event) => setPrompt(event.target.value)} disabled={busy} />
          {complexMode && complexReference && <div className="complex-reference-workspace">
            <div className="complex-reference">
              <img src={complexReference.dataUrl} alt="Von OpenAI erzeugte 3D-Referenz" />
              <div>
                <strong>Referenz prüfen und bei Bedarf verbessern</strong>
                <p>{complexReference.disclaimer} Form, Proportionen, Markenmerkmale und Details können abweichen. Verwende das Ergebnis nur, wenn du die nötigen Bild-, Design- und Markenrechte besitzt.</p>
                <div className="reference-cost-summary">
                  <span>Diese Referenz: <b>{formatApiCost(complexReference.billing.estimatedCostEur)}{complexReference.billing.exactUsageAvailable ? "" : " geschätzt"}</b></span>
                  <span>Referenzrunde gesamt: <b>{formatApiCost(referenceCostsEur)}</b></span>
                </div>
                <small className="reference-usage">
                  {complexReference.billing.exactUsageAvailable
                    ? `${(complexReference.billing.textTokens + complexReference.billing.imageTokens).toLocaleString("de-DE")} Eingabe-Token · ${complexReference.billing.outputTokens.toLocaleString("de-DE")} Ausgabe-Token · aus OpenAI-Nutzung berechnet`
                    : "OpenAI hat für diese Antwort keine Token-Nutzung geliefert; angezeigt wird deshalb die Vorabschätzung."}
                </small>
              </div>
            </div>
            {!complexResult && <div className="reference-editor">
              <label htmlFor="reference-instruction">REFERENZ GEZIELT ÄNDERN</label>
              <textarea id="reference-instruction" rows={3} maxLength={600} value={referenceInstruction} onChange={(event) => setReferenceInstruction(event.target.value)} placeholder="Zum Beispiel: Verwende die Kombi-Karosserie, mache die Räder größer und behalte den Blickwinkel bei." disabled={busy} />
              <div className="reference-actions">
                <button className="primary-button" disabled={busy || referenceInstruction.trim().length < 3} onClick={() => void createComplexReference(true)}>Änderung anwenden</button>
                <button className="secondary-button" disabled={busy} onClick={() => void createComplexReference(false)}>Komplett neu erzeugen</button>
                {previousReferences.length > 0 && <button className="secondary-button" disabled={busy} onClick={undoReference}>Letzte Referenz zurück</button>}
              </div>
              <small>Jede Änderung oder Neuerzeugung ist eine neue kostenpflichtige OpenAI-Bildanfrage. Vor dem Start voraussichtlich ca. 0,12–0,18 €.</small>
            </div>}
          </div>}
          {complexMode && complexResult && <div className="ai3d-workspace">
            <ComplexMeshPreview mesh={complexResult.preview} />
            <div className="ai3d-result-summary"><div><strong>Komplexes Mesh lokal erstellt</strong><small>{complexResult.triangleCount.toLocaleString("de-DE")} Dreiecke · KI-Näherung</small></div><button className="secondary-button" onClick={() => void window.desktop?.showItemInFolder(complexResult.stlPath)}>STL im Finder</button></div>
          </div>}
        </>}
        {result && <div className="ai3d-workspace">
          <CadPlanPreview plan={result.plan} />
          <div className="ai3d-result-summary">
            <div><strong>{result.plan.title}</strong><small>{result.plan.primitives.length} Bauteile · {result.plan.widthMm} × {result.plan.depthMm} × {result.plan.heightMm} mm</small></div>
            <div className="ai3d-result-actions">
              {previousResults.length > 0 && <button className="secondary-button" onClick={undoRevision} disabled={busy}>Letzte Änderung zurück</button>}
              <button className="secondary-button" onClick={() => void window.desktop?.showItemInFolder(result.stlPath)}>STL im Finder</button>
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
        <div className="notice">{complexMode ? "An OpenAI wird nur deine Beschreibung übertragen. OpenAI erzeugt daraus ein Referenzbild. Dieses Bild wird erst nach deiner Bestätigung lokal in 3D rekonstruiert." : result ? "Für Änderungen werden deine Folgeanweisung und der aktuelle CAD-Bauplan an OpenAI übertragen. Vorschau, Geometrie und STL werden lokal erzeugt." : "Nur deine Beschreibung wird an OpenAI übertragen. Geometrie und STL werden anschließend lokal auf deinem Mac erzeugt."}</div>
        <div className="api-cost-notice">
          <strong>OpenAI-API-Kosten</strong>
          <span>{complexMode ? "Eine hochwertige GPT-Image-2-Referenz kostet vorab geschätzt etwa 0,12–0,18 €. Jede Änderung ist eine neue kostenpflichtige Bildanfrage. Nach der Antwort zeigt die App die von OpenAI gemeldete Nutzung und die daraus berechneten Kosten." : "OpenAI rechnet jede Erstellung und Folgeänderung direkt über deinen eigenen API-Account ab. Während der Erstellung zeigt AI Print Studio eine laufende Schätzung in Euro; der Tokenverbrauch wird nach Abschluss korrigiert. AI Print Studio erhebt keine zusätzlichen Gebühren."}</span>
        </div>
        {busy && !complexMode && <div className="ai-live-progress" aria-live="polite">
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
        {busy && complexMode && complexStage === "reference" && <div className="ai-live-progress" aria-live="polite"><div className="ai-progress-heading"><div><strong>OpenAI erzeugt die Referenz …</strong><small>GPT Image 2 · hohe Qualität</small></div><span>ca. 0,12–0,18 €</span></div><div className="indeterminate-progress"><span /></div><p>OpenAI liefert bei der Bilderzeugung keinen verlässlichen Prozentfortschritt. Die tatsächliche gemeldete Nutzung wird direkt nach Abschluss angezeigt.</p></div>}
        {busy && complexMode && complexStage === "mesh" && complexProgress.phase && <div className="ai-live-progress"><strong>{complexProgress.phase}</strong><div className="ai-progress-track"><span style={{ width: `${Math.max(2, complexProgress.progress)}%` }} /></div><span>{Math.round(complexProgress.progress)} %</span><button className="secondary-button" onClick={() => void cancelComplex()}>Abbrechen</button></div>}
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
          {!result && complexMode && !complexReference && <button className="primary-button" disabled={busy || apiStatus?.openAiConfigured !== true || prompt.trim().length < 10} onClick={() => void createComplexReference(false)}>{busy ? "Referenz wird erstellt …" : "KI-Referenz erstellen · ca. 0,12–0,18 €"} <ChevronRight /></button>}
          {!result && complexMode && complexReference && !complexResult && <button className="primary-button" disabled={busy || complexStatus?.installed !== true} onClick={() => void createComplexModel()}>{busy ? "Lokal wird rekonstruiert …" : "Referenz lokal in 3D umwandeln"} <ChevronRight /></button>}
          {!result && !complexMode && <button className="primary-button" disabled={busy || apiStatus?.openAiConfigured !== true || prompt.trim().length < 10} onClick={() => void submit(prompt)}>{busy ? "OpenAI konstruiert …" : "3D-Modell erstellen"} <ChevronRight /></button>}
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

function ComplexMeshPreview({ mesh }: { mesh: { positions: number[]; indices: number[] } }) {
  const geometry = useMemo(() => {
    const next = new THREE.BufferGeometry();
    next.setAttribute("position", new THREE.Float32BufferAttribute(mesh.positions, 3));
    next.setIndex(mesh.indices);
    next.computeVertexNormals();
    next.computeBoundingSphere();
    return next;
  }, [mesh]);
  const radius = geometry.boundingSphere?.radius ?? 100;
  return <div className="cad-preview">
    <div className="panel-label">LOKALE 3D-VORSCHAU · ZIEHEN ZUM DREHEN</div>
    <Canvas camera={{ position: [radius * 1.5, radius, radius * 1.7], fov: 42 }}>
      <color attach="background" args={["#090d13"]} />
      <ambientLight intensity={1.2} />
      <directionalLight position={[radius, radius * 1.5, radius]} intensity={2.2} />
      <mesh geometry={geometry}><meshStandardMaterial color="#d9e5cf" roughness={0.7} /></mesh>
      <gridHelper args={[radius * 3, 24, "#344151", "#202936"]} />
      <OrbitControls makeDefault enableDamping />
    </Canvas>
  </div>;
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
  return <mesh position={[x + width / 2, z + height / 2, y + depth / 2]} castShadow receiveShadow>
    <boxGeometry args={[width, height, depth]} />
    <meshStandardMaterial color={color} roughness={0.72} metalness={0.01} />
  </mesh>;
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

function HistoryView({ entries, clear }: { entries: HistoryEntry[]; clear: () => void }) {
  return (
    <section className="history-view">
      <div className="section-heading"><div><p className="eyebrow">LOKAL GESPEICHERT</p><h2>Deine letzten Modelle</h2></div><button className="secondary-button" onClick={clear}>Verlauf leeren</button></div>
      <div className="history-list">
        {entries.map((entry) => (
          <article key={entry.id}>
            <div className="history-icon"><Layers3 /></div>
            <div><strong>{entry.name}</strong><span>{new Date(entry.createdAt).toLocaleString("de-DE")} · {entry.profile} · {entry.triangleCount.toLocaleString("de-DE")} Dreiecke</span></div>
            <span className={`score score-${entry.score >= 80 ? "good" : "warn"}`}>{entry.score}/100</span>
            <button className="secondary-button" onClick={() => void window.desktop?.showItemInFolder(entry.stlPath)}>Im Finder</button>
          </article>
        ))}
      </div>
    </section>
  );
}

function EmptyState({ icon: Icon, title, text }: { icon: typeof Clock3; title: string; text: string }) {
  return <section className="empty-state"><div><Icon size={30} /></div><h2>{title}</h2><p>{text}</p></section>;
}

type SettingsStatus = {
  openAiConfigured: boolean;
  openAiStored: boolean;
  modelSetupAccepted: boolean;
  storageVersion: number;
  depthModelAvailable: boolean;
};

function Settings() {
  const [dialog, setDialog] = useState<"openai" | "model" | null>(null);
  const [status, setStatus] = useState<SettingsStatus>({
    openAiConfigured: false,
    openAiStored: false,
    modelSetupAccepted: false,
    storageVersion: 0
    ,depthModelAvailable: false
  });
  const [complexStatus, setComplexStatus] = useState<Complex3dStatus | null>(null);
  const [complexConsent, setComplexConsent] = useState(false);
  const [complexBusy, setComplexBusy] = useState(false);
  const [complexError, setComplexError] = useState<string | null>(null);
  const [complexProgress, setComplexProgress] = useState({ phase: "", progress: 0, loadedBytes: 0, totalBytes: 0 });
  const complexJob = useRef<string | null>(null);

  async function refreshStatus() {
    if (!window.desktop) return;
    const next = await window.desktop.getSettingsStatus();
    setStatus(next);
    setComplexStatus(await window.desktop.getComplex3dStatus());
  }

  useEffect(() => { void refreshStatus(); }, []);
  useEffect(() => window.desktop?.onComplex3dProgress((jobId, progress) => {
    if (complexJob.current === jobId) setComplexProgress(progress);
  }), []);

  async function installComplexModel() {
    if (!window.desktop || !complexConsent) return;
    setComplexBusy(true); setComplexError(null);
    const jobId = crypto.randomUUID();
    complexJob.current = jobId;
    try {
      await window.desktop.acceptComplex3dLicense(true);
      await window.desktop.downloadComplex3dModel(jobId);
      setComplexStatus(await window.desktop.getComplex3dStatus());
      setComplexConsent(false);
    } catch (error) {
      setComplexError(error instanceof Error ? error.message : "Das lokale 3D-Modell konnte nicht installiert werden.");
    } finally {
      complexJob.current = null;
      setComplexBusy(false);
    }
  }

  async function removeComplexModelFromDisk() {
    if (!window.desktop || !window.confirm("Lokales 3D-Modell entfernen?\n\nDie etwa 3,82 GB großen Modellgewichte werden gelöscht. Prompt zu 3D kann weiterhin das einfache CAD verwenden.")) return;
    setComplexBusy(true); setComplexError(null);
    try {
      await window.desktop.removeComplex3dModel();
      setComplexStatus(await window.desktop.getComplex3dStatus());
    } catch (error) {
      setComplexError(error instanceof Error ? error.message : "Das lokale Modell konnte nicht entfernt werden.");
    } finally { setComplexBusy(false); }
  }

  async function cancelComplexDownload() {
    if (complexJob.current) await window.desktop?.cancelComplex3d(complexJob.current);
  }

  return (
    <>
      <section className="settings-grid">
        <article><div className="setting-icon"><Sparkles /></div><div><h3>OpenAI · Prompt zu 3D</h3><p>{status.openAiConfigured ? "Der lokal verschlüsselte API-Schlüssel ist für diese Sitzung entsperrt." : status.openAiStored ? "Der API-Schlüssel ist lokal verschlüsselt und aktuell gesperrt." : "Speichert den API-Schlüssel lokal verschlüsselt – ohne macOS-Schlüsselbund."}</p></div><div className="setting-action">{status.openAiConfigured ? <span className="tag"><CheckCircle2 /> Entsperrt</span> : status.openAiStored ? <span className="tag neutral">Gesperrt</span> : <span className="tag neutral">Nicht eingerichtet</span>}<button onClick={() => setDialog("openai")}>{status.openAiStored ? "Verwalten" : "Einrichten"}</button></div></article>
        <article><div className="setting-icon"><Layers3 /></div><div><h3>Lokale Relief-Engine</h3><p>Integriert · erzeugt wasserdichte STL- und 3MF-Dateien vollständig offline.</p></div><button onClick={() => setDialog("model")}>Details</button></article>
        <article><div className="setting-icon"><Box /></div><div><h3>Tiefenerkennung für Fotos</h3><p>Erzeugt räumliche Tiefe direkt auf deinem Mac · keine Cloud.</p></div><span className={status.depthModelAvailable ? "tag" : "tag neutral"}>{status.depthModelAvailable ? "Bereit" : "Aktuelles Update nötig"}</span></article>
        <article className="complex-settings-card">
          <div className="setting-icon"><Sparkles /></div>
          <div className="complex-settings-content">
            <div className="complex-settings-heading">
              <div><h3>Komplexe Außenformen · lokales 3D-Modell</h3><p>{complexStatus?.installed ? `${complexStatus.name} ist lokal installiert und einsatzbereit.` : "Optional für komplexe Prompt-Modelle. Einfaches Prompt-CAD funktioniert weiterhin ohne diesen Download."}</p></div>
              <span className={complexStatus?.installed ? "tag" : "tag neutral"}>{complexStatus?.installed ? "Installiert" : "Optional"}</span>
            </div>
            {!complexStatus?.installed && complexStatus && <>
              <div className="model-facts">
                <span><b>Download</b> ca. {(complexStatus.sizeBytes / 1_000_000_000).toFixed(2)} GB</span>
                <span><b>Freier Speicher</b> mindestens 5,5 GB</span>
                <span><b>Quelle</b> Hugging Face / Hunyuan3D</span>
                <span><b>Lizenz</b> Tencent Hunyuan Community License</span>
              </div>
              <p className="model-legal-copy">Das optionale Modell läuft nach dem Download lokal. Ergebnisse sind KI-Näherungen; prüfe vor einer Veröffentlichung die Rechte an verwendeten Referenzen, Designs und Marken.</p>
              <div className="complex-license-links">
                <button onClick={() => void window.desktop?.openExternal(complexStatus.sourceUrl)}>Modellquelle</button>
                <button onClick={() => void window.desktop?.openExternal(complexStatus.licenseUrl)}>Lizenz vollständig lesen</button>
              </div>
              <label className="license-confirm"><input type="checkbox" checked={complexConsent} onChange={(event) => setComplexConsent(event.target.checked)} disabled={complexBusy} /><span>Ich habe Quelle und Lizenzbedingungen gelesen und stimme dem Download der optionalen Modellgewichte ausdrücklich zu.</span></label>
              <div className="complex-settings-actions">
                <button className="primary-button" disabled={!complexConsent || complexBusy || !complexStatus.workerAvailable} onClick={() => void installComplexModel()}>{complexBusy ? "Modell wird geladen …" : "Lokales 3D-Modell herunterladen"}</button>
                {complexBusy && <button className="secondary-button" onClick={() => void cancelComplexDownload()}>Download abbrechen</button>}
              </div>
            </>}
            {complexStatus?.installed && <div className="complex-settings-actions"><button className="secondary-button danger-button" disabled={complexBusy} onClick={() => void removeComplexModelFromDisk()}>Lokales Modell entfernen</button></div>}
            {complexBusy && complexProgress.phase && <div className="settings-download-progress"><div><strong>{complexProgress.phase}</strong><span>{Math.round(complexProgress.progress)} %</span></div><div className="ai-progress-track"><span style={{ width: `${Math.max(2, complexProgress.progress)}%` }} /></div>{complexProgress.totalBytes > 0 && <small>{(complexProgress.loadedBytes / 1_000_000_000).toFixed(2)} von {(complexProgress.totalBytes / 1_000_000_000).toFixed(2)} GB</small>}</div>}
            {complexError && <div className="notice error">{complexError}</div>}
            {complexStatus && !complexStatus.workerAvailable && <div className="notice error">Dieser App-Version fehlt eine benötigte Komponente. Bitte installiere das aktuelle vollständige Update.</div>}
          </div>
        </article>
        <UpdateSettings />
      </section>
      {dialog === "openai" && <OpenAiDialog status={status} close={() => setDialog(null)} refresh={refreshStatus} />}
      {dialog === "model" && <ModelDialog close={() => setDialog(null)} refresh={refreshStatus} />}
    </>
  );
}

function UpdateSettings() {
  const [message, setMessage] = useState("Updates werden automatisch geprüft. Hier kannst du die Prüfung sofort wiederholen.");
  const [url, setUrl] = useState<string | null>(null);
  const [directDownload, setDirectDownload] = useState(false);
  const [busy, setBusy] = useState(false);
  async function check() {
    setBusy(true); setUrl(null); setDirectDownload(false);
    try {
      if (!window.desktop) throw new Error("Update-Prüfung ist nur in der Desktop-App verfügbar.");
      const update = await window.desktop.checkForUpdate();
      setMessage(update.available ? `Version ${update.latestVersion} ist verfügbar.` : `Version ${update.currentVersion} ist aktuell.`);
      if (update.available) { setUrl(update.url); setDirectDownload(update.directDownload); }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Update-Prüfung fehlgeschlagen.");
    } finally { setBusy(false); }
  }
  return (
    <article>
      <div className="setting-icon"><UploadCloud /></div>
      <div><h3>App-Updates</h3><p>{message}</p></div>
      <div className="setting-action">
        {url && <button onClick={() => void window.desktop?.openExternal(url)}>{directDownload ? "DMG herunterladen" : "Release öffnen"}</button>}
        <button onClick={() => void check()} disabled={busy}>{busy ? "Prüft …" : "Jetzt prüfen"}</button>
      </div>
    </article>
  );
}

function OpenAiDialog({ status, close, refresh }: { status: SettingsStatus; close: () => void; refresh: () => Promise<void> }) {
  const [key, setKey] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true); setMessage(null);
    try {
      if (!window.desktop) throw new Error("Die Desktop-Verbindung ist nicht verfügbar. Bitte installiere das aktuelle Update und starte die App neu.");
      if (password !== confirmation) throw new Error("Die beiden Passwörter stimmen nicht überein.");
      await window.desktop.saveOpenAiKey(key, password);
      await refresh();
      setMessage("Der API-Schlüssel wurde lokal verschlüsselt gespeichert und für diese Sitzung entsperrt.");
      setKey("");
      setPassword("");
      setConfirmation("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Der Schlüssel konnte nicht gespeichert werden.");
    } finally { setBusy(false); }
  }

  async function unlock() {
    setBusy(true); setMessage(null);
    try {
      if (!window.desktop) throw new Error("Die Desktop-Verbindung ist nicht verfügbar.");
      await window.desktop.unlockOpenAiKey(password);
      await refresh();
      setMessage("Der API-Schlüssel ist für diese Sitzung entsperrt.");
      setPassword("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Der Schlüssel konnte nicht entsperrt werden.");
    } finally { setBusy(false); }
  }

  async function remove() {
    try {
      if (!window.desktop) throw new Error("Die Desktop-Verbindung ist nicht verfügbar.");
      await window.desktop.removeOpenAiKey();
      await refresh();
      setMessage("Der Sitzungsschlüssel wurde entfernt.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Der Schlüssel konnte nicht entfernt werden.");
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="openai-title">
        <button className="modal-close" onClick={close} aria-label="Dialog schließen"><X /></button>
        <div className="modal-icon"><Sparkles /></div>
        <p className="eyebrow">PROMPT ZU 3D</p>
        <h2 id="openai-title">{status.openAiConfigured ? "OpenAI-Schlüssel ist entsperrt" : status.openAiStored ? "OpenAI-Schlüssel entsperren" : "OpenAI-Schlüssel sicher speichern"}</h2>
        <p>Du legst ein eigenes AI-Print-Studio-Passwort fest. Damit wird dein API-Schlüssel lokal verschlüsselt. Weder dein Mac-Passwort noch der macOS-Schlüsselbund werden verwendet.</p>
        <div className="notice"><strong>Wichtig:</strong> Das App-Passwort wird nicht gespeichert und kann nicht wiederhergestellt werden. Wenn du es vergisst, musst du den gespeicherten Eintrag löschen und den OpenAI-Key erneut hinterlegen.</div>
        {!status.openAiStored && <>
          <label htmlFor="openai-key">OpenAI API-Schlüssel</label>
          <input id="openai-key" type="password" value={key} onChange={(event) => setKey(event.target.value)} placeholder="sk-••••••••••••••••••••" autoComplete="off" spellCheck={false} />
        </>}
        {!status.openAiConfigured && <>
          <label htmlFor="vault-password">AI-Print-Studio-Passwort</label>
          <input id="vault-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mindestens 10 Zeichen" autoComplete="off" spellCheck={false} />
        </>}
        {!status.openAiStored && <>
          <label htmlFor="vault-password-confirmation">App-Passwort wiederholen</label>
          <input id="vault-password-confirmation" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Passwort erneut eingeben" autoComplete="off" spellCheck={false} />
        </>}
        {status.openAiConfigured && <div className="notice">Der entschlüsselte Schlüssel ist nur während der laufenden App-Sitzung verfügbar. Zum Ersetzen lösche den Tresor und richte ihn neu ein.</div>}
        {message && <div className="notice">{message}</div>}
        <div className="modal-actions">
          {status.openAiStored && <button className="danger-button" onClick={() => void remove()}>Verschlüsselten Schlüssel löschen</button>}
          <button className="secondary-button" onClick={close}>Abbrechen</button>
          {status.openAiStored && !status.openAiConfigured
            ? <button className="primary-button" onClick={() => void unlock()} disabled={busy || password.length < 10}>{busy ? "Entsperrt …" : "Schlüssel entsperren"}</button>
            : !status.openAiStored && <button className="primary-button" onClick={() => void save()} disabled={busy || key.length < 20 || password.length < 10 || confirmation.length < 10}>{busy ? "Verschlüsselt …" : "Verschlüsselt speichern"}</button>}
        </div>
      </section>
    </div>
  );
}

function ModelDialog({ close }: { close: () => void; refresh: () => Promise<void> }) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="model-title">
        <button className="modal-close" onClick={close} aria-label="Dialog schließen"><X /></button>
        <div className="modal-icon"><Layers3 /></div>
        <p className="eyebrow">LOKALE 3D-ENGINE</p>
        <h2 id="model-title">Relief-Engine ist bereit</h2>
        <p>Der aktuelle stabile Modus erzeugt aus der Bildhelligkeit eine geschlossene, druckbare Reliefplatte. Er benötigt keinen Modelldownload und überträgt keine Bilder.</p>
        <div className="install-summary">
          <span><strong>Ausgabe</strong> STL und 3MF</span>
          <span><strong>Geometrie</strong> wasserdichtes Höhen-Mesh</span>
          <span><strong>Verarbeitung</strong> vollständig lokal</span>
        </div>
        <div className="notice">Bereit zum Testen: Im Studio ein Bild auswählen und „Relief erstellen“ anklicken.</div>
        <div className="modal-actions">
          <button className="primary-button" onClick={close}>Zum Studio</button>
        </div>
      </section>
    </div>
  );
}

function Footer({ version, openLegal }: { version: string; openLegal: (page: LegalPage) => void }) {
  return (
    <footer>
      <p>Quelloffen für nichtkommerzielle Nutzung · Michael Schellenberger</p>
      <div className="footer-links">
        <button onClick={() => openLegal("imprint")}>Impressum</button>
        <button onClick={() => openLegal("privacy")}>Datenschutz</button>
        <button onClick={() => openLegal("cookies")}>Cookiehinweise</button>
        <button onClick={() => window.desktop?.openExternal("https://github.com/Schello805/aiprintstudio")}><Github size={15} /> GitHub</button>
        <span>Rev. {version}</span>
      </div>
    </footer>
  );
}

function LegalView({ page, onClose, version }: { page: Exclude<LegalPage, null>; onClose: () => void; version: string }) {
  const content = {
    imprint: { title: "Impressum", body: "Die für eine öffentliche Veröffentlichung erforderlichen Anbieter- und Kontaktdaten werden vor dem ersten Release in der App-Konfiguration hinterlegt." },
    privacy: { title: "Datenschutz", body: "Bilder und 3D-Modelle werden grundsätzlich lokal auf diesem Mac verarbeitet. Bei Prompt zu 3D wird nur nach einer bewusst gestarteten Aktion die eingegebene Beschreibung an OpenAI übertragen; für komplexe Formen erzeugt OpenAI daraus ein sichtbares Referenzbild. Erst nach der Prüfung durch den Nutzer wird diese Referenz lokal rekonstruiert. Das optionale Hunyuan3D-Modell wird erst nach Anzeige von Quelle, Größe und Lizenz sowie ausdrücklicher Zustimmung heruntergeladen. Dabei werden Modellgewichte von Hugging Face bezogen; keine eigenen Bilder, Prompts oder Modelle werden an Hugging Face übertragen." },
    cookies: { title: "Cookiehinweise", body: "Diese Desktop-App verwendet keine Cookies und keine browserbasierte Nachverfolgung. Lokale Einstellungen werden ausschließlich auf dem Gerät gespeichert." }
  }[page];
  return (
    <div className="legal-shell">
      <button className="back-button" onClick={onClose}>← Zurück zum Studio</button>
      <article><p className="eyebrow">AI PRINT STUDIO · REV. {version}</p><h1>{content.title}</h1><p>{content.body}</p><h2>Hinweis</h2><p>Diese Informationen werden vor einer öffentlichen Veröffentlichung rechtlich geprüft und vervollständigt.</p></article>
    </div>
  );
}
