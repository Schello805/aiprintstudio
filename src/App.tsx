import { useEffect, useRef, useState } from "react";
import {
  Box,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Cpu,
  FolderOpen,
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
  X
} from "lucide-react";
import { SettingTooltip } from "./SettingTooltip";
import {
  automaticSmoothingForMode,
  mapReliefPassProgress,
  meaningfulReliefIssueCount,
  minimumFeatureForMode,
  optimizationVariants,
  rankReliefCandidate,
  resolveReliefMode
} from "./domain/relief-optimization";
import appLogoMark from "../build/icon-mark-v2.png";
import {
  darkestColorIndex,
  detectPalette,
  formatStorage,
  isExcellentReliefResult,
  modeTooltips,
  optimalResolution,
  parameterTooltips,
  RELIEF_ENGINE_VERSION,
  type AppMetrics,
  type HistoryEntry,
  type LegalPage,
  type PipelineKind,
  type ProcessingMode,
  type ProductShape,
  type QualityProfile,
  type ReliefResult,
  type SelectedImage,
  type StudioProject,
  type StudioTool,
  type UpdateInfo,
  type View
} from "./types/studio";
import { NumberField } from "./components/CommonControls";
import {
  ReliefLoadingPreview,
  ReliefPreview,
  ReliefPreviewPlaceholder,
  ReliefResultCard,
  SlicerAnalysisCard
} from "./components/ReliefPreview";
import { TextToStlDialog } from "./components/TextToStlDialog";
import { Ai3dDialog } from "./components/Ai3dDialog";
import { Settings } from "./components/SettingsView";
import { EmptyState, Footer, HistoryView, InfoView, LegalView, StudioHub } from "./components/AppViews";

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
  const [appMetrics, setAppMetrics] = useState<AppMetrics | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateCheckFailed, setUpdateCheckFailed] = useState(false);
  const [updateInstalling, setUpdateInstalling] = useState(false);
  const [updateProgressPercent, setUpdateProgressPercent] = useState<number | null>(null);
  const [file, setFile] = useState<SelectedImage | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [sourcePreviewMode, setSourcePreviewMode] = useState<"original" | "heightmap">("original");
  const [fileError, setFileError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reliefProgress, setReliefProgress] = useState({ phase: "Vorbereiten", detail: "Die lokale 3D-Engine wird gestartet …", progress: 0 });
  const activeReliefJob = useRef<string | null>(null);
  const reliefProgressWindow = useRef({ start: 1, end: 96 });
  const recoveryLoaded = useRef(false);
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
  const optimizeForStandardNozzle = true;
  const reduceTo250kTriangles = true;
  const [productShape, setProductShape] = useState<ProductShape>("source");
  const [borderMm, setBorderMm] = useState(0);
  const [holeDiameterMm, setHoleDiameterMm] = useState(0);
  const [curveAngle, setCurveAngle] = useState(0);
  const [multicolorEnabled, setMulticolorEnabled] = useState(false);
  const [colorCount, setColorCount] = useState(4);
  const [sourceColors, setSourceColors] = useState(["#111827", "#F5F5F4", "#22C55E", "#F59E0B"]);
  const [colors, setColors] = useState(["#111827", "#F5F5F4", "#22C55E", "#F59E0B"]);
  const [colorMapping, setColorMapping] = useState([0, 1, 2, 3]);
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
    if (!window.desktop) return;
    void window.desktop.getRecovery()
      .then((stored) => {
        recoveryLoaded.current = true;
        const project = stored as StudioProject | null;
        if (project?.schemaVersion === 1 && project.source) {
          applyProject(
            project,
            project.engineVersion === RELIEF_ENGINE_VERSION
              ? "Bild und Einstellungen wiederhergestellt · Modell bitte neu aktualisieren."
              : "Bild und Einstellungen wiederhergestellt · Alte Modellvorschau wegen Qualitätsupdate verworfen."
          );
        }
      })
      .catch(() => { recoveryLoaded.current = true; });
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
    const offProgress = window.desktop?.onUpdateProgress?.((progress) => {
      if (!active) return;
      setUpdateProgressPercent(progress.phase === "error" ? null : progress.percent);
      if (progress.phase === "ready" || progress.phase === "error") {
        setUpdateInstalling(false);
      }
    });
    return () => {
      active = false;
      window.clearTimeout(initial);
      window.clearInterval(timer);
      offProgress?.();
    };
  }, []);

  useEffect(() => window.desktop?.onReliefProgress((jobId, progress) => {
    if (activeReliefJob.current !== jobId) return;
    const mapped = mapReliefPassProgress(progress.progress, reliefProgressWindow.current.start, reliefProgressWindow.current.end);
    setReliefProgress((current) => ({
      ...progress,
      // Interne Varianten und Größenkorrekturen besitzen jeweils einen
      // eigenen 0–100-Fortschritt. In der UI werden sie in ein einziges,
      // monotones Gesamtfenster abgebildet. 100 bleibt dem echten Abschluss
      // inklusive Vorschau, STL und 3MF vorbehalten.
      progress: current.progress >= 100 ? 100 : Math.min(99, Math.max(current.progress, mapped))
    }));
  }), []);

  useEffect(() => {
    if (!preview) return;
    let active = true;
    void detectPalette(preview)
      .then((palette) => {
        if (!active) return;
        setColorCount(palette.length);
        setSourceColors(palette);
        setColors(palette);
        setColorMapping(palette.map((_, index) => index));
        setSideColorIndex(darkestColorIndex(palette));
      })
      .catch(() => {
        if (!active) return;
        const fallback = ["#111827", "#F5F5F4", "#22C55E", "#F59E0B"];
        setColorCount(fallback.length);
        setSourceColors(fallback);
        setColors(fallback);
        setColorMapping(fallback.map((_, index) => index));
        setSideColorIndex(0);
      });
    return () => { active = false; };
  }, [preview]);

  async function selectFile(targetTool: Exclude<StudioTool, "home" | "text" | "prompt"> = "image") {
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
      setStudioTool(targetTool);
      if (targetTool === "lithophane") {
        setProfile("photo"); setProcessingMode("height"); setBaseMm(0.8); setReliefMm(2.4);
        setRaiseLightAreas(false); setProductShape("rectangle"); setBorderMm(2); setHoleDiameterMm(0); setCurveAngle(0);
      } else {
        setProductShape("source"); setBorderMm(0); setHoleDiameterMm(0); setCurveAngle(0);
      }
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Das Bild konnte nicht geöffnet werden.");
      setUploadStatus(null);
    }
  }

  function applySelectedImage(selected: SelectedImage) {
    setFileError(null);
    setFile(selected);
    setPreview(selected.dataUrl);
    setSourcePreviewMode("original");
    setProfile(selected.suggestedProfile);
    setProcessingMode(selected.format === "svg" ? "wordmark" : selected.suggestedProfile === "logo" ? "vector" : "depth");
    if (selected.format === "svg") setIncludeLogoBackground(true);
    setResult(null);
    setUploadStatus(selected.format === "svg"
      ? `${selected.width} × ${selected.height} SVG geladen · beste Qualität: echte Pfade für Logo/Text aktiv.`
      : selected.suggestedProfile === "logo"
        ? `${selected.width} × ${selected.height} Pixel geladen · PNG/JPG ist erlaubt, aber mit einer SVG-Datei wird Logo-Schrift deutlich sauberer.`
        : `${selected.width} × ${selected.height} Pixel geladen · Profil „Foto“ empfohlen.`);
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
    reliefProgressWindow.current = { start: 1, end: repair ? 4 : 90 };
    setReliefProgress({ phase: "Vorbereiten", detail: "Die lokale 3D-Engine wird gestartet …", progress: 1 });
    setBusy(true); setFileError(null); setResult(null);
    try {
      if (!window.desktop) throw new Error("Die lokale 3D-Engine ist nicht erreichbar. Bitte starte die App neu.");
      // Eine Reparatur darf niemals das vom Nutzer gewählte Verfahren ändern.
      // Insbesondere bleibt ein Wappen im Vektormodus und wird nicht mehr
      // stillschweigend als Wortlogo neu interpretiert.
      const effectiveMode = resolveReliefMode(processingMode, file.suggestedProfile);
      const wordmarkWithBackground = effectiveMode === "wordmark" && (repair || includeLogoBackground);
      const effectiveResolution = wordmarkWithBackground
        // Feine Logo-Schriften enthalten oft Antialias-Rauschen. 512px erkennt
        // dieses Rauschen als echte Mikro-Konturen; 256px liefert sichtbar
        // ruhigere Vektorkonturen und bleibt trotzdem scharf genug für Druck.
        ? 256
        : effectiveMode === "auto" && file.suggestedProfile === "logo"
          ? 384
          : repair ? Math.min(384, optimalResolution[profile]) : optimalResolution[profile];
      const automaticSmoothing = automaticSmoothingForMode(effectiveMode);
      const automaticDetail = effectiveMode === "depth" ? 0.75 : 1;
      const pipelineKind: PipelineKind = studioTool === "text"
        ? "text"
        : studioTool === "lithophane"
          ? "lithophane"
          : effectiveMode === "vector"
            ? "emblem"
            : effectiveMode === "wordmark"
              ? "wordmark"
              : effectiveMode === "depth" || effectiveMode === "height"
                ? "photo"
                : "auto";
      const request: Parameters<NonNullable<typeof window.desktop>["createRelief"]>[2] = {
        sourceName: file.name,
        widthMm, baseMm: studioTool === "lithophane" ? baseMm : 1.6, reliefMm,
        resolution: effectiveResolution,
        invert: false, profile, smoothing: automaticSmoothing, detail: automaticDetail,
        processingMode: effectiveMode,
        pipelineKind,
        includeBackground: wordmarkWithBackground,
        nozzleMm: 0.4,
        minimumFeatureMm: effectiveMode === "wordmark" && includeLogoBackground
          ? 0.3
          : minimumFeatureForMode(effectiveMode, file.suggestedProfile, repair || optimizeForStandardNozzle),
        sourceColors: multicolorEnabled ? sourceColors : [],
        colors: multicolorEnabled ? colors : [],
        colorMapping: multicolorEnabled ? colorMapping : [],
        sideColorIndex: multicolorEnabled ? sideColorIndex : 0,
        outputMode: studioTool === "lithophane" ? "lithophane" : "relief",
        shape: productShape,
        borderMm,
        borderHeightMm: borderMm > 0 ? reliefMm : 0,
        holeDiameterMm: studioTool === "lithophane" ? holeDiameterMm : 0,
        holePosition: "top-center",
        curveAngle: studioTool === "lithophane" ? curveAngle : 0,
        mirrorX: false
      };
      let currentResolution = effectiveResolution;
      let selectedSmoothing = automaticSmoothing;
      let selectedDetail = automaticDetail;
      if (repair) {
        const optimizationMode = pipelineKind === "emblem" ? "vector" : effectiveMode;
        const candidates = optimizationVariants(optimizationMode, effectiveResolution, automaticDetail);
        let bestRank = Number.NEGATIVE_INFINITY;
        for (let index = 0; index < candidates.length; index += 1) {
          const variant = candidates[index];
          const passStart = 4 + index / candidates.length * 46;
          const passEnd = 4 + (index + 1) / candidates.length * 46;
          reliefProgressWindow.current = { start: passStart, end: passEnd };
          setReliefProgress({
            phase: "Varianten vergleichen",
            detail: `Lokale Qualitätsvariante ${index + 1} von ${candidates.length} wird geprüft …`,
            progress: Math.round(passStart)
          });
          const candidate = await window.desktop.createRelief(jobId, file.path, {
            ...request,
            resolution: variant.resolution,
            smoothing: variant.smoothing,
            detail: variant.detail
          });
          if (!candidate) throw new Error("Vorgang abgebrochen");
          const recommended = optimizationMode === "vector" ? 1 : automaticSmoothing;
          const rank = rankReliefCandidate({
            score: candidate.printability.score,
            contourScore: candidate.contourQuality.score,
            issueCount: meaningfulReliefIssueCount(candidate.printability.issues),
            triangleCount: candidate.triangleCount,
            smoothing: variant.smoothing,
            recommendedSmoothing: recommended,
            geometryValid: candidate.geometryValidation.valid,
            transitionsOk: candidate.printability.checks.find((check) => check.label === "Übergänge")?.status === "ok",
            stlBytes: candidate.fileBytes.stl,
            threeMfBytes: candidate.fileBytes.threeMf
          });
          if (rank > bestRank) {
            bestRank = rank;
            selectedSmoothing = variant.smoothing;
            selectedDetail = variant.detail;
            currentResolution = variant.resolution;
          }
          if (isExcellentReliefResult(candidate)) {
            selectedSmoothing = variant.smoothing;
            selectedDetail = variant.detail;
            currentResolution = variant.resolution;
            setReliefProgress({ phase: "Hervorragend", detail: `Variante ${index + 1} erfüllt alle lokalen Qualitätsprüfungen.`, progress: Math.round(passEnd) });
            break;
          }
        }
        setSmoothing(selectedSmoothing);
        setDetail(selectedDetail);
        setReliefProgress({ phase: "Beste Variante erstellen", detail: `Glättung ${selectedSmoothing} und Detail ${selectedDetail.toFixed(2).replace(".", ",")} liefern lokal das beste Ergebnis.`, progress: 52 });
      }
      request.smoothing = selectedSmoothing;
      request.detail = selectedDetail;
      request.resolution = currentResolution;
      reliefProgressWindow.current = { start: repair ? 52 : 2, end: 90 };
      let next = await window.desktop.createRelief(jobId, file.path, request);
      for (let attempt = 0; next && reduceTo250kTriangles && (next.triangleCount > 250_000 || next.fileBytes.stl > 25_000_000 || next.fileBytes.threeMf > 25_000_000) && attempt < 8; attempt += 1) {
        const triangleFactor = Math.sqrt(225_000 / Math.max(1, next.triangleCount));
        const fileFactor = Math.sqrt(23_000_000 / Math.max(1, next.fileBytes.stl, next.fileBytes.threeMf));
        let reducedResolution = Math.max(32, Math.floor(currentResolution * Math.min(0.88, triangleFactor, fileFactor)));
        if (reducedResolution >= currentResolution) reducedResolution = Math.max(32, currentResolution - 32);
        if (reducedResolution >= currentResolution) break;
        const reductionStart = 90 + attempt * 0.85;
        reliefProgressWindow.current = { start: reductionStart, end: Math.min(97, reductionStart + 1.75) };
        setReliefProgress({
          phase: "Meshgröße reduzieren",
          detail: `Die Exportgröße wird automatisch angepasst (${next.triangleCount.toLocaleString("de-DE")} Dreiecke, ${(Math.max(next.fileBytes.stl, next.fileBytes.threeMf) / 1_048_576).toFixed(1).replace(".", ",")} MB) …`,
          progress: Math.round(reductionStart)
        });
        currentResolution = reducedResolution;
        next = await window.desktop.createRelief(jobId, file.path, {
          ...request,
          resolution: currentResolution
        });
      }
      if (next) {
        if (next.triangleCount > 250_000 || next.fileBytes.stl > 25_000_000 || next.fileBytes.threeMf > 25_000_000) {
          throw new Error("Das Modell überschreitet trotz automatischer Reduzierung 250.000 Dreiecke oder 25 MB. Bitte wähle ein weniger komplexes Motiv.");
        }
        setReliefProgress({ phase: "Fertig", detail: "Vorschau, STL und 3MF sind vollständig erstellt.", progress: 100 });
        setResult(next);
        const entry: HistoryEntry = {
          id: crypto.randomUUID(), name: file.name, createdAt: new Date().toISOString(),
          triangleCount: next.triangleCount,
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
    if (!window.confirm("Modell lokal optimieren?\n\nDie App vergleicht mehrere Glättungsvarianten, verstärkt zu feine Details für eine 0,4-mm-Düse und behält das aktuell gewählte Verfahren bei.")) return;
    setBaseMm((current) => Math.max(1.6, current));
    await generateRelief(true);
  }

  function currentProject(): StudioProject | null {
    if (!file || studioTool === "prompt" || studioTool === "home") return null;
    return {
      schemaVersion: 1,
      engineVersion: RELIEF_ENGINE_VERSION,
      savedAt: new Date().toISOString(),
      source: file,
      tool: studioTool,
      settings: {
        widthMm, baseMm, reliefMm, smoothing, detail, processingMode, profile, raiseLightAreas,
        multicolorEnabled, colorCount, sourceColors, colors, colorMapping, sideColorIndex,
        includeLogoBackground, optimizeForStandardNozzle,
        reduceTo250kTriangles, productShape, borderMm, holeDiameterMm, curveAngle
      }
    };
  }

  useEffect(() => {
    if (!recoveryLoaded.current || !file || !window.desktop) return;
    const timer = window.setTimeout(() => {
      const project: StudioProject | null = studioTool === "prompt" || studioTool === "home" ? null : {
        schemaVersion: 1,
        engineVersion: RELIEF_ENGINE_VERSION,
        savedAt: new Date().toISOString(),
        source: file,
        tool: studioTool,
        settings: {
          widthMm, baseMm, reliefMm, smoothing, detail, processingMode, profile, raiseLightAreas,
          multicolorEnabled, colorCount, sourceColors, colors, colorMapping, sideColorIndex,
          includeLogoBackground, optimizeForStandardNozzle, reduceTo250kTriangles,
          productShape, borderMm, holeDiameterMm, curveAngle
        }
      };
      if (project) void window.desktop?.saveRecovery(project).catch(() => undefined);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [file, studioTool, widthMm, baseMm, reliefMm, smoothing, detail, processingMode, profile, raiseLightAreas, multicolorEnabled, colorCount, sourceColors, colors, colorMapping, sideColorIndex, includeLogoBackground, optimizeForStandardNozzle, reduceTo250kTriangles, productShape, borderMm, holeDiameterMm, curveAngle]);

  function applyProject(loaded: StudioProject, message: string) {
    const settings = loaded.settings;
    setView("studio"); setStudioTool(loaded.tool); setFile(loaded.source); setPreview(loaded.source.dataUrl);
    setWidthMm(settings.widthMm); setBaseMm(settings.baseMm); setReliefMm(settings.reliefMm);
    setSmoothing(settings.smoothing); setDetail(settings.detail); setProcessingMode(settings.processingMode);
    setProfile(settings.profile); setRaiseLightAreas(settings.raiseLightAreas);
    setMulticolorEnabled(settings.multicolorEnabled); setColorCount(settings.colorCount);
    setSourceColors(settings.sourceColors); setColors(settings.colors); setSideColorIndex(settings.sideColorIndex);
    setColorMapping(settings.colorMapping ?? settings.colors.map((_, index) => index));
    setIncludeLogoBackground(settings.includeLogoBackground);
    setProductShape(settings.productShape ?? "source"); setBorderMm(settings.borderMm ?? 0);
    setHoleDiameterMm(settings.holeDiameterMm ?? 0); setCurveAngle(settings.curveAngle ?? 0);
    setResult(null); setFileError(null); setUploadStatus(message);
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
      applyProject(loaded, "Projekt vollständig wiederhergestellt.");
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

  function returnToToolSelection() {
    const hasProgress = Boolean(file || result);
    if (hasProgress && !window.confirm("Aktuellen Studio-Stand verwerfen?\n\nBild, Einstellungen, Farbauswahl und noch nicht exportierte Änderungen gehen dabei verloren.")) return;
    setStudioTool("home");
    setFile(null);
    setPreview(null);
    setResult(null);
    void window.desktop?.clearRecovery().catch(() => undefined);
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
          <div className="monitor-metric storage">
            <div><HardDrive /><span>FREIER SPEICHER</span><strong>{appMetrics?.freeStorageBytes ? formatStorage(appMetrics.freeStorageBytes) : "–"}</strong></div>
            <span className="monitor-track storage"><span style={{ width: `${Math.min(100, appMetrics?.totalStorageBytes ? appMetrics.freeStorageBytes / appMetrics.totalStorageBytes * 100 : 0)}%` }} /></span>
            <em>{appMetrics?.freeStorageBytes ? "Freier Speicher auf deinem Mac" : "Speicherprüfung nicht verfügbar"}</em>
          </div>
          <div className={`monitor-update ${updateInfo?.available ? "available" : ""}`}>
            <UploadCloud />
            <div>
              <span>APP-UPDATE</span>
              <strong>{updateInstalling
                ? `Update läuft (${Math.round(updateProgressPercent ?? 0)} %)`
                : updateInfo?.available
                  ? `Version ${updateInfo.latestVersion} verfügbar`
                  : updateInfo
                    ? `Version ${updateInfo.currentVersion} aktuell`
                    : updateCheckFailed
                      ? "Prüfung momentan nicht möglich"
                      : "Wird geprüft …"}</strong>
            </div>
            {updateInfo?.available && (
              <button
                disabled={updateInstalling}
                onClick={() => {
                  if (!window.desktop) return;
                  if (updateInfo.directDownload) {
                    setUpdateInstalling(true);
                    setUpdateProgressPercent(2);
                    void window.desktop.installUpdate(updateInfo.url).catch(() => {
                      setUpdateInstalling(false);
                      setUpdateProgressPercent(null);
                    });
                  } else {
                    void window.desktop.openExternal(updateInfo.url);
                  }
                }}
              >
                {updateInstalling ? `${Math.round(updateProgressPercent ?? 0)} %` : "Installieren"}
              </button>
            )}
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
            openImage={() => void selectFile("image")}
            openText={() => { setStudioTool("text"); setTextDialogOpen(true); }}
            openLithophane={() => void selectFile("lithophane")}
            openPrompt={() => { setStudioTool("prompt"); setAi3dDialogOpen(true); }}
          />
        )}

        {view === "studio" && studioTool !== "home" && (
          <section className="workspace">
            <div className="tool-context">
              <button onClick={returnToToolSelection}>← Alle Werkzeuge</button>
              <span>{studioTool === "prompt" ? <Sparkles /> : studioTool === "text" ? <Type /> : <ImagePlus />}{studioTool === "image" ? "Bild zu 3D" : studioTool === "text" ? "Schrift zu 3D" : studioTool === "lithophane" ? "Foto zu Lithophan" : <>Prompt zu 3D <b className="beta-badge">BETA</b></>}</span>
              {studioTool !== "prompt" && <div className="project-actions">
                <button onClick={() => void openProject()}><FolderOpen /> Projekt öffnen</button>
                <button disabled={!file} onClick={() => void saveProject()}><Save /> Projekt speichern</button>
              </div>}
            </div>
            <div className="intro">
              <h2>{studioTool === "text" ? "Von Schrift zum druckbaren Objekt." : studioTool === "prompt" ? "Von deiner Idee zum vollständigen 3D-Modell." : studioTool === "lithophane" ? "Vom Foto zum leuchtenden Lithophan." : "Vom Bild zum druckbaren Objekt."}</h2>
              <p>{studioTool === "text" ? "Gestalte saubere Schriftzüge und exportiere sie lokal als STL oder farbige 3MF." : studioTool === "prompt" ? "Beschreibe dein Objekt. Die KI optimiert die Konstruktion und erzeugt eine druckbare STL." : studioTool === "lithophane" ? "Helligkeit wird in Materialstärke übersetzt – flach oder sanft gewölbt und vollständig lokal." : "Lade eine klare Aufnahme hoch. AI Print Studio rekonstruiert, repariert und exportiert dein Modell lokal."}</p>
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
            <div className="comparison-grid">
              <div
                className={preview ? "upload-card has-preview" : "upload-card"}
                onClick={() => studioTool === "text" ? setTextDialogOpen(true) : void selectFile(studioTool === "lithophane" ? "lithophane" : "image")}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => event.key === "Enter" && (studioTool === "text" ? setTextDialogOpen(true) : void selectFile(studioTool === "lithophane" ? "lithophane" : "image"))}
              >
                {preview ? (
                  <><div className="panel-label">{sourcePreviewMode === "heightmap" && result ? "VERARBEITETE HÖHENKARTE" : "ORIGINALBILD"}</div><img src={sourcePreviewMode === "heightmap" && result ? result.heightmapDataUrl : preview} alt={sourcePreviewMode === "heightmap" ? "Verarbeitete Höhenkarte" : "Vorschau des ausgewählten Bildes"} />{result && <div className="source-preview-toggle" onClick={(event) => event.stopPropagation()}><button className={sourcePreviewMode === "original" ? "active" : ""} onClick={() => setSourcePreviewMode("original")}>Original</button><button className={sourcePreviewMode === "heightmap" ? "active" : ""} onClick={() => setSourcePreviewMode("heightmap")}>Höhenkarte</button></div>}<div className="file-overlay"><ImagePlus size={18} /> Bild wechseln</div></>
                ) : (
                  <><div className="upload-icon">{studioTool === "text" ? <Type size={32} /> : <UploadCloud size={32} />}</div><h3>{studioTool === "text" ? "Schriftzug gestalten" : "Bild oder SVG auswählen"}</h3><p>{studioTool === "text" ? "Text, Schriftart und Ausrichtung festlegen" : "PNG, JPG, WEBP oder SVG"}</p><div className="source-actions"><button className="choose-file-button" onClick={(event) => { event.stopPropagation(); if (studioTool === "text") setTextDialogOpen(true); else void selectFile(studioTool === "lithophane" ? "lithophane" : "image"); }}>{studioTool === "text" ? "Text eingeben" : "Datei auswählen"}</button></div><span>Die Verarbeitung erfolgt vollständig lokal</span></>
                )}
              </div>
              {busy
                ? <ReliefLoadingPreview progress={reliefProgress} onCancel={() => void cancelRelief()} />
                : result
                  ? <ReliefPreview result={result} />
                  : <ReliefPreviewPlaceholder />}
            </div>
            {fileError && <div className="error-banner" role="alert"><strong>Verarbeitung fehlgeschlagen</strong><span>{fileError}</span><button className="diagnostic-log-button" onClick={() => void window.desktop?.showDiagnosticLogs()}>Lokale Diagnose</button><button onClick={() => setFileError(null)} aria-label="Fehlermeldung schließen"><X /></button></div>}
            {uploadStatus && !fileError && <div className="upload-status"><CheckCircle2 /> {uploadStatus}</div>}
            {result && !busy && <>
              <ReliefResultCard result={result} optimize={() => void repairAndRegenerate()} />
              <SlicerAnalysisCard result={result} />
            </>}
            </div>
            <div className="conversion-options">
              {studioTool === "image" ? <div className="option-group">
                <div className="option-heading"><span className="option-label">ERGEBNISART</span><span className="quality-pill">Optimale Qualität automatisch aktiv</span></div>
                <div className="mode-grid primary-modes">
                  <button className={processingMode === "auto" ? "mode-option has-tooltip selected" : "mode-option has-tooltip"} onClick={() => { setProcessingMode("auto"); if (file) setProfile(file.suggestedProfile); }} aria-description={modeTooltips.auto}>
                    <Sparkles /><div><strong>Auf gut Glück</strong><span>Passende Methode wird geschätzt</span></div><SettingTooltip text={modeTooltips.auto} />
                  </button>
                  <button className={processingMode === "vector" ? "mode-option has-tooltip selected" : "mode-option has-tooltip"} onClick={() => { setProcessingMode("vector"); setProfile("logo"); }} aria-description={modeTooltips.vector}>
                    <Layers3 /><div><strong>Wappen & Emblem</strong><span>Innenflächen bleiben erhalten</span></div><SettingTooltip text={modeTooltips.vector} />
                  </button>
                  <button className={processingMode === "wordmark" ? "mode-option has-tooltip selected" : "mode-option has-tooltip"} onClick={() => { setProcessingMode("wordmark"); setProfile("logo"); setIncludeLogoBackground(true); }} aria-description={modeTooltips.wordmark}>
                    <Type /><div><strong>Logo mit Text</strong><span>Offene Buchstabenräume</span></div><SettingTooltip text={modeTooltips.wordmark} />
                  </button>
                  <button className={processingMode === "depth" ? "mode-option has-tooltip selected" : "mode-option has-tooltip"} onClick={() => { setProcessingMode("depth"); setProfile("photo"); }} aria-description={modeTooltips.depth}>
                    <Box /><div><strong>Foto & 3D-Tiefe</strong><span>Lokale KI-Tiefenschätzung</span></div><SettingTooltip text={modeTooltips.depth} />
                  </button>
                </div>
              </div> : studioTool === "text" ? <div className="text-quality-summary"><Type /><div><strong>Saubere Schriftkonturen automatisch aktiv</strong><span>Die App verwendet die lokale Logo-Engine mit hoher Konturauflösung.</span></div></div> : <div className="text-quality-summary"><Layers3 /><div><strong>Lithophan-Profil automatisch aktiv</strong><span>Dunkle Bildbereiche werden stabiler und lichtundurchlässiger aufgebaut.</span></div></div>}
              <>
                  <div className="parameter-grid essential-parameters">
                    <NumberField label="BREITE" tooltip={parameterTooltips.width} value={widthMm} unit="mm" min={20} max={300} step={5} setValue={setWidthMm} />
                    {studioTool === "lithophane" && <NumberField label="MATERIALBASIS" tooltip={parameterTooltips.base} value={baseMm} unit="mm" min={0.8} max={10} step={0.2} setValue={setBaseMm} />}
                    <NumberField label="RELIEF" tooltip={parameterTooltips.relief} value={reliefMm} unit="mm" min={0.5} max={20} step={0.5} setValue={setReliefMm} />
                  </div>
                  {studioTool === "lithophane" && <div className="product-options">
                    <div className="product-shape-row">
                      <span>AUSSENFORM</span>
                      <div>{(["rectangle", "rounded", "circle", "shield", "hexagon", "heart"] as ProductShape[]).map((shape) => <button className={productShape === shape ? "selected" : ""} onClick={() => setProductShape(shape)} key={shape}>{({ rectangle: "Rechteck", rounded: "Abgerundet", circle: "Kreis", shield: "Wappen", hexagon: "Sechseck", heart: "Herz", source: "Motiv" })[shape]}</button>)}</div>
                    </div>
                    <div className="product-quick-options">
                      <button className={borderMm > 0 ? "selected" : ""} onClick={() => setBorderMm((current) => current > 0 ? 0 : 2)}><Layers3 /><span><strong>Rahmen</strong><small>{borderMm > 0 ? `${borderMm} mm aktiv` : "Ohne Rand"}</small></span><span className="toggle-track"><span /></span></button>
                      <button className={holeDiameterMm > 0 ? "selected" : ""} onClick={() => setHoleDiameterMm((current) => current > 0 ? 0 : 5)}><Box /><span><strong>Aufhängeloch</strong><small>{holeDiameterMm > 0 ? `${holeDiameterMm} mm mittig oben` : "Deaktiviert"}</small></span><span className="toggle-track"><span /></span></button>
                    </div>
                    {studioTool === "lithophane" && <label className="curve-control"><span><strong>Wölbung</strong><small>{curveAngle}° · 0° ist flach</small></span><input type="range" min="0" max="90" step="5" value={curveAngle} onChange={(event) => setCurveAngle(Number(event.target.value))} /></label>}
                  </div>}
                  <div className="compact-option-grid">
                  {processingMode === "wordmark" && (
                    <>
                      <div className={file?.format === "svg" ? "svg-workflow-note ready" : "svg-workflow-note"}>
                        <Type />
                        <div>
                          <strong>{file?.format === "svg" ? "SVG-Pfade direkt aktiv" : "PNG/JPG wird lokal zu SVG vektorisiert"}</strong>
                          <span>{file?.format === "svg" ? "Beste Qualität: Schrift und Signet werden aus echten Kurven extrudiert." : "PNG funktioniert. Für lesbare kleine Schrift, offene Buchstabenräume und glatte Konturen ist eine echte SVG-Datei aber deutlich besser."}</span>
                        </div>
                      </div>
                      <button
                        className={includeLogoBackground ? "background-toggle selected" : "background-toggle"}
                        onClick={() => setIncludeLogoBackground((current) => !current)}
                        aria-pressed={includeLogoBackground}
                      >
                        <Layers3 />
                        <div>
                          <strong>Hintergrund mitdrucken</strong>
                          <span>{includeLogoBackground ? "Grundfläche bleibt erhalten; Text und Signet werden darüber angehoben" : "Nur Signet und Schrift werden freigestellt exportiert"}</span>
                        </div>
                        <SettingTooltip text={"Legt fest, ob die Bildfläche als zusammenhängende Grundplatte Teil des Modells bleibt.\nBeispiel: Aktiv für ein quadratisches App-Logo; deaktiviert für einen freistehenden Schriftzug."} />
                        <span className="toggle-track"><span /></span>
                      </button>
                    </>
                  )}
                  {studioTool !== "lithophane" && <div className={multicolorEnabled ? "multicolor-panel active" : "multicolor-panel"}>
                    <button className="multicolor-toggle" onClick={() => setMulticolorEnabled((current) => !current)} aria-pressed={multicolorEnabled}>
                      <Palette />
                      <div><strong>AMS-Farbdruck</strong><span>{multicolorEnabled ? `${colors.length} Farben werden als getrennte 3MF-Objekte exportiert` : "Mehrfarbige 3MF für Bambu Studio aktivieren"}</span></div>
                      <span className="toggle-track"><span /></span>
                    </button>
                    {multicolorEnabled && (
                      <div className="color-setup">
                        <div className="automatic-color-heading">
                          <div><strong>Farben automatisch erkannt</strong><span>{colorCount} Druckfarben · dunklste Farbe automatisch für Seiten und Tragkörper</span></div>
                          <SettingTooltip text={"Die App erkennt Farbanzahl, Motivfarben und die geeignete dunkle Farbe für Seiten und Tragkörper automatisch. Eine manuelle Korrektur ist nicht nötig.\nBeispiel: Rot, Weiß, Schwarz und Gelb werden direkt passenden 3MF-Materialien zugeordnet."} />
                        </div>
                        <div className="color-swatches read-only" aria-label="Automatisch erkannte Druckfarben">
                          {colors.map((color, index) => (
                            <div className="color-swatch" key={index}>
                              <span className="detected-color" style={{ background: color }} />
                              <span><strong>AMS {index + 1}</strong><small>{sourceColors[index]} → {color}</small></span>
                              {index === sideColorIndex && <small className="carrier-badge">Seiten</small>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>}
                  </div>
                </>
            </div>
            <div className="action-bar">
              <div><Box size={20} /><div><strong>{file ? file.name : "Noch kein Bild gewählt"}</strong><span>{file ? `${(file.size / 1_048_576).toFixed(1)} MB · ${file.width} × ${file.height} px · bereit` : "Wähle zuerst eine geeignete Aufnahme aus."}</span></div></div>
              <button className="primary-button" disabled={!file || busy} onClick={() => void generateRelief()}>{busy ? "Modell wird erzeugt …" : result ? "Modell aktualisieren" : "Relief erstellen"} <ChevronRight size={18} /></button>
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
      {ai3dDialogOpen && <Ai3dDialog close={() => { setAi3dDialogOpen(false); if (studioTool === "prompt") setStudioTool("home"); }} />}
    </div>
  );
}
