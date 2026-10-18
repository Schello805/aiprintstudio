import { Box, CheckCircle2, Layers3, Sparkles, UploadCloud, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { SettingsStatus } from "../types/studio";

export function Settings() {
  const [dialog, setDialog] = useState<"openai" | "model" | null>(null);
  const [status, setStatus] = useState<SettingsStatus>({
    openAiConfigured: false,
    openAiStored: false,
    modelSetupAccepted: false,
    storageVersion: 0,
    depthModelAvailable: false
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
        <article><div className="setting-icon"><Sparkles /></div><div><h3>OpenAI · Prompt zu 3D</h3><p>{status.openAiConfigured ? "Der lokal verschlüsselte API-Schlüssel ist für diese Sitzung entsperrt." : status.openAiStored ? "Der API-Schlüssel ist lokal verschlüsselt und aktuell gesperrt." : "Speichert den API-Schlüssel lokal verschlüsselt – ohne macOS-Schlüsselbund."}</p></div><div className="setting-action">{status.openAiConfigured ? <span className="tag"><CheckCircle2 /> Entsperrt</span> : status.openAiStored ? <span className="tag neutral">Gesperrt</span> : <span className="tag neutral">Nicht eingerichtet</span>}<button onClick={() => setDialog("openai")}>{status.openAiStored ? "Verwalten" : "Einrichten"}</button></div></article>
        <article><div className="setting-icon"><Layers3 /></div><div><h3>Lokale Relief-Engine</h3><p>Integriert · erzeugt wasserdichte STL- und 3MF-Dateien vollständig offline.</p></div><button onClick={() => setDialog("model")}>Details</button></article>
        <article><div className="setting-icon"><Box /></div><div><h3>Tiefenerkennung für Fotos</h3><p>Erzeugt räumliche Tiefe direkt auf deinem Mac · keine Cloud.</p></div><span className={status.depthModelAvailable ? "tag" : "tag neutral"}>{status.depthModelAvailable ? "Bereit" : "Aktuelles Update nötig"}</span></article>
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
  const [installing, setInstalling] = useState(false);
  const [progressPercent, setProgressPercent] = useState<number | null>(null);

  useEffect(() => {
    if (!window.desktop?.onUpdateProgress) return;
    return window.desktop.onUpdateProgress((progress) => {
      setMessage(progress.detail);
      setProgressPercent(progress.phase === "error" ? null : progress.percent);
      if (progress.phase === "ready" || progress.phase === "error") {
        setInstalling(false);
      }
    });
  }, []);

  async function check() {
    setBusy(true); setUrl(null); setDirectDownload(false); setProgressPercent(null);
    try {
      if (!window.desktop) throw new Error("Update-Prüfung ist nur in der Desktop-App verfügbar.");
      const update = await window.desktop.checkForUpdate();
      setMessage(update.available ? `Version ${update.latestVersion} ist verfügbar und kann direkt installiert werden.` : `Version ${update.currentVersion} ist aktuell.`);
      if (update.available) { setUrl(update.url); setDirectDownload(update.directDownload); }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Update-Prüfung fehlgeschlagen.");
    } finally { setBusy(false); }
  }

  async function installDirect() {
    if (!url || !window.desktop || installing) return;
    if (!directDownload) {
      await window.desktop.openExternal(url);
      return;
    }
    setInstalling(true);
    setProgressPercent(2);
    try {
      const result = await window.desktop.installUpdate(url);
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Direktes Update fehlgeschlagen.");
      setInstalling(false);
      setProgressPercent(null);
    }
  }

  return (
    <article>
      <div className="setting-icon"><UploadCloud /></div>
      <div>
        <h3>App-Updates</h3>
        <p>{message}</p>
        {progressPercent !== null && (
          <div className="relief-progress-line" style={{ marginTop: 8 }}>
            <div className="relief-progress-track"><span style={{ width: `${Math.max(2, progressPercent)}%` }} /></div>
            <small>{Math.round(progressPercent)} %</small>
          </div>
        )}
      </div>
      <div className="setting-action">
        {url && (
          <button onClick={() => void installDirect()} disabled={installing || busy}>
            {installing
              ? `Installiert (${Math.round(progressPercent ?? 0)} %) …`
              : directDownload
                ? "Jetzt installieren & neu starten"
                : "Release öffnen"}
          </button>
        )}
        <button onClick={() => void check()} disabled={busy || installing}>{busy ? "Prüft …" : "Jetzt prüfen"}</button>
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
