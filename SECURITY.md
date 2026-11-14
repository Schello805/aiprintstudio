# Sicherheitsrichtlinie

## Unterstützte Versionen

Während der frühen Entwicklung wird nur die jeweils aktuelle veröffentlichte
Version unterstützt. Der Quellcode-Stand steht in `package.json`.

## Sicherheitsproblem melden

Bitte keine verwertbaren Schwachstellen öffentlich als Issue veröffentlichen.
Stattdessen bitte einen privaten Security Advisory im GitHub-Repository öffnen:
<https://github.com/Schello805/aiprintstudio/security/advisories/new>.

## Sicherheitsmodell

- Kontextisolation und Renderer-Sandbox sind aktiv.
- Node.js ist im Renderer deaktiviert.
- Externe Links werden auf `https:` und `mailto:` beschränkt.
- Uploads werden anhand Signatur, Format, Größe und Bilddimensionen geprüft.
- Das lokale Tiefenmodell wird mitgeliefert und beim Arbeiten nicht nachgeladen.
- Neue OpenAI-Schlüssel werden ohne App-Passwort unverschlüsselt in einer
  lokalen Einstellungsdatei gespeichert. Sie wird mit Dateimodus `0600`
  geschrieben. Der macOS-Schlüsselbund wird nicht verwendet. Bestehende
  AES-256-GCM-/scrypt-Altbestände können weiterhin per Passwort entsperrt werden.
- Diagnose-Logs bleiben lokal und enthalten keine Bilddaten, Schlüssel oder
  Promptinhalte. Technische Worker-Fehler können lokale Dateipfade enthalten.
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

Generierte Modelle liegen zunächst im temporären Vorschauverzeichnis. Erst ein
bewusster Export speichert sie über den macOS-Speicherdialog dauerhaft. Verlauf,
Wiederherstellungsstand und Einstellungen liegen im Anwendungsdatenverzeichnis
von macOS. Das Leeren des Verlaufs löscht keine exportierten STL- oder 3MF-Dateien.

Die Anwendung stellt keine Garantie für mechanische Belastbarkeit oder sichere
Verwendung eines erzeugten Druckteils dar. Kritische Bauteile müssen fachlich
geprüft werden.
