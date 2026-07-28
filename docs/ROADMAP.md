# Roadmap

## Aktueller Stand 0.14.2

- Bild zu 3D mit Kontur-, Höhenkarten- und lokaler KI-Tiefe
- Schrift zu 3D mit gemeinsamem Relief- und AMS-Workflow
- Prompt zu 3D über OpenAI Structured Outputs, iterative Folgeanweisungen,
  lokale 3D-Vorschau und CAD-/STL-Erzeugung
- Flächeneditor mit Auswahl-, Höhen-, Glättungs- und Farbwerkzeugen
- mehrfarbiger 3MF-Export als slicer-kompatibles Assembly mit einheitlichen
  Seiten- und Übergangskanten
- SVG-Import, Druckscore, Verlauf und Updateprüfung

## Als Nächstes: erweiterte Druckanalyse und Bearbeitung

- zu dünne Motivflächen und Wandstärken direkt im Modell farbig markieren
- problematische Überhänge und sehr steile Höhenübergänge anzeigen
- druckerspezifische Mindestwerte für FDM und Resin
- konkrete Reparaturvorschläge pro markierter Stelle
- Vorschau der zu erwartenden Slicer-Schichten

Diese Prüfungen sollen unmittelbar im Flächeneditor erscheinen, damit eine
problematische Auswahl direkt angehoben, verbreitert, geglättet oder auf die
Grundfläche gesetzt werden kann.

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
