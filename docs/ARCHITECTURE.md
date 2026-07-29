# Architektur

## Kontext

Ein einzelnes Bild enthält keine vollständige Rückseiten- oder
Tiefeninformation. **Bild zu 3D** erzeugt deshalb heute vor allem kontrollierte
2,5D-Reliefs. Für vollständige Objekte stehen ein Mehrfoto-Scan sowie ein
konstruktiver **Prompt zu 3D**-Workflow zur Verfügung. Externe KI-Planung wird
strikt von lokaler, deterministischer Geometrieerzeugung und Prüfung getrennt.

## Komponenten

```text
React Renderer
  │ sichere, typisierte IPC-Aufrufe
Electron Main Process
  ├── Systemcheck / Hardware- und Ressourcenprüfung
  ├── Einstellungen / lokaler AES-GCM-Tresor für OpenAI
  ├── Verlauf / Updateprüfung
  ├── Dateivalidierung
  ├── OpenAI CAD-Planung (optional)
  ├── Native Apple Worker
  │     ├── Depth Anything V2 / Core ML
  │     └── RealityKit Object Capture
  └── lokale 3D-Pipelines
        ├── Relief / Kontur / Höhenkarte
        ├── Flächen- und Farbeditor
        ├── CAD-Körpergenerator
        ├── Druckbarkeitsanalyse
        └── STL / 3MF / USDZ
```

Rechenintensive Relief- und Mehrfarben-Meshes laufen in einem separaten
`worker_threads`-Worker. Fortschrittsmeldungen werden über eine begrenzte
IPC-Verbindung an den Renderer übertragen. Ein Abbruch beendet sowohl native
Tiefenprozesse als auch den aktiven Mesh-Worker, ohne den Electron-Hauptprozess
oder den aktuellen Studio-Stand zu blockieren.

Die Ressourcenanzeige fragt über eine schmale, nur lesende IPC-Methode
`app.getAppMetrics()` ab. CPU- und Working-Set-Werte aller Electron-Prozesse
werden im Hauptprozess summiert und alle 1,5 Sekunden in der Seitenleiste
aktualisiert. Es werden keine Prozessdaten gespeichert oder übertragen.

Der Renderer erhält keinen direkten Node.js-, Dateisystem- oder Shell-Zugriff.
Nur explizit freigegebene IPC-Kommandos werden im Preload-Skript veröffentlicht.
Netzwerkzugriffe erfolgen ausschließlich im Electron-Hauptprozess.

## Bild-, Schrift- und Reliefpipeline

Die Reliefpipeline nimmt ein validiertes Bild, ein Qualitätsprofil und optional
manuelle Höhen- und Farbkarten entgegen:

1. Eingabe und Abmessungen validieren
2. Motivmaske und Verarbeitungsprofil bestimmen
3. Konturen oder Tiefenwerte glätten und Höhen rekonstruieren
4. manuelle Flächen-, Höhen- und Farbkorrekturen anwenden
5. geschlossenes Reliefmesh mit Grund- und Seitenflächen erzeugen
6. Druckbarkeit, Mindestdimensionen und Volumen bewerten
7. STL und/oder materialisiertes 3MF exportieren

Bei **Logo mit Text** kann die Pixelmaske vor der Vermaschung druckgerecht
erweitert werden. Der Standardwert von 0,8 mm entspricht zwei Extrusionslinien
einer 0,4-mm-Düse. Diese Mindestbreite verändert Vorschau, STL und 3MF
gemeinsam; die Option ist in der Oberfläche vor der Berechnung abschaltbar.
Bei aktiviertem Hintergrund wird die Vorschau aus dem vollständigen
wasserdichten Höhenkörper aufgebaut, nicht nur aus dessen Deckfläche. Dadurch
sind Boden, Seiten und erhabenes Motiv in Vorschau und Export identisch.

Schrift wird zunächst lokal als eng zugeschnittene transparente Vorlage
gerendert und anschließend durch dieselbe Reliefpipeline verarbeitet. SVG wird
beim Import sicher gerastert, bevor die Verarbeitung beginnt.

## AMS- und 3MF-Aufbau

Die lokal erkannte Palette wird auf zwei bis acht frei definierbare
Filamentfarben abgebildet. Motivfarben werden als separate, 0,4 mm starke und
damit slicer-taugliche Deckkörper erzeugt. Diese Decklage liegt innerhalb der
eingestellten Gesamthöhe: Der Tragkörper endet 0,4 mm darunter und die Farbe
schließt exakt auf Sollhöhe ab.

Außenränder und Farbübergänge werden vor dem Meshaufbau der gewählten Farbe
**Seiten & Tragkörper** zugewiesen. Dadurch bleiben senkrechte Wände einfarbig.
Vorschau und 3MF verwenden dieselbe stabilisierte Farbkarte. Im 3MF sind alle
Farbkörper Komponenten eines einzigen Assembly-Objekts; der Build-Bereich
enthält deshalb genau ein gemeinsames Modell in Millimetern. STL bleibt ein
einfarbiges Fallback.

Zusätzlich zu den standardisierten Basismaterialien trägt jedes Dreieck seine
Materialreferenz explizit. `Metadata/model_settings.config` ordnet die
Farbkörper den Extrudern zu und `Metadata/project_settings.config` übergibt die
Filamentpalette an Anycubic-/Orca-basierte Slicer. Die Core-3MF-Daten bleiben
dabei die interoperable Quelle für andere Programme.

## Prompt zu 3D

OpenAI erzeugt ausschließlich einen strukturierten Plan aus erlaubten
Grundkörpern. `electron/cad.ts` validiert Bauteilzahl, Koordinaten, Gesamtgröße
und Mindestmaterialstärke und erzeugt die Binär-STL lokal. Beliebiger Modellcode
wird nicht ausgeführt und fremde Mesh-Dateien werden nicht heruntergeladen.

Der Renderer baut aus demselben Plan eine lokale Three.js-Vorschau auf. Eine
Folgeanweisung überträgt den validierten Ausgangsplan zusammen mit der neuen
Anweisung an OpenAI. Die Antwort ist stets ein vollständiger Ersatzplan, wird
erneut validiert und als neue STL gespeichert. Vorherige Pläne bleiben während
des geöffneten Dialogs für Rückgängig erhalten.

Der Workflow ist für einfache konstruktive Modelle gedacht. Organische
Text-zu-3D-Rekonstruktion ist nicht Teil der aktuellen Architektur.

## Jobzustände und Verlauf

`validating → analysing → reconstructing → repairing → exporting → completed`

Der Renderer zeigt den aktuellen Zustand. Abgeschlossene Exporte werden mit
Metadaten im lokalen Verlauf erfasst; temporäre Zwischenstände werden nicht als
fertige Modelle angeboten.

## Erweiterbarkeit

Die Studio-Werkzeuge **Bild zu 3D**, **Schrift zu 3D** und **Prompt zu 3D** sind
getrennte Einstiege mit gemeinsam genutzter Vorschau-, Parameter-, Prüf- und
Exportlogik. Neue Workflows sollen diesen Aufbau beibehalten.
Benutzerverwaltung, Telemetrie und Serverbetrieb gehören bewusst nicht zur
lokalen Desktop-Anwendung.

## Transparenz in der App

Der Hauptmenüpunkt **Über & Technik** erklärt die drei Arbeitswege, die
Verarbeitungspipeline, verwendete Frameworks und Modelle sowie Datenschutz und
fachliche Grenzen. Die Inhalte werden bewusst aus Anwendersicht formuliert,
damit lokale Verarbeitung und optionale OpenAI-Übertragung unterscheidbar
bleiben. Die vorbereitende Checkliste für eine Store-Veröffentlichung steht in
[APP_STORE_CHECKLIST.md](APP_STORE_CHECKLIST.md).
