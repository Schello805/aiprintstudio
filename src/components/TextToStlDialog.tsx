import { ChevronRight, Type, X } from "lucide-react";
import { useState } from "react";

export function TextToStlDialog({
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
