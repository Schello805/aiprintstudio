import { useEffect, useState } from "react";
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
type SelectedImage = { path: string; name: string; size: number; dataUrl: string };
type ReliefResult = Awaited<ReturnType<NonNullable<typeof window.desktop>["createRelief"]>>;

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

  useEffect(() => {
    void window.desktop?.getVersion().then(setVersion);
  }, []);

  async function selectFile() {
    try {
      const selected = await window.desktop?.selectImage();
      if (!selected) return;
      setFileError(null);
      setFile(selected);
      setPreview(selected.dataUrl);
      setResult(null);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Das Bild konnte nicht geöffnet werden.");
    }
  }

  async function generateRelief() {
    if (!file) return;
    setBusy(true); setFileError(null); setResult(null);
    try {
      const next = await window.desktop?.createRelief(file.path, {
        widthMm: 100,
        baseMm: 1.6,
        reliefMm: 4,
        resolution: 128,
        invert: false
      });
      if (next) setResult(next);
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
            <div
              className={preview ? "upload-card has-preview" : "upload-card"}
              onClick={() => void selectFile()}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => event.key === "Enter" && void selectFile()}
            >
              {preview ? (
                <><img src={preview} alt="Vorschau des ausgewählten Bildes" /><div className="file-overlay"><ImagePlus size={18} /> Bild wechseln</div></>
              ) : (
                <><div className="upload-icon"><UploadCloud size={32} /></div><h3>Bild hier ablegen</h3><p>oder zum Auswählen klicken</p><span>PNG, JPG oder WEBP · maximal 25 MB</span></>
              )}
            </div>
            <div className="workflow-row" aria-label="Verarbeitungsschritte">
              {["Bild analysieren", "3D rekonstruieren", "Mesh reparieren", "Exportieren"].map((step, index) => (
                <div className="workflow-step" key={step}><span>{index + 1}</span><p>{step}</p>{index < 3 && <ChevronRight size={15} />}</div>
              ))}
            </div>
            <div className="action-bar">
              <div><Box size={20} /><div><strong>{fileError ?? (file ? file.name : "Noch kein Bild gewählt")}</strong><span>{fileError ? "Bitte wähle eine andere Datei." : file ? `${(file.size / 1_048_576).toFixed(1)} MB · bereit zur Analyse` : "Wähle zuerst eine geeignete Aufnahme aus."}</span></div></div>
              <button className="primary-button" disabled={!file || busy} onClick={() => void generateRelief()}>{busy ? "Mesh wird erzeugt …" : "Relief erstellen"} <ChevronRight size={18} /></button>
            </div>
            {busy && <div className="progress-card"><span /><div><strong>Lokale 3D-Verarbeitung</strong><p>Höhenmodell und wasserdichtes Mesh werden berechnet …</p></div></div>}
            {result && (
              <div className="result-card">
                <div className="result-check"><CheckCircle2 /></div>
                <div><strong>Modell erfolgreich erstellt</strong><p>{result.triangleCount.toLocaleString("de-DE")} Dreiecke · {result.widthMm.toFixed(0)} × {result.heightMm.toFixed(0)} mm · STL und 3MF</p></div>
                <button className="secondary-button" onClick={() => void window.desktop?.showItemInFolder(result.stlPath)}>Im Finder zeigen</button>
              </div>
            )}
          </section>
        )}

        {view === "history" && <EmptyState icon={Clock3} title="Noch keine Modelle" text="Fertige und laufende Aufträge erscheinen später übersichtlich an dieser Stelle." />}
        {view === "settings" && <Settings />}

        <Footer version={version} openLegal={setLegalPage} />
      </main>
    </div>
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
    const next = await window.desktop?.getSettingsStatus();
    if (next) setStatus(next);
  }

  useEffect(() => { void refreshStatus(); }, []);

  return (
    <>
      <section className="settings-grid">
        <article><div className="setting-icon"><Sparkles /></div><div><h3>OpenAI-Analyse</h3><p>Optional: Erkennt das Motiv und schlägt passende Druckparameter vor.</p></div><button onClick={() => setDialog("openai")}>{status.openAiConfigured ? "Verwalten" : "Einrichten"}</button></article>
        <article><div className="setting-icon"><Layers3 /></div><div><h3>Lokale Relief-Engine</h3><p>Integriert · erzeugt wasserdichte STL- und 3MF-Dateien vollständig offline.</p></div><button onClick={() => setDialog("model")}>Details</button></article>
        <article><div className="setting-icon"><CheckCircle2 /></div><div><h3>Hardwareprofil</h3><p>Apple M3 · 16 GB · automatische CPU-/Metal-Auswahl</p></div><span className="tag">Erkannt</span></article>
      </section>
      {dialog === "openai" && <OpenAiDialog status={status} close={() => setDialog(null)} refresh={refreshStatus} />}
      {dialog === "model" && <ModelDialog close={() => setDialog(null)} refresh={refreshStatus} />}
    </>
  );
}

function OpenAiDialog({ status, close, refresh }: { status: SettingsStatus; close: () => void; refresh: () => Promise<void> }) {
  const [key, setKey] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true); setMessage(null);
    try {
      await window.desktop?.saveOpenAiKey(key);
      await refresh();
      setMessage("Der Schlüssel wurde verschlüsselt auf diesem Mac gespeichert.");
      setKey("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Der Schlüssel konnte nicht gespeichert werden.");
    } finally { setBusy(false); }
  }

  async function remove() {
    await window.desktop?.removeOpenAiKey();
    await refresh();
    setMessage("Der gespeicherte Schlüssel wurde entfernt.");
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
