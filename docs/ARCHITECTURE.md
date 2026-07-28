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
  ├── Einstellungen / safeStorage
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

Schrift wird zunächst lokal als eng zugeschnittene transparente Vorlage
gerendert und anschließend durch dieselbe Reliefpipeline verarbeitet. SVG wird
beim Import sicher gerastert, bevor die Verarbeitung beginnt.

## AMS- und 3MF-Aufbau

Die lokal erkannte Palette wird auf zwei bis acht frei definierbare
Filamentfarben abgebildet. Für AMS-Modelle reicht der einfarbige Tragkörper bis
zur vollständigen Reliefhöhe. Motivfarben werden als separate, 0,4 mm starke
und damit slicer-taugliche Deckkörper erzeugt.

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
