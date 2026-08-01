# AI Print Studio
<img width="150" height="150" alt="Logo Print Studio" src="https://github.com/user-attachments/assets/9a3b6726-66cc-47cd-8208-f1ca2907b1d5" />


AI Print Studio ist eine lokale macOS-Anwendung für druckbare 3D-Modelle aus
Bildern, Schrift und natürlichsprachlichen Beschreibungen. Die erste
Zielplattform ist Apple Silicon (M1 oder neuer). Bilder, Zwischenstände,
CAD-Pläne und Mesh-Dateien bleiben standardmäßig auf dem eigenen Mac.

[![Quality](https://github.com/Schello805/aiprintstudio/actions/workflows/quality.yml/badge.svg)](https://github.com/Schello805/aiprintstudio/actions/workflows/quality.yml)

> Aktueller Stand: Version 0.22.0. Bild- und Schrift-Reliefs, mehrfarbige
> AMS-3MF-Dateien sowie einfache, per OpenAI geplante und lokal konstruierte
> Prompt-zu-3D-Modelle sind testbar. Die vollständige Rundum-Rekonstruktion aus
> einem einzelnen Bild bleibt eine spätere Ausbaustufe.

## Läuft AI Print Studio auf meinem Mac?

Vor dem Download bitte kurz prüfen:

| Voraussetzung | Benötigt | Hinweis |
| --- | --- | --- |
| Mac | **Apple Silicon (M1 oder neuer)** | Intel-Macs werden vom ARM64-Build nicht unterstützt. |
| Betriebssystem | **macOS 13 Ventura oder neuer** | Ein aktuelles macOS wird empfohlen. |
| Arbeitsspeicher | **8 GB empfohlen**, 16 GB für große Reliefs | Unter 8 GB startet die App mit einem Ressourcenhinweis. |
| Freier Speicher | **mindestens 4 GB** | Für Exporte und temporäre Arbeitsdateien sollte zusätzlicher Platz verfügbar sein. |
| Grafik | In Apple Silicon integriert | Keine separate Grafikkarte erforderlich. |
| Internet | Für Installation/Updates und optional Prompt zu 3D | Bild zu 3D, Schrift zu 3D und lokale Exporte funktionieren offline. |

Beim Start führt die App zusätzlich einen lokalen Systemcheck durch. Nicht
unterstützte Macs erhalten eine konkrete Fehlermeldung, bevor das Studio geladen
wird. Bei wenig RAM, wenig freiem Speicher oder fehlenden lokalen
KI-Komponenten erscheint eine Warnung mit der Wahl, trotzdem zu starten oder die
App zu beenden.

**Schnellentscheidung:** Wenn unter **Apple-Menü → Über diesen Mac** bei „Chip“
M1, M2, M3, M4 oder neuer und bei macOS mindestens Version 13 steht, ist die App
grundsätzlich kompatibel.

## Leitprinzipien

- lokale Bild-, Schrift- und Mesh-Verarbeitung
- OpenAI nur optional für den ausdrücklich gestarteten Prompt-zu-3D-Workflow
- Druckbarkeit vor künstlerischer Perfektion
- keine Benutzerkonten, Telemetrie oder Cloud-Pflicht
- lokal verschlüsselter OpenAI-Schlüssel mit eigenem App-Passwort
- STL- und mehrfarbiger 3MF-Export
- interaktive 3D-Vorschau direkt neben der Eingabe
- möglichst wenige notwendige Einstellungen und motivabhängige Automatik
- konturgetreuer Export anhand von Transparenz oder erkanntem Hintergrund
- lokaler Verlauf, Druckscore und Materialschätzung
- Live-Anzeige für App-CPU und App-RAM in der festen Seitenleiste
- speicherbare `.aips`-Projekte einschließlich Quelle, Parametern, Farben und
  manuellen Korrekturen
- automatische Reparaturvorschläge und lokale Schicht-/Materialsimulation
- automatische Meshbegrenzung für Programme mit begrenzter Meshgröße, sofern
  die Konturqualität dadurch nicht verschlechtert wird

## Studio-Workflows

### Bild zu 3D

PNG, JPG, WEBP und SVG werden zu einem wasserdichten 2,5D-Relief verarbeitet.
Für Logos und Wappen erkennt die App Motivflächen und Höhenebenen, glättet die
Konturen als echte Polygone und hält den Tragkörper geschlossen. Vorschau, STL
und 3MF werden bei **Wappen & Emblem** aus denselben vektorisierten Farbflächen
erzeugt; runde Ränder sind dadurch keine pixelweise Höhenwand mehr. Für Fotos
steht Depth Anything V2 Small lokal über Apple Core ML zur Verfügung.

Nach einer Berechnung zeigt die App eine lokale Schichtsimulation mit
Schichtzahl, Materialmenge, grober Druckzeit und Farbwechseln. Diese Angaben
sind geometriebasierte Schätzwerte; verbindlich bleibt das konkrete
Druckerprofil im Slicer. Bei erkannten Druckproblemen bietet
**Automatisch optimieren** eine Reparatur für die übliche 0,4-mm-Düse an.

Über **Projekt speichern** wird der komplette bearbeitbare Studio-Stand als
`.aips`-Datei gesichert. **Projekt öffnen** stellt Bild, Abmessungen,
Verarbeitungsmodus, AMS-Farben und manuelle Höhen-/Farbanpassungen wieder her.

### Schrift zu 3D

Bis zu sechs Textzeilen werden lokal und eng zugeschnitten gerendert. Schriftart,
Stil und Ausrichtung lassen sich festlegen; anschließend stehen dieselben
Abmessungs-, Relief- und AMS-Werkzeuge wie bei Bild zu 3D zur Verfügung.

### Foto zu Lithophan

Das Lithophan-Werkzeug übersetzt die Bildhelligkeit direkt in Materialstärke:
dunkle Bereiche werden dicker, helle Bereiche lassen mehr Licht passieren. Zur
Auswahl stehen rechteckige, abgerundete, runde, sechseckige, herz- und
wappenförmige Außenkonturen. Optional erzeugt die App einen erhöhten Rahmen,
ein mittiges Aufhängeloch und eine gleichmäßige Wölbung bis 90 Grad. Die
Lichtansicht der 3D-Vorschau erleichtert die Kontrolle vor dem Export.

### Vorschau und Diagnose

Die 3D-Vorschau kann zwischen Originalfarben, weißem oder schwarzem PLA, Gold
Silk, Lithophan-Licht, Normalen und Drahtgitter wechseln. Druckbett,
automatische Drehung und Kamera lassen sich direkt in der Vorschau steuern.
Nach der Berechnung kann das Quellbild außerdem mit der tatsächlich verwendeten
Höhenkarte verglichen werden.

### Prompt zu 3D

OpenAI wandelt eine Beschreibung in einen streng validierten, strukturierten
CAD-Bauplan aus druckbaren Körpern um. Neben Quadern, Zylindern und Dächern
stehen geschwungene, verjüngte Blattkörper für Palmen, Blätter, Federn,
Blüten und dekorative Silhouetten bereit. Die eigentliche Geometrie und die
Binär-STL erzeugt AI Print Studio lokal. Dieser Workflow eignet sich für einfache
konstruktive und stilisierte organische Objekte, nicht für fotorealistische
Meshes auf dem Niveau spezialisierter Text-zu-3D-Dienste. Meshy wird nicht verwendet.

Nach der ersten Erstellung erscheint der Bauplan als dreh- und zoombare
3D-Vorschau. Folgeanweisungen wie „Füge unten links und rechts zwei Haustüren
hinzu“ überarbeiten das vorhandene Modell. Nicht erwähnte Bauteile bleiben
erhalten, jede Revision erzeugt lokal eine neue STL und die letzte Änderung kann
im Dialog zurückgenommen werden.

Jede Erstellung und Folgeänderung nutzt den eigenen OpenAI-API-Account. Die App
zeigt während der gestreamten Antwort den geschätzten Arbeitsabschnitt und eine
laufende Kostenschätzung in Euro. Nach Abschluss wird der Betrag mit den von
OpenAI gemeldeten Token aktualisiert. Der Fortschritt ist keine exakte
Zeitprognose und der Eurobetrag verwendet einen festen USD/EUR-Schätzkurs. Die
App erhebt selbst keine zusätzlichen API-Gebühren.

Bei einem API- oder Netzwerkfehler zeigt der Dialog eine Diagnose-ID, die letzte
erreichte Phase, Laufzeit und technische Ursache. Über **Diagnose-Log im
Finder** lässt sich das lokale JSONL-Protokoll öffnen. Es enthält weder den
API-Schlüssel noch den Prompttext. Eine fehlgeschlagene Anfrage wird nicht
automatisch neu gestartet, weil eine unklare Übertragung andernfalls doppelte
API-Kosten verursachen könnte.

Vor der Erstellung kann zwischen **GPT-5.6 Sol** für maximale Qualität,
**GPT-5.6 Terra** als empfohlener Balance und **GPT-5.6 Luna** für günstige
Versuche gewählt werden. Das Dropdown zeigt die offiziellen Ein- und
Ausgabepreise sowie einen typischen Beispielbetrag auf Basis von 1.000 Eingabe-
und 2.000 Ausgabetoken. Die tatsächliche Abrechnung richtet sich nach der
Nutzung des eigenen OpenAI-Kontos.

## Bild zu 3D ausprobieren

1. Im Studio **Bild zu 3D** auswählen und ein PNG-, JPG-, WEBP- oder SVG-Bild öffnen.
2. **Auf gut Glück** verwenden oder gezielt **Logo & Wappen** beziehungsweise
   **Foto & 3D-Tiefe** wählen.
3. Für Mehrfarbdruck **AMS-Farbdruck** aktivieren und Filamentfarben festlegen.
4. **Relief erstellen** anklicken.
5. Unter der Vorschau **STL speichern** oder **3MF speichern** wählen und im
   macOS-Dialog Dateinamen sowie Speicherort festlegen.

Die App legt während der Berechnung ausschließlich temporäre Vorschaudateien
an. Erst der ausdrückliche Klick auf einen Speichern-Button erzeugt eine
dauerhafte Datei am gewählten Ort. Alte Vorschaudateien werden beim nächsten
App-Start automatisch entfernt.

Für Logos mit Text ist die Optimierung für eine **0,4-mm-Düse** automatisch
aktiv. Feine Stege werden dabei auf mindestens 0,8 mm verbreitert. Die 3MF-Datei
enthält 0,4 mm zusätzlich als Profilhinweis; die tatsächlich verwendete Düse
muss weiterhin im Slicer zum ausgewählten Drucker passen.

Ist **Hintergrund mitdrucken** aktiv, erzeugt die App einen geschlossenen,
massiven Körper: Boden und Hintergrund bilden die Grundplatte; erkannte Schrift
und Signet stehen um die eingestellte Reliefhöhe darüber. Vorschau, STL und 3MF
verwenden dieselbe Volumengeometrie.

Im Modus **Auf gut Glück** erkennt die App Logos mit deutlichem
Hintergrundverlauf selbstständig. Sie übernimmt dann die geschlossene
Grundplatte, verstärkt feine Details für die 0,4-mm-Düse und begrenzt die
Rasterauflösung so, dass der Slicer nicht durch ein unnötig großes Mesh belastet
wird. Für Sonderfälle bleiben **Wappen & Emblem** und **Logo mit Text** manuell
wählbar.

Die App wählt Qualitätsprofil und Auflösung passend zum Motiv. Die
Höhenpipeline kombiniert Normalisierung, kantenerhaltende Glättung,
Detailrückführung und profilabhängige Höhenstufen. Das Ergebnis enthält eine
Höhenkarten-Vorschau, einen Druckscore und eine Materialschätzung.
**Automatisch optimieren** behält den gewählten Modus bei und vergleicht lokal
mehrere Glättungsvarianten in reduzierter Prüfauflösung. Die beste Variante wird
anschließend in voller Qualität neu erzeugt; Bilder werden dafür nicht an einen
externen Dienst übertragen. Neben Druckscore und Meshaufwand bewertet die App
die Konturen dabei quantitativ und bevorzugt nachweislich sauberere Kandidaten.

Vor dem Speichern prüft die App die erzeugte Geometrie sowie Aufbau, Einheit,
Koordinaten und Dreieckszahl der STL- und 3MF-Datei. Beschädigte oder ungültige
Vorschaudateien werden nicht zum Download angeboten. Versionierte
Golden-Master-Motive für Wappen und Schriftlogos schützen bereits erreichte
Exportqualität vor unbeabsichtigten Regressionen.

Nach der Erstellung bleiben Original und 3D-Vorschau beim Scrollen sichtbar.
Der Druckscore steht direkt unter der Vorschau, sodass Einstellungen und
Ergebnis ohne Springen miteinander verglichen werden können.

## Mehrfarbiger AMS-Export

Der AMS-Modus reduziert das Motiv auf zwei bis acht frei definierbare
Filamentfarben. Erkannte Bildfarben können direkt den tatsächlich eingelegten
Filamenten zugeordnet werden. Der 3MF-Export enthält getrennte, benannte
Farbkörper mit Basismaterialien. Sie werden als Komponenten eines einzigen
gemeinsamen 3MF-Modells exportiert, damit Slicer wie Anycubic Slicer und Bambu
Studio sie als zusammengehöriges Mehrmaterialobjekt laden.

Für Anycubic Slicer Next und andere Orca-basierte Slicer enthält die Datei
zusätzlich die konkrete Filamentpalette und eine Extruderzuordnung je Farbkörper.
Dadurch werden nicht nur die Geometrien gruppiert, sondern auch die in der App
festgelegten AMS-Farben den Filamentplätzen 1 bis 8 zugeordnet.

Senkrechte Außenkanten, Tragkörper und Farbgrenzen erhalten einheitlich die
gewählte Farbe **Seiten & Tragkörper**. Die übrigen Farben liegen als 0,4 mm
starke und damit mindestens zwei typische 0,2-mm-Schichten umfassende
Deckkörper auf horizontalen Motivbereichen. Dadurch entstehen an den Seiten
keine gestreiften Farbkanten und Slicer erkennen keine scheinbar
dimensionslosen Teile. STL bleibt als einfarbiger Fallback erhalten.

## Verarbeitungsarten

- **Auf gut Glück** analysiert die Bildcharakteristik und schätzt den geeigneten Pfad.
- **Logo & Wappen** erzeugt klare Flächen, Konturen und diskrete Höhenebenen.
- **Foto & 3D-Tiefe** verwendet Depth Anything V2 Small lokal über Core ML.
- Nutzende wählen im Normalfall nur Verfahren, Breite, Reliefhöhe und optional
  AMS-Farben. Grundplatte, Glättung, Detail, Relief-Richtung, Mindestbreite und
  Meshbegrenzung setzt die App automatisch.

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

Offizielle Releases werden mit **Developer ID Application**, Hardened Runtime
und Apple-Notarisierung erstellt. Das Notarisierungsticket wird an das DMG
angeheftet und vor der Veröffentlichung nochmals mit Gatekeeper geprüft.
Dadurch erscheint bei korrekt erzeugten Releases nicht mehr die Meldung, Apple
könne die App nicht auf Schadsoftware überprüfen. Ein Release ohne gültige
Apple-Zugangsdaten wird von der Build-Pipeline abgebrochen.

Ältere, nicht notarisierte Releases können weiterhin von Gatekeeper blockiert
werden. Keine Sicherheitswarnung umgehen, wenn das DMG nicht aus dem offiziellen
Repository stammt.

## Technischer Aufbau

| Bereich | Technologie | Zweck |
| --- | --- | --- |
| Desktop | Electron | macOS-Fenster, Dateisystem und sichere IPC-Brücke |
| Oberfläche | React, TypeScript, Vite | Studio, Vorschau und Einstellungen |
| 3D-Vorschau | Three.js, React Three Fiber | interaktive Mesh- und Farbvorschau |
| Bildpipeline | Sharp, TypeScript | Masken, Höhenkarten, Farben und Meshaufbau |
| Vektorkonturen | d3-contour, Three.js Earcut | Marching Squares, geglättete Polygone und solide Extrusionen |
| Native Worker | Swift, Core ML, MLX | lokale Tiefe und optionale komplexe Formrekonstruktion |
| CAD-Pipeline | OpenAI Structured Outputs, lokaler TypeScript-Generator | validierter Plan und Binär-STL |
| Konfiguration | scrypt, AES-256-GCM, lokale JSON-Datei | verschlüsselter API-Schlüssel ohne macOS-Schlüsselbund |
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

Das Ergebnis liegt unter `release/`. Lokal erzeugte Builds ohne
Developer-ID-Zertifikat werden nur für Tests ad hoc signiert und sind nicht zur
Weitergabe bestimmt.

## OpenAI-Konfiguration

OpenAI ist optional und wird ausschließlich für **Prompt zu 3D** benötigt. Der
Schlüssel wird mit einem selbst gewählten AI-Print-Studio-Passwort über `scrypt`
und AES-256-GCM lokal verschlüsselt. Weder das Mac-Passwort noch der
macOS-Schlüsselbund werden verwendet. Das App-Passwort wird nicht gespeichert
und muss nach einem Neustart zum Entsperren erneut eingegeben werden. OpenAI
erstellt einen strukturierten CAD-Bauplan; Geometrie und STL entstehen
anschließend lokal.

Der Schlüssel gehört niemals in Git, eine Frontend-Datei oder ein
Release-Artefakt. Bei verlorenem App-Passwort ist keine Wiederherstellung
möglich; der verschlüsselte Eintrag muss gelöscht und neu angelegt werden.
Bild-, Schrift-, Relief-, Tiefen- und AMS-Workflows benötigen keinen
OpenAI-Schlüssel.

## Veröffentlichung und Versionierung

Release-Tags verwenden das Format `vMAJOR.MINOR.PATCH`. Der Release-Workflow
überträgt die Tag-Version vor dem Build in das App-Paket und veröffentlicht ein
ARM64-DMG im zugehörigen GitHub Release.

Projekt-Repository: <https://github.com/Schello805/aiprintstudio>

Die App enthält unter **Über & Technik** eine verständliche Übersicht über
Arbeitswege, Verarbeitung, Frameworks, lokale KI-Modelle, Datenschutz und
technische Grenzen. Für eine spätere kommerzielle Veröffentlichung enthält
[docs/APP_STORE_CHECKLIST.md](docs/APP_STORE_CHECKLIST.md) die noch offenen
rechtlichen und technischen Punkte. Insbesondere sind das aktuelle
Impressums-Platzhalterfeld und der bestehende DMG-Build noch nicht für eine
Mac-App-Store-Veröffentlichung freigegeben.

## Datenschutz und Sicherheit

Lokale Workflows übertragen keine Nutzbilder an OpenAI. Nur ein ausdrücklich
gestarteter Prompt-zu-3D-Auftrag sendet den eingegebenen Text an OpenAI. Bei
Folgeanweisungen wird zusätzlich der aktuelle strukturierte CAD-Bauplan
übertragen, damit OpenAI das bestehende Modell gezielt überarbeiten kann.
Vorschau, Geometrie und STL entstehen lokal. Details stehen in
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
