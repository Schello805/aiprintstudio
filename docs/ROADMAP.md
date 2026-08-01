# Roadmap

## Aktueller Stand 0.30.0

- Bild zu 3D mit Kontur-, Höhenkarten- und lokaler KI-Tiefe
- Schrift zu 3D mit gemeinsamem Relief- und AMS-Workflow
- eigener Lithophan-Workflow mit Außenformen, Rahmen, Aufhängeloch, Wölbung
  und beleuchteter Materialvorschau
- Vorschau-Diagnose mit PLA-Materialien, Normalen, Drahtgitter, Druckbett,
  Kamerasteuerung sowie Original-/Höhenkartenvergleich
- Prompt zu 3D über OpenAI Structured Outputs, iterative Folgeanweisungen,
  lokale 3D-Vorschau, CAD-/STL-Erzeugung sowie gestreamte Phasen- und
  API-Kostenanzeige; Modellwahl zwischen Sol, Terra und Luna
- datensparsame Prompt-zu-3D-Diagnose mit letzter Phase, Systemursache und
  lokalem Log
- mehrfarbiger 3MF-Export als slicer-kompatibles Assembly mit einheitlichen
  Seiten- und Übergangskanten
- polygonbasierte Wappen- und Farbkonturen für identisch glatte Vorschau-,
  STL- und 3MF-Geometrie ohne pixelweise Außenwände
- SVG-Import, Druckscore, Verlauf und Updateprüfung
- `.aips`-Projektdateien mit eingebetteter Quelle und Bearbeitungsstand
- automatische Druckreparatur für 0,4-mm-Düsen
- lokale Variantenprüfung für Konturglättung ohne Wechsel des gewählten Modus
- lokale Schicht-, Zeit- und Materialschätzung
- bedarfsgesteuerte Reduzierung auf höchstens 250.000 Dreiecke
- Golden-Master-Tests für Wappen und Schriftlogos mit reproduzierbaren
  STL-Prüfsummen
- Geometrie- und Dateiprüfung vor Vorschau und Speichern; ungültige STL-/3MF-
  Dateien werden nicht angeboten
- messbare Konturqualität als zusätzliches Kriterium der lokalen
  Variantenoptimierung
- eigenständiges Mesh-Qualitätsmodul statt vermischter Prüfungen in der
  Relief-Erzeugung
- automatischer lokaler Wiederherstellungsstand für Quelle, Werkzeug,
  Abmessungen, Modus und Farben
- datensparsame lokale Relief-Diagnose mit Diagnose-ID und direkt erreichbarem
  Logordner
- Release-Smoke-Test für Bundle-Version, arm64-Binary, Signatur,
  Electron-Laufzeit und mitgelieferte Core-ML-Ressourcen
- automatische Komplexitätsbegrenzung und harte Speichersperre bei mehr als
  250.000 Dreiecken oder 25 MB pro STL-/3MF-Datei
- getrennte Mindestbreitenbehandlung: Schrift wird druckgerecht verstärkt,
  Wappenkonturen werden nicht mehr zu einem Brim erweitert
- loch-erhaltende Mindestbreitenkorrektur für Wortmarken sowie motivbasierte
  Farbmessung ohne weißen Bildhintergrund
- frei umschaltbarer schwarzer oder weißer Hintergrund in der 3D-Vorschau
- semantisch erhabene, schwarz umrandete Wappenmotive auch bei kleinen
  Antialias-Unterbrechungen der Kontur
- dauerhaft zweispaltiger Upload-/Vorschaubereich mit integriertem
  Ladefortschritt und Abbruch in der rechten Vorschau

## Verbindliche Qualitäts-To-dos

- [ ] Wappen-, Schrift-, Foto-/Tiefen- und Prompt-Pipeline technisch stärker
  trennen und mit eigenen Ein-/Ausgabeverträgen absichern
- [ ] Release-Gate zusätzlich um stichprobenartige externe Slicer-Imports der
  Golden-Master-Dateien erweitern; der gepackte App-Smoke-Test ist umgesetzt
- [ ] optionale, ausdrücklich zustimmungspflichtige Übermittlung von
  Absturzberichten ergänzen; die verständliche lokale Diagnose ist umgesetzt
- [ ] Berechnungen nach einem Neustart an einem Zwischenschritt fortsetzen; der
  vollständige Studio-Eingabestand wird bereits automatisch wiederhergestellt
- [ ] Developer-ID-Signatur und Apple-Notarisierung vor einer öffentlichen
  Verkaufs- oder Testversion verbindlich machen
- [ ] strenge Selbstüberschneidungsprüfung für sehr komplexe Meshes ergänzen

## Als Nächstes: präzisere Slicer- und Druckerprofile

- zu dünne Motivflächen und Wandstärken direkt im Modell farbig markieren
- problematische Überhänge und sehr steile Höhenübergänge anzeigen
- druckerspezifische Mindestwerte für FDM und Resin
- echte Werkzeugpfade und Zeitmodelle über eine optionale lokale Slicer-Engine

Diese Prüfungen sollen direkt an der erzeugten Vorschau verständlich erklärt
und über eine automatische Reparatur korrigiert werden.

## Weitere sinnvolle Ausbaustufen

- STEP-Export für konstruktiv erzeugte Prompt-Modelle, sofern ein robuster
  B-Rep-/CAD-Kern integriert werden kann; Reliefmeshes bleiben primär STL/3MF
- bessere Rundum-Rekonstruktion aus mehreren Ansichten
- drucker-, düsengrößen- und materialspezifische Profile
- Slicer-nahe Schicht- und Farbwechselvorschau
- signierte und notarisierte macOS-Releases mit möglichst reibungsarmem Update

Nicht geplant ist eine Abhängigkeit von Meshy oder einem anderen externen
Text-zu-3D-Dienst. OpenAI plant einfache konstruktive Modelle; die Geometrie
entsteht lokal.
