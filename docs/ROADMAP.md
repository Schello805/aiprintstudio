# Roadmap

## Aktueller Stand 0.23.3

- Bild zu 3D mit Kontur-, Höhenkarten- und lokaler KI-Tiefe
- Schrift zu 3D mit gemeinsamem Relief- und AMS-Workflow
- eigener Lithophan-Workflow mit Außenformen, Rahmen, Aufhängeloch, Wölbung
  und beleuchteter Materialvorschau
- optionale, automatisch verbundene Anhängeröse direkt im Bild-Workflow
- Vorschau-Diagnose mit PLA-Materialien, Normalen, Drahtgitter, Druckbett,
  Kamerasteuerung sowie Original-/Höhenkartenvergleich
- Prompt zu 3D über OpenAI Structured Outputs, iterative Folgeanweisungen,
  lokale 3D-Vorschau, CAD-/STL-Erzeugung sowie gestreamte Phasen- und
  API-Kostenanzeige; Modellwahl zwischen Sol, Terra und Luna
- datensparsame Prompt-zu-3D-Diagnose mit letzter Phase, Systemursache und
  lokalem Log
- mehrfarbiger 3MF-Export als slicer-kompatibles Assembly mit einheitlichen
  Seiten- und Übergangskanten
- SVG-Import, Druckscore, Verlauf und Updateprüfung
- `.aips`-Projektdateien mit eingebetteter Quelle und Bearbeitungsstand
- automatische Druckreparatur für 0,4-mm-Düsen
- lokale Schicht-, Zeit- und Materialschätzung
- bedarfsgesteuerte Reduzierung auf höchstens 250.000 Dreiecke

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
