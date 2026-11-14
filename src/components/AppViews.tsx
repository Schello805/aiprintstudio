import { CheckCircle2, ChevronRight, Clock3, Github, ImagePlus, Info, Layers3, Palette, ShieldCheck, Sparkles, Type } from "lucide-react";
import type { HistoryEntry, LegalPage } from "../types/studio";

export function InfoView({ version }: { version: string }) {
  const technologies = [
    ["Desktop-App", "Electron", "Fenster, sichere IPC-Brücke, Dateien und lokale Prozesse", "MIT"],
    ["Oberfläche", "React · TypeScript · Vite", "Studio, Vorschau und Zustandsverwaltung", "MIT · Apache-2.0"],
    ["3D-Vorschau", "Three.js · React Three Fiber · Drei", "Dreh- und zoombare Mesh-Vorschau", "MIT"],
    ["Bildverarbeitung", "Sharp", "Rasterung, Masken, Höhenkarten und Farbanalyse", "Apache-2.0"],
    ["Vektorkonturen", "d3-contour · Manifold · Three.js Earcut", "Geglättete Konturen und robust vereinigte Wappen-Volumen", "ISC · Apache-2.0 · MIT"],
    ["SVG-Logo/Text", "Three.js SVGLoader · Manifold", "Füllpfade werden extrudiert und zu einem geschlossenen Volumen vereinigt; bei ungeeigneten Pfaden greift die Rasteranalyse", "MIT · Apache-2.0"],
    ["Lokale Foto-Tiefe", "Depth Anything V2 Small · Core ML", "Mitgelieferte Tiefenschätzung auf Apple Silicon ab macOS 14", "Modell: Apache-2.0"],
    ["Prompt zu 3D", "OpenAI Responses API", "Validierter CAD-Bauplan; Vorschau und Mesh entstehen lokal", "optional, nutzungsabhängige API-Kosten"],
    ["Datenprüfung", "Zod · @xmldom/xmldom", "Einstellungen, Projekte und 3MF-Struktur prüfen", "MIT"],
    ["3MF-Verpackung", "JSZip", "Mehrfarbige 3MF-Archive und Slicer-Metadaten", "MIT oder GPL-3.0+"]
  ];
  return (
    <section className="info-view">
      <div className="info-hero">
        <div className="info-hero-icon"><Info /></div>
        <div><p className="eyebrow">AI PRINT STUDIO · VERSION {version}</p><h2>So entsteht dein 3D-Modell</h2><p>Bild-, Schrift- und Lithophanmodelle entstehen lokal auf deinem Mac. Für „Prompt zu 3D“ kannst du OpenAI mit deinem eigenen API-Schlüssel nutzen; dabei entstehen API-Kosten.</p></div>
      </div>

      <div className="info-section">
        <div className="info-heading"><span>01</span><div><h3>Die vier Arbeitswege</h3><p>Welcher Teil lokal läuft und wann ein externer Dienst beteiligt ist.</p></div></div>
        <div className="info-flow-grid">
          <article><ImagePlus /><h4>Bild zu 3D</h4><p>Wappen nutzen Konturen und feste Höhenstufen. Fotos nutzen Helligkeit oder lokale KI-Tiefe. „Logo mit Text“ wertet SVG-Füllpfade aus und vektorisiert Rasterbilder, soweit das Motiv dafür geeignet ist.</p><strong>Vollständig lokal</strong></article>
          <article><Type /><h4>Schrift zu 3D</h4><p>Die Schrift wird lokal gerendert, konturiert, extrudiert und durch dieselbe Druckbarkeits- und Exportpipeline geführt.</p><strong>Vollständig lokal</strong></article>
          <article><ImagePlus /><h4>Foto zu Lithophan</h4><p>Bildhelligkeit wird in Materialstärke übersetzt. Außenform, Rahmen, Aufhängeloch und Wölbung entstehen gemeinsam mit dem wasserdichten Mesh.</p><strong>Vollständig lokal</strong></article>
          <article><Sparkles /><h4>Prompt zu 3D</h4><p>Nur Beschreibung und bei Änderungen der aktuelle CAD-Bauplan gehen an OpenAI. Die Antwort wird streng validiert; STL und Vorschau erzeugt die App lokal.</p><strong>OpenAI optional</strong></article>
        </div>
      </div>

      <div className="info-section">
        <div className="info-heading"><span>02</span><div><h3>Verarbeitungspipeline</h3><p>So verarbeitet die App Bilder und Schrift. Prompt-Modelle entstehen separat aus einem validierten CAD-Bauplan.</p></div></div>
        <ol className="pipeline-list">
          <li><span>1</span><div><strong>Eingabe prüfen</strong><p>Format, Größe, Pixelabmessungen und Transparenz werden validiert.</p></div></li>
          <li><span>2</span><div><strong>Motiv verstehen</strong><p>Konturen, Flächen, Helligkeit oder Tiefe werden passend zum Werkzeug analysiert. Bei SVG werden vorhandene Pfade direkt gelesen.</p></div></li>
          <li><span>3</span><div><strong>Geometrie aufbauen</strong><p>Die App erzeugt Höhen, Grundplatte, Außenform, optionale Aussparungen und geschlossene Seitenflächen.</p></div></li>
          <li><span>4</span><div><strong>Geometrie und Druckbarkeit prüfen</strong><p>Geschlossene Flächen und gültige Dreiecke werden geprüft. Je nach Werkzeug bewertet die App unter anderem Grundstärke, Zusammenhalt und feine Details. Volumen und Druckdauer sind Schätzwerte.</p></div></li>
          <li><span>5</span><div><strong>Exportieren</strong><p>STL enthält Geometrie ohne Farben. Mehrfarbige Reliefs erhalten im 3MF die eingestellte Palette und Materialzuordnung. Filamente und Druckprofil prüfst du anschließend im Slicer.</p></div></li>
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
            <li><CheckCircle2 /> Automatische Wiederherstellung und Diagnose-Logs ausschließlich lokal</li>
            <li><CheckCircle2 /> Bilder, Meshes, Höhenkarten und Exporte bleiben lokal</li>
            <li><CheckCircle2 /> OpenAI nur nach bewusst gestarteter Prompt-zu-3D-Aktion</li>
            <li><CheckCircle2 /> Das Foto-Tiefenmodell ist enthalten; beim Arbeiten wird kein KI-Modell nachgeladen</li>
            <li><Info /> Neue API-Schlüssel werden ohne App-Passwort unverschlüsselt in den lokalen Einstellungen gespeichert</li>
            <li><Info /> Die Updateprüfung verbindet sich mit GitHub; Modelldateien werden dabei nicht übertragen</li>
          </ul>
        </div>
        <div>
          <div className="info-heading"><span>05</span><div><h3>Grenzen</h3><p>Was die Ergebnisse beeinflusst.</p></div></div>
          <ul className="info-checklist neutral">
            <li><Info /> Ein einzelnes Bild liefert keine echte Rückseiteninformation</li>
            <li><Info /> PNG/JPG-Logo-Schrift wird lokal vektorisiert; echte SVG-Dateien liefern weiterhin die saubersten Pfade</li>
            <li><Info /> Reliefs sind kontrollierte 2,5D-Modelle, keine vollständigen Scans</li>
            <li><Info /> Prompt-Modelle bestehen aus validierten Grundkörpern und ersetzen keine Hersteller-CAD-Dateien</li>
            <li><Info /> Geschlossene Geometrie legt die Fülldichte nicht fest: Infill, Deckschichten und Druckprofil stellt der Slicer ein</li>
            <li><Info /> 3MF-Farben und Filamentplätze hängen auch vom verwendeten Slicer und Druckerprofil ab</li>
            <li><Info /> Die Updateprüfung berücksichtigt veröffentlichte GitHub-Releases; Quellcode-Pushes und Entwürfe sind keine App-Updates</li>
            <li><Info /> Vor dem Druck sollte jedes Modell im Slicer kontrolliert werden</li>
          </ul>
        </div>
      </div>

      <div className="info-legal-note">
        <ShieldCheck /><div><strong>Lizenzen und rechtliche Hinweise</strong><p>Der App-Quellcode steht unter PolyForm Noncommercial 1.0.0 für nichtkommerzielle Nutzung zur Verfügung. Die verwendeten Bibliotheken und das Tiefenmodell behalten ihre eigenen Lizenzen. Produktnamen beschreiben die verwendete Technik; eine Partnerschaft wird nicht behauptet. Rechte an fremden Bildern, Designs und Marken musst du selbst prüfen.</p></div>
      </div>
    </section>
  );
}

export function StudioHub({
  openImage,
  openText,
  openLithophane,
  openPrompt
}: {
  openImage: () => void;
  openText: () => void;
  openLithophane: () => void;
  openPrompt: () => void;
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
      id: "lithophane",
      icon: ImagePlus,
      eyebrow: "LOKAL · LICHTBILD",
      title: "Foto zu Lithophan",
      description: "Fotos als durchscheinendes Relief für Fenster, LED-Licht oder Lampen drucken.",
      detail: "Materialstärke, Rahmen, Wölbung",
      action: openLithophane
    },
    {
      id: "prompt",
      icon: Sparkles,
      eyebrow: "KI · BETA",
      title: "Prompt zu 3D",
      description: "Experimentelle Vorschau: Eine Idee beschreiben und als räumliches Modell erzeugen.",
      detail: "Beta · Ergebnisse können vereinfacht sein",
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
            <h3>{title}{id === "prompt" && <span className="beta-badge">BETA</span>}</h3>
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
      </div>
    </section>
  );
}

export function HistoryView({ entries, clear }: { entries: HistoryEntry[]; clear: () => void }) {
  return (
    <section className="history-view">
      <div className="section-heading"><div><p className="eyebrow">LOKAL GESPEICHERT</p><h2>Deine letzten Modelle</h2></div><button className="secondary-button" onClick={clear}>Verlauf leeren</button></div>
      <div className="history-list">
        {entries.map((entry) => (
          <article key={entry.id}>
            <div className="history-icon"><Layers3 /></div>
            <div><strong>{entry.name}</strong><span>{new Date(entry.createdAt).toLocaleString("de-DE")} · {entry.profile} · {entry.triangleCount.toLocaleString("de-DE")} Dreiecke</span></div>
            <span className={`score score-${entry.score >= 80 ? "good" : "warn"}`}>{entry.score}/100</span>
          </article>
        ))}
      </div>
    </section>
  );
}

export function EmptyState({ icon: Icon, title, text }: { icon: typeof Clock3; title: string; text: string }) {
  return <section className="empty-state"><div><Icon size={30} /></div><h2>{title}</h2><p>{text}</p></section>;
}

export function Footer({ version, openLegal }: { version: string; openLegal: (page: LegalPage) => void }) {
  return (
    <footer>
      <p>Quellcode für nichtkommerzielle Nutzung · Michael Schellenberger</p>
      <div className="footer-links">
        <span className="footer-cost"><strong>0,00 €</strong> lokal · keine API-Kosten</span>
        <button onClick={() => openLegal("imprint")}>Impressum</button>
        <button onClick={() => openLegal("privacy")}>Datenschutz</button>
        <button onClick={() => openLegal("cookies")}>Cookiehinweise</button>
        <button onClick={() => window.desktop?.openExternal("https://github.com/Schello805/aiprintstudio")}><Github size={15} /> GitHub</button>
        <span>Rev. {version}</span>
      </div>
    </footer>
  );
}

export function LegalView({ page, onClose, version }: { page: Exclude<LegalPage, null>; onClose: () => void; version: string }) {
  const content = {
    imprint: { title: "Impressum", body: "Die für eine öffentliche Veröffentlichung erforderlichen Anbieter- und Kontaktdaten werden vor dem ersten Release in der App-Konfiguration hinterlegt." },
    privacy: { title: "Datenschutz", body: "Bilder und 3D-Modelle werden grundsätzlich lokal auf diesem Mac verarbeitet. Bei Prompt zu 3D werden nur nach einer bewusst gestarteten Aktion die eingegebene Beschreibung und bei Folgeänderungen der aktuelle CAD-Bauplan an OpenAI übertragen. Vorschau, Geometrie und STL entstehen anschließend lokal. Die App lädt keine externen 3D-Modellgewichte nach." },
    cookies: { title: "Cookiehinweise", body: "Diese Desktop-App verwendet keine Cookies und keine browserbasierte Nachverfolgung. Lokale Einstellungen werden ausschließlich auf dem Gerät gespeichert." }
  }[page];
  return (
    <div className="legal-shell">
      <button className="back-button" onClick={onClose}>← Zurück zum Studio</button>
      <article><p className="eyebrow">AI PRINT STUDIO · REV. {version}</p><h1>{content.title}</h1><p>{content.body}</p><h2>Hinweis</h2><p>Diese Informationen werden vor einer öffentlichen Veröffentlichung rechtlich geprüft und vervollständigt.</p></article>
    </div>
  );
}
