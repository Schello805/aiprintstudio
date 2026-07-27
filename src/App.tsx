import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import {
  Box,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Github,
  History,
  ImagePlus,
  Layers3,
  Settings2,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  X
} from "lucide-react";
type View = "studio" | "history" | "settings";
type LegalPage = "imprint" | "privacy" | "cookies" | null;
type SelectedImage = { path: string; name: string; size: number; width: number; height: number; dataUrl: string };
type ReliefResult = Awaited<ReturnType<NonNullable<typeof window.desktop>["createRelief"]>>;
type QualityProfile = "fast" | "balanced" | "fine" | "photo" | "logo";
type HistoryEntry = {
  id: string; name: string; createdAt: string; stlPath: string; threeMfPath: string;
  triangleCount: number; widthMm: number; heightMm: number; profile: QualityProfile; score: number;
};

const profileOptions: { id: QualityProfile; label: string; description: string; resolution: number }[] = [
  { id: "fast", label: "Schnell", description: "Vorschau & Entwurf", resolution: 128 },
  { id: "balanced", label: "Standard", description: "Gute Allround-Qualität", resolution: 256 },
  { id: "fine", label: "Fein", description: "Maximale Oberflächendetails", resolution: 512 },
  { id: "photo", label: "Foto", description: "Weiche Tiefenübergänge", resolution: 320 },
  { id: "logo", label: "Logo", description: "Klare Kanten & Ebenen", resolution: 256 }
];

const navigation = [
  { id: "studio" as const, label: "Studio", icon: Sparkles },
  { id: "history" as const, label: "Verlauf", icon: History },
  { id: "settings" as const, label: "Einstellungen", icon: Settings2 }
];

export function App() {
  const [view, setView] = useState<View>("studio");
  const [legalPage, setLegalPage] = useState<LegalPage>(null);
  const [version, setVersion] = useState("0.1.0");
  const [file, setFile] = useState<SelectedImage | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ReliefResult>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [raiseLightAreas, setRaiseLightAreas] = useState(false);
  const [profile, setProfile] = useState<QualityProfile>("balanced");
  const [widthMm, setWidthMm] = useState(100);
  const [baseMm, setBaseMm] = useState(1.6);
  const [reliefMm, setReliefMm] = useState(4);
  const [smoothing, setSmoothing] = useState(2);
  const [detail, setDetail] = useState(1);
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem("ai-print-studio-history") ?? "[]") as HistoryEntry[]; }
    catch { return []; }
  });

  useEffect(() => {
    void window.desktop?.getVersion().then(setVersion);
  }, []);

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
      setFileError(null);
      setFile(selected);
      setPreview(selected.dataUrl);
      setResult(null);
      setUploadStatus(`${selected.width} × ${selected.height} Pixel erfolgreich geladen.`);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Das Bild konnte nicht geöffnet werden.");
      setUploadStatus(null);
    }
  }

  async function generateRelief() {
    if (!file) return;
    setBusy(true); setFileError(null); setResult(null);
    try {
      if (!window.desktop) throw new Error("Die lokale 3D-Engine ist nicht erreichbar. Bitte starte die App neu.");
      const next = await window.desktop.createRelief(file.path, {
        widthMm, baseMm, reliefMm,
        resolution: profileOptions.find((option) => option.id === profile)?.resolution ?? 256,
        invert: raiseLightAreas, profile, smoothing, detail
      });
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
      setFileError(error instanceof Error ? error.message : "Das Modell konnte nicht erstellt werden.");
    } finally { setBusy(false); }
  }

  if (legalPage) {
    return <LegalView page={legalPage} onClose={() => setLegalPage(null)} version={version} />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Layers3 size={22} /></div>
          <div><strong>AI Print</strong><span>STUDIO</span></div>
        </div>
        <nav aria-label="Hauptnavigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button key={id} className={view === id ? "nav-item active" : "nav-item"} onClick={() => setView(id)}>
              <Icon size={19} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-status">
          <span className="status-dot" />
          <div><strong>Lokale Relief-Engine</strong><span>Bereit · läuft offline</span></div>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div><p className="eyebrow">LOKALE 3D-WERKSTATT</p><h1>{view === "studio" ? "Neues Modell" : view === "history" ? "Verlauf" : "Einstellungen"}</h1></div>
          <div className="privacy-pill"><ShieldCheck size={16} /> Verarbeitung auf deinem Mac</div>
        </header>

        {view === "studio" && (
          <section className="workspace">
            <div className="intro">
              <h2>Vom Bild zum druckbaren Objekt.</h2>
              <p>Lade eine klare Aufnahme hoch. AI Print Studio rekonstruiert, repariert und exportiert dein Modell lokal.</p>
            </div>
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
                  <><div className="upload-icon"><UploadCloud size={32} /></div><h3>Bild für dein Relief auswählen</h3><p>PNG, JPG oder WEBP · maximal 25 MB</p><button className="choose-file-button" onClick={(event) => { event.stopPropagation(); void selectFile(); }}>Bild auswählen</button><span>Die Datei wird ausschließlich lokal gelesen</span></>
                )}
              </div>
              {result && <ReliefPreview result={result} />}
            </div>
            {fileError && <div className="error-banner" role="alert"><strong>Bild konnte nicht geladen werden</strong><span>{fileError}</span><button onClick={() => setFileError(null)} aria-label="Fehlermeldung schließen"><X /></button></div>}
            {uploadStatus && !fileError && <div className="upload-status"><CheckCircle2 /> {uploadStatus}</div>}
            <div className="workflow-row" aria-label="Verarbeitungsschritte">
              {["Bild analysieren", "3D rekonstruieren", "Mesh reparieren", "Exportieren"].map((step, index) => (
                <div className="workflow-step" key={step}><span>{index + 1}</span><p>{step}</p>{index < 3 && <ChevronRight size={15} />}</div>
              ))}
            </div>
            <div className="conversion-options">
              <div className="option-group">
                <span className="option-label">QUALITÄTSPROFIL</span>
                <div className="profile-grid">
                  {profileOptions.map((option) => (
                    <button key={option.id} className={profile === option.id ? "profile-option selected" : "profile-option"} onClick={() => setProfile(option.id)}>
                      <strong>{option.label}</strong><span>{option.description}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="parameter-grid">
                <NumberField label="BREITE" value={widthMm} unit="mm" min={20} max={300} step={5} setValue={setWidthMm} />
                <NumberField label="GRUNDPLATTE" value={baseMm} unit="mm" min={0.8} max={10} step={0.2} setValue={setBaseMm} />
                <NumberField label="RELIEF" value={reliefMm} unit="mm" min={0.5} max={20} step={0.5} setValue={setReliefMm} />
                <NumberField label="GLÄTTUNG" value={smoothing} min={0} max={5} step={1} setValue={setSmoothing} />
                <NumberField label="DETAIL" value={detail} min={0} max={2} step={0.25} setValue={setDetail} />
              </div>
              <div className="option-footer">
                <div>
                  <span className="option-label">RELIEF-RICHTUNG</span>
                  <div className="segmented-control">
                    <button className={!raiseLightAreas ? "selected" : ""} onClick={() => setRaiseLightAreas(false)}>Dunkles anheben</button>
                    <button className={raiseLightAreas ? "selected" : ""} onClick={() => setRaiseLightAreas(true)}>Helles anheben</button>
                  </div>
                </div>
                <div className="cost-estimate">
                  <span className="option-label">KOSTEN PRO UMWANDLUNG</span>
                  <strong>0,00 €</strong><small>Lokale Verarbeitung · keine API-Nutzung</small>
                </div>
              </div>
            </div>
            <div className="action-bar">
              <div><Box size={20} /><div><strong>{file ? file.name : "Noch kein Bild gewählt"}</strong><span>{file ? `${(file.size / 1_048_576).toFixed(1)} MB · ${file.width} × ${file.height} px · bereit` : "Wähle zuerst eine geeignete Aufnahme aus."}</span></div></div>
              <button className="primary-button" disabled={!file || busy} onClick={() => void generateRelief()}>{busy ? "Mesh wird erzeugt …" : "Relief erstellen"} <ChevronRight size={18} /></button>
            </div>
            {busy && <div className="progress-card"><span /><div><strong>Lokale 3D-Verarbeitung</strong><p>Höhenmodell und wasserdichtes Mesh werden berechnet …</p></div></div>}
            {result && (
              <div className={`result-card ${result.printability.status}`}>
                <div className="result-check"><CheckCircle2 /></div>
                <div><strong>Modell erfolgreich erstellt · Druckscore {result.printability.score}/100</strong><p>{result.triangleCount.toLocaleString("de-DE")} Dreiecke · {result.widthMm.toFixed(0)} × {result.heightMm.toFixed(0)} mm · ca. {result.printability.estimatedVolumeCm3.toFixed(1)} cm³</p><p>{result.printability.issues.join(" ")}</p></div>
                <img className="heightmap-preview" src={result.heightmapDataUrl} alt="Berechnete Höhenkarte" title="Berechnete Höhenkarte" />
                <button className="secondary-button" onClick={() => void window.desktop?.showItemInFolder(result.stlPath)}>Im Finder zeigen</button>
              </div>
            )}
          </section>
        )}

        {view === "history" && (history.length ? <HistoryView entries={history} clear={() => { setHistory([]); localStorage.removeItem("ai-print-studio-history"); }} /> : <EmptyState icon={Clock3} title="Noch keine Modelle" text="Fertige Modelle erscheinen nach der ersten Umwandlung hier." />)}
        {view === "settings" && <Settings />}

        <Footer version={version} openLegal={setLegalPage} />
      </main>
    </div>
  );
}

function ReliefPreview({ result }: { result: NonNullable<ReliefResult> }) {
  const geometry = useMemo(() => {
    const next = new THREE.BufferGeometry();
    next.setAttribute("position", new THREE.Float32BufferAttribute(result.preview.positions, 3));
    next.setIndex(result.preview.indices);
    next.computeVertexNormals();
    next.computeBoundingSphere();
    return next;
  }, [result]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <div className="preview-card">
      <div className="panel-label">3D-VORSCHAU · ZIEHEN ZUM DREHEN</div>
      <Canvas camera={{ position: [95, 90, 120], fov: 38 }} dpr={[1, 2]}>
        <color attach="background" args={["#0b0e13"]} />
        <ambientLight intensity={1.5} />
        <directionalLight position={[60, 100, 80]} intensity={3.2} />
        <directionalLight position={[-50, 35, -60]} intensity={1.1} color="#b6d7ff" />
        <mesh geometry={geometry}>
          <meshStandardMaterial color="#b7f58a" roughness={0.62} metalness={0.05} side={THREE.DoubleSide} />
        </mesh>
        <gridHelper args={[180, 18, "#2e3944", "#1b222b"]} />
        <OrbitControls makeDefault target={[0, 2, 0]} minDistance={70} maxDistance={280} enableDamping />
      </Canvas>
    </div>
  );
}

function NumberField({ label, value, unit, min, max, step, setValue }: {
  label: string; value: number; unit?: string; min: number; max: number; step: number; setValue: (value: number) => void;
}) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <div><input type="number" value={value} min={min} max={max} step={step} onChange={(event) => setValue(Math.max(min, Math.min(max, Number(event.target.value))))} />{unit && <small>{unit}</small>}</div>
    </label>
  );
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
  modelSetupAccepted: boolean;
  encryptionAvailable: boolean;
  storageVersion: number;
};

function Settings() {
  const [dialog, setDialog] = useState<"openai" | "model" | null>(null);
  const [status, setStatus] = useState<SettingsStatus>({
    openAiConfigured: false,
    modelSetupAccepted: false,
    encryptionAvailable: true,
    storageVersion: 0
  });

  async function refreshStatus() {
    if (!window.desktop) return;
    const next = await window.desktop.getSettingsStatus();
    setStatus(next);
  }

  useEffect(() => { void refreshStatus(); }, []);

  return (
    <>
      <section className="settings-grid">
        <article><div className="setting-icon"><Sparkles /></div><div><h3>OpenAI-Analyse</h3><p>{status.openAiConfigured ? "API-Key ist verschlüsselt gespeichert und lesbar." : "Optional: Erkennt das Motiv und schlägt passende Druckparameter vor."}</p></div><div className="setting-action">{status.openAiConfigured ? <span className="tag"><CheckCircle2 /> Eingerichtet</span> : <span className="tag neutral">Nicht eingerichtet</span>}<button onClick={() => setDialog("openai")}>{status.openAiConfigured ? "Verwalten" : "Einrichten"}</button></div></article>
        <article><div className="setting-icon"><Layers3 /></div><div><h3>Lokale Relief-Engine</h3><p>Integriert · erzeugt wasserdichte STL- und 3MF-Dateien vollständig offline.</p></div><button onClick={() => setDialog("model")}>Details</button></article>
        <article><div className="setting-icon"><CheckCircle2 /></div><div><h3>Hardwareprofil</h3><p>Apple M3 · 16 GB · automatische CPU-/Metal-Auswahl</p></div><span className="tag">Erkannt</span></article>
        <UpdateSettings />
      </section>
      {dialog === "openai" && <OpenAiDialog status={status} close={() => setDialog(null)} refresh={refreshStatus} />}
      {dialog === "model" && <ModelDialog close={() => setDialog(null)} refresh={refreshStatus} />}
    </>
  );
}

function UpdateSettings() {
  const [message, setMessage] = useState("Prüft GitHub Releases nur auf Wunsch.");
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function check() {
    setBusy(true); setUrl(null);
    try {
      if (!window.desktop) throw new Error("Update-Prüfung ist nur in der Desktop-App verfügbar.");
      const update = await window.desktop.checkForUpdate();
      setMessage(update.available ? `Version ${update.latestVersion} ist verfügbar.` : `Version ${update.currentVersion} ist aktuell.`);
      if (update.available) setUrl(update.url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Update-Prüfung fehlgeschlagen.");
    } finally { setBusy(false); }
  }
  return (
    <article>
      <div className="setting-icon"><UploadCloud /></div>
      <div><h3>App-Updates</h3><p>{message}</p></div>
      <div className="setting-action">
        {url && <button onClick={() => void window.desktop?.openExternal(url)}>Download</button>}
        <button onClick={() => void check()} disabled={busy}>{busy ? "Prüft …" : "Jetzt prüfen"}</button>
      </div>
    </article>
  );
}

function OpenAiDialog({ status, close, refresh }: { status: SettingsStatus; close: () => void; refresh: () => Promise<void> }) {
  const [key, setKey] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true); setMessage(null);
    try {
      if (!window.desktop) throw new Error("Die Desktop-Verbindung ist nicht verfügbar. Bitte installiere das aktuelle Update und starte die App neu.");
      await window.desktop.saveOpenAiKey(key);
      await refresh();
      setMessage("Der Schlüssel wurde verschlüsselt auf diesem Mac gespeichert.");
      setKey("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Der Schlüssel konnte nicht gespeichert werden.");
    } finally { setBusy(false); }
  }

  async function remove() {
    try {
      if (!window.desktop) throw new Error("Die Desktop-Verbindung ist nicht verfügbar.");
      await window.desktop.removeOpenAiKey();
      await refresh();
      setMessage("Der gespeicherte Schlüssel wurde entfernt.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Der Schlüssel konnte nicht entfernt werden.");
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="openai-title">
        <button className="modal-close" onClick={close} aria-label="Dialog schließen"><X /></button>
        <div className="modal-icon"><Sparkles /></div>
        <p className="eyebrow">OPTIONALE ANALYSE</p>
        <h2 id="openai-title">OpenAI sicher verbinden</h2>
        <p>Der Schlüssel wird mit der macOS-Systemverschlüsselung geschützt und niemals im Frontend oder in Protokollen angezeigt.</p>
        <label htmlFor="openai-key">OpenAI API-Schlüssel</label>
        <input id="openai-key" type="password" value={key} onChange={(event) => setKey(event.target.value)} placeholder="sk-••••••••••••••••••••" autoComplete="off" />
        {!status.encryptionAvailable && <div className="notice error">Die macOS-Verschlüsselung ist auf diesem System nicht verfügbar.</div>}
        {message && <div className="notice">{message}</div>}
        <div className="modal-actions">
          {status.openAiConfigured && <button className="danger-button" onClick={() => void remove()}>Schlüssel entfernen</button>}
          <button className="secondary-button" onClick={close}>Abbrechen</button>
          <button className="primary-button" onClick={() => void save()} disabled={busy || key.length < 20 || !status.encryptionAvailable}>{busy ? "Speichern …" : status.openAiConfigured ? "Ersetzen" : "Speichern"}</button>
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
    privacy: { title: "Datenschutz", body: "Bilder und 3D-Modelle werden standardmäßig ausschließlich lokal auf diesem Mac verarbeitet. Eine optionale OpenAI-Analyse wird nur nach ausdrücklicher Aktivierung verwendet. Vor der Übertragung zeigt die App den Empfänger und Zweck an." },
    cookies: { title: "Cookiehinweise", body: "Diese Desktop-App verwendet keine Cookies und keine browserbasierte Nachverfolgung. Lokale Einstellungen werden ausschließlich auf dem Gerät gespeichert." }
  }[page];
  return (
    <div className="legal-shell">
      <button className="back-button" onClick={onClose}>← Zurück zum Studio</button>
      <article><p className="eyebrow">AI PRINT STUDIO · REV. {version}</p><h1>{content.title}</h1><p>{content.body}</p><h2>Hinweis</h2><p>Diese Informationen werden vor einer öffentlichen Veröffentlichung rechtlich geprüft und vervollständigt.</p></article>
    </div>
  );
}
