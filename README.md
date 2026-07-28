# AI Print Studio

AI Print Studio ist eine lokale macOS-Anwendung für druckbare 3D-Modelle aus
Bildern, Schrift und natürlichsprachlichen Beschreibungen. Die erste
Zielplattform ist Apple Silicon (M1 oder neuer). Bilder, Zwischenstände,
CAD-Pläne und Mesh-Dateien bleiben standardmäßig auf dem eigenen Mac.

[![Quality](https://github.com/Schello805/aiprintstudio/actions/workflows/quality.yml/badge.svg)](https://github.com/Schello805/aiprintstudio/actions/workflows/quality.yml)

> Aktueller Stand: Version 0.12.4. Bild- und Schrift-Reliefs, mehrfarbige
> AMS-3MF-Dateien sowie einfache, per OpenAI geplante und lokal konstruierte
> Prompt-zu-3D-Modelle sind testbar. Die vollständige Rundum-Rekonstruktion aus
> einem einzelnen Bild bleibt eine spätere Ausbaustufe.

## Leitprinzipien

- lokale Bild-, Schrift- und Mesh-Verarbeitung
- OpenAI nur optional für den ausdrücklich gestarteten Prompt-zu-3D-Workflow
- Druckbarkeit vor künstlerischer Perfektion
- keine Benutzerkonten, Telemetrie oder Cloud-Pflicht
- verschlüsselte Ablage des OpenAI-Schlüssels über macOS
- STL-, 3MF- und bei Mehrfoto-Scans USDZ-Export
- interaktive 3D-Vorschau direkt neben der Eingabe
- möglichst wenige notwendige Einstellungen und motivabhängige Automatik
- konturgetreuer Export anhand von Transparenz oder erkanntem Hintergrund
- lokaler Verlauf, Druckscore und Materialschätzung

## Studio-Workflows

### Bild zu 3D

PNG, JPG, WEBP und SVG werden zu einem wasserdichten 2,5D-Relief verarbeitet.
Für Logos und Wappen erkennt die App Motivflächen und Höhenebenen, glättet die
Außenkontur und hält den Tragkörper geschlossen. Für Fotos steht Depth Anything
V2 Small lokal über Apple Core ML zur Verfügung.

Der Flächeneditor erlaubt Mehrfachauswahl, angrenzendes Erweitern oder
Reduzieren, Auswahl ähnlicher Farben, Höhenkorrekturen, Glättung,
Kantenabrundung und manuelle AMS-Farbzuweisung. Änderungen erscheinen in der
Live-3D-Vorschau und werden beim nächsten Export übernommen.

### Schrift zu 3D

Bis zu sechs Textzeilen werden lokal und eng zugeschnitten gerendert. Schriftart,
Stil und Ausrichtung lassen sich festlegen; anschließend stehen dieselben
Abmessungs-, Relief- und AMS-Werkzeuge wie bei Bild zu 3D zur Verfügung.

### Prompt zu 3D

OpenAI wandelt eine Beschreibung in einen streng validierten, strukturierten
CAD-Bauplan aus einfachen Körpern um. Die eigentliche Geometrie und die
Binär-STL erzeugt AI Print Studio lokal. Dieser Workflow eignet sich für einfache
konstruktive Objekte, nicht für organische Meshes auf dem Niveau spezialisierter
Text-zu-3D-Dienste. Meshy wird nicht verwendet.

### Mehrfoto-Scan

Apple RealityKit Object Capture verarbeitet 12 bis 300 überlappende Fotos lokal
zu einem vollständigen USDZ-Modell. Dieser Modus benötigt geeignete
Aufnahmereihen und unterstützte Apple-Hardware.

## Bild zu 3D ausprobieren

1. Im Studio **Bild zu 3D** auswählen und ein PNG-, JPG-, WEBP- oder SVG-Bild öffnen.
2. Automatik verwenden oder gezielt **Logo & Wappen** beziehungsweise
   **Foto & 3D-Tiefe** wählen.
3. Optional **Motivbereiche manuell korrigieren** öffnen und Flächen bearbeiten.
4. Für Mehrfarbdruck **AMS-Farbdruck** aktivieren und Filamentfarben festlegen.
5. **Relief erstellen** anklicken.
6. STL oder 3MF unter `Downloads/AI Print Studio` im Slicer öffnen.

Die App wählt Qualitätsprofil und Auflösung passend zum Motiv. Die
Höhenpipeline kombiniert Normalisierung, kantenerhaltende Glättung,
Detailrückführung und profilabhängige Höhenstufen. Das Ergebnis enthält eine
Höhenkarten-Vorschau, einen Druckscore und eine Materialschätzung.

## Mehrfarbiger AMS-Export

Der AMS-Modus reduziert das Motiv auf zwei bis acht frei definierbare
Filamentfarben. Erkannte Bildfarben können direkt den tatsächlich eingelegten
Filamenten zugeordnet werden. Der 3MF-Export enthält getrennte, benannte Körper
mit Basismaterialien für Bambu Studio.

Senkrechte Außenkanten, Tragkörper und Farbgrenzen erhalten einheitlich die
gewählte Farbe **Seiten & Tragkörper**. Die übrigen Farben liegen als 0,04 mm
dünne Deckflächen auf horizontalen Motivbereichen. Dadurch entstehen an den
Seiten keine gestreiften Farbkanten. STL bleibt als einfarbiger Fallback erhalten.

## Verarbeitungsarten

- **Automatisch** analysiert die Bildcharakteristik und wählt den geeigneten Pfad.
- **Logo & Wappen** erzeugt klare Flächen, Konturen und diskrete Höhenebenen.
- **Foto & 3D-Tiefe** verwendet Depth Anything V2 Small lokal über Core ML.
- Unter den erweiterten Einstellungen stehen direkte Höhenkarte und
  Relief-Richtung für Spezialfälle zur Verfügung.

## Updates und Installation

Das aktuelle ARM64-DMG steht unter
[GitHub Releases](https://github.com/Schello805/aiprintstudio/releases) bereit.
Nach dem Öffnen des DMG wird **AI Print Studio.app** auf den dort angezeigten
Ordner **Applications** gezogen.

Unter **Einstellungen → App-Updates** kann die App nach einer neuen
GitHub-Version suchen. Bei einem verfügbaren Update öffnet
**DMG herunterladen** den direkten Download im Browser. Anschließend muss die
App aus dem DMG auf **Applications** gezogen werden. Eine automatische
Hintergrundinstallation gibt es derzeit nicht.

Nicht notarisierte Builds können von Gatekeeper zunächst blockiert werden. In
diesem Fall die App unter **Systemeinstellungen → Datenschutz & Sicherheit**
einmalig freigeben. Keine Sicherheitswarnung umgehen, wenn das DMG nicht aus dem
offiziellen Repository stammt.

## Technischer Aufbau

| Bereich | Technologie | Zweck |
| --- | --- | --- |
| Desktop | Electron | macOS-Fenster, Dateisystem und sichere IPC-Brücke |
| Oberfläche | React, TypeScript, Vite | Studio, Editor und Einstellungen |
| 3D-Vorschau | Three.js, React Three Fiber | interaktive Mesh- und Farbvorschau |
| Bildpipeline | Sharp, TypeScript | Masken, Höhenkarten, Farben und Meshaufbau |
| Native Worker | Swift, Core ML, RealityKit | lokale Tiefe und Mehrfoto-Rekonstruktion |
| CAD-Pipeline | OpenAI Structured Outputs, lokaler TypeScript-Generator | validierter Plan und Binär-STL |
| Konfiguration | Electron `safeStorage`, lokale JSON-Datei | verschlüsselte Geheimnisse und Einstellungen |
| Releases | Git-Tags, GitHub Actions | ARM64-DMG und App-Version |

Weitere Details: [Architektur](docs/ARCHITECTURE.md),
[Entwicklung](docs/DEVELOPMENT.md) und [Roadmap](docs/ROADMAP.md).

## Lokale Entwicklung

Voraussetzungen:

- macOS auf Apple Silicon
- Node.js 22 oder neuer
- npm 10 oder neuer
- Xcode Command Line Tools für die nativen Swift-Worker

```bash
npm install
npm run dev
```

Produktionsbuild und alle Prüfungen:

```bash
npm run verify
```

Lokales ARM64-DMG:

```bash
npm run dist
```

Die reale Desktop-Brücke der gepackten App kann anschließend geprüft werden:

```bash
AI_PRINT_STUDIO_SETTINGS_ROOT=/tmp/ai-print-studio-smoke \
  "release/mac-arm64/AI Print Studio.app/Contents/MacOS/AI Print Studio" --smoke-test
```

Das Ergebnis liegt unter `release/`. Lokal erzeugte Builds sind nicht
automatisch signiert und notarisiert.

## OpenAI-Konfiguration

OpenAI ist optional und wird ausschließlich für **Prompt zu 3D** benötigt. Der
Schlüssel wird in der App über die Einstellungen erfasst und mit Electron
`safeStorage` unter Verwendung der macOS-Systemverschlüsselung geschützt.
OpenAI erstellt einen strukturierten CAD-Bauplan; Geometrie und STL entstehen
anschließend lokal.

Der Schlüssel gehört niemals in Git, eine Frontend-Datei oder ein
Release-Artefakt. Bild-, Schrift-, Relief-, Tiefen- und AMS-Workflows benötigen
keinen OpenAI-Schlüssel.

## Veröffentlichung und Versionierung

Release-Tags verwenden das Format `vMAJOR.MINOR.PATCH`. Der Release-Workflow
überträgt die Tag-Version vor dem Build in das App-Paket und veröffentlicht ein
ARM64-DMG im zugehörigen GitHub Release.

Projekt-Repository: <https://github.com/Schello805/aiprintstudio>

## Datenschutz und Sicherheit

Lokale Workflows übertragen keine Nutzbilder an OpenAI. Nur ein ausdrücklich
gestarteter Prompt-zu-3D-Auftrag sendet den eingegebenen Text an OpenAI.
CAD-Bauplan und STL bleiben lokal. Details stehen in
[SECURITY.md](SECURITY.md).

Die Druckbarkeitsanalyse ist eine technische Hilfestellung, keine Garantie für
mechanische Belastbarkeit. Sicherheitskritische Bauteile müssen fachlich
geprüft werden.

## Lizenz

Copyright © Michael Schellenberger.

Der Quellcode ist unter der
[PolyForm Noncommercial License 1.0.0](LICENSE.md) für private und andere
nichtkommerzielle Zwecke verfügbar. Kommerzielle Nutzung ist nicht gestattet.
Das Projekt ist daher **source-available**, nicht Open Source im strengen
OSI-Sinn.

Abhängige Modelle und Bibliotheken besitzen eigene Lizenzen.
