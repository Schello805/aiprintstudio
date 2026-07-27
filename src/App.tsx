import { useEffect, useRef, useState } from "react";
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
import { validateImageFile } from "./domain/image-validation";

type View = "studio" | "history" | "settings";
type LegalPage = "imprint" | "privacy" | "cookies" | null;

const navigation = [
  { id: "studio" as const, label: "Studio", icon: Sparkles },
  { id: "history" as const, label: "Verlauf", icon: History },
  { id: "settings" as const, label: "Einstellungen", icon: Settings2 }
];

export function App() {
  const [view, setView] = useState<View>("studio");
  const [legalPage, setLegalPage] = useState<LegalPage>(null);
  const [version, setVersion] = useState("0.1.0");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void window.desktop?.getVersion().then(setVersion);
  }, []);

  function selectFile(nextFile?: File) {
    if (!nextFile) return;
    const validation = validateImageFile(nextFile);
    if (!validation.valid) {
      setFileError(validation.message);
      return;
    }
    setFileError(null);
    if (preview) URL.revokeObjectURL(preview);
    setFile(nextFile);
    setPreview(URL.createObjectURL(nextFile));
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
          <div><strong>Lokale Engine</strong><span>Bereit für Einrichtung</span></div>
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
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => { event.preventDefault(); selectFile(event.dataTransfer.files[0]); }}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => event.key === "Enter" && inputRef.current?.click()}
            >
              <input ref={inputRef} type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" hidden onChange={(event) => selectFile(event.target.files?.[0])} />
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
              <button className="primary-button" disabled={!file}>Modell erstellen <ChevronRight size={18} /></button>
            </div>
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
};

function Settings() {
  const [dialog, setDialog] = useState<"openai" | "model" | null>(null);
  const [status, setStatus] = useState<SettingsStatus>({
    openAiConfigured: false,
    modelSetupAccepted: false,
    encryptionAvailable: true
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
        <article><div className="setting-icon"><Layers3 /></div><div><h3>Lokales 3D-Modell</h3><p>TripoSR wird lokal eingerichtet und anschließend ohne 3D-API ausgeführt.</p></div><button onClick={() => setDialog("model")}>{status.modelSetupAccepted ? "Fortsetzen" : "Installieren"}</button></article>
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

function ModelDialog({ close, refresh }: { close: () => void; refresh: () => Promise<void> }) {
  const [accepted, setAccepted] = useState(false);
  const [prepared, setPrepared] = useState(false);

  async function prepare() {
    await window.desktop?.acceptModelSetup();
    await refresh();
    setPrepared(true);
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="model-title">
        <button className="modal-close" onClick={close} aria-label="Dialog schließen"><X /></button>
        <div className="modal-icon"><Layers3 /></div>
        <p className="eyebrow">LOKALE 3D-ENGINE</p>
        <h2 id="model-title">TripoSR einrichten</h2>
        <p>Das Modell rekonstruiert die Geometrie lokal. Es ist MIT-lizenziert; Bilder verlassen deinen Mac nicht. Für deinen M3 mit 16 GB verwendet die App ein speichersparendes Profil.</p>
        <div className="install-summary">
          <span><strong>Modell</strong> TripoSR</span>
          <span><strong>Speicher</strong> ca. 1–2 GB</span>
          <span><strong>Backend</strong> automatisch CPU / Metal</span>
        </div>
        {!prepared ? (
          <label className="consent"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /><span>Ich akzeptiere den lokalen Modelldownload und die MIT-Lizenz von TripoSR.</span></label>
        ) : (
          <div className="notice">Einrichtung vorbereitet. Der eigentliche Modelldownload wird mit der 3D-Worker-Integration im nächsten Entwicklungsstand aktiviert.</div>
        )}
        <div className="modal-actions">
          <button className="secondary-button" onClick={close}>{prepared ? "Schließen" : "Abbrechen"}</button>
          {!prepared && <button className="primary-button" onClick={() => void prepare()} disabled={!accepted}>Einrichtung vorbereiten</button>}
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
