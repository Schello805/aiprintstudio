# Sicherheitsrichtlinie

## Unterstützte Versionen

Während der frühen Entwicklung wird nur die jeweils aktuelle veröffentlichte
Version unterstützt. Der aktuelle Entwicklungsstand ist 0.13.2.

## Sicherheitsproblem melden

Bitte keine verwertbaren Schwachstellen öffentlich als Issue veröffentlichen.
Stattdessen bitte einen privaten Security Advisory im GitHub-Repository öffnen:
<https://github.com/Schello805/aiprintstudio/security/advisories/new>.

## Sicherheitsmodell

- Kontextisolation und Renderer-Sandbox sind aktiv.
- Node.js ist im Renderer deaktiviert.
- Externe Links werden auf `https:` und `mailto:` beschränkt.
- Uploads werden anhand Signatur, Format, Größe und Bilddimensionen geprüft.
- Modell-Downloads benötigen eine bekannte Quelle und SHA-256-Prüfsumme.
- Der OpenAI-Schlüssel wird im Electron-Hauptprozess mit `safeStorage` über die
  macOS-Systemverschlüsselung verschlüsselt; der Renderer erhält ihn nicht zurück.
- Logs enthalten keine Bilder, Schlüssel oder vollständigen lokalen Dateipfade.
- KI-Ergebnisse gelten als nicht vertrauenswürdig und werden vor dem Export geprüft.
- Prompt-zu-3D begrenzt Eingabelänge, Bauteilanzahl, Koordinaten,
  Gesamtgröße und Mindestmaterialstärke, bevor lokale Geometrie entsteht.
- Bild-, Schrift-, Relief-, Tiefen- und AMS-Workflows arbeiten lokal. Nur beim
  ausdrücklich gestarteten Prompt-zu-3D-Workflow wird die Beschreibung an
  OpenAI übertragen. Bei einer Folgeanweisung wird außerdem der zuvor
  validierte strukturierte CAD-Bauplan übertragen; STL und 3D-Vorschau bleiben
  lokal.
- Updateprüfungen greifen ausschließlich auf GitHub Releases dieses Projekts zu.

## Lokale Daten

Generierte Modelle werden standardmäßig unter `Downloads/AI Print Studio`
gespeichert. Verlauf und Einstellungen liegen im Anwendungsdatenverzeichnis von
macOS. Das Löschen eines Verlaufseintrags löscht nicht automatisch bereits
exportierte STL-, 3MF- oder USDZ-Dateien.

Die Anwendung stellt keine Garantie für mechanische Belastbarkeit oder sichere
Verwendung eines erzeugten Druckteils dar. Kritische Bauteile müssen fachlich
geprüft werden.
