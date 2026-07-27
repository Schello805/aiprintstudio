# Sicherheitsrichtlinie

## Unterstützte Versionen

Während der frühen Entwicklung wird nur die jeweils aktuelle Version unterstützt.

## Sicherheitsproblem melden

Bitte keine verwertbaren Schwachstellen öffentlich als Issue veröffentlichen.
Eine dedizierte Kontaktadresse wird vor dem ersten öffentlichen Release
eingetragen.

## Sicherheitsmodell

- Kontextisolation und Renderer-Sandbox sind aktiv.
- Node.js ist im Renderer deaktiviert.
- Externe Links werden auf `https:` und `mailto:` beschränkt.
- Uploads werden anhand Signatur, Format, Größe und Bilddimensionen geprüft.
- Modell-Downloads benötigen eine bekannte Quelle und SHA-256-Prüfsumme.
- OpenAI-Schlüssel werden später ausschließlich in der macOS-Keychain gespeichert.
- Logs enthalten keine Bilder, Schlüssel oder vollständigen lokalen Dateipfade.
- KI-Ergebnisse gelten als nicht vertrauenswürdig und werden vor dem Export geprüft.

Die Anwendung stellt keine Garantie für mechanische Belastbarkeit oder sichere
Verwendung eines erzeugten Druckteils dar. Kritische Bauteile müssen fachlich
geprüft werden.
