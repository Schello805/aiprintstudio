# AI Print Studio

AI Print Studio ist eine lokale macOS-Anwendung, die aus einem einzelnen Bild
ein möglichst druckbares 3D-Modell erzeugt. Die erste Zielplattform ist Apple
Silicon (M1 oder neuer). Bilder, Zwischenstände und Mesh-Dateien bleiben
standardmäßig auf dem eigenen Mac.

[![Quality](https://github.com/Schello805/aiprintstudio/actions/workflows/quality.yml/badge.svg)](https://github.com/Schello805/aiprintstudio/actions/workflows/quality.yml)

> Status: frühe Entwicklung. Die Benutzeroberfläche und Desktop-Grundstruktur
> sind lauffähig. Der lokale Reliefmodus erzeugt bereits testbare STL- und
> 3MF-Dateien; die vollständige Rundum-Rekonstruktion wird schrittweise integriert.

## Leitprinzipien

- Lokale Bild-zu-3D-Verarbeitung mit einem Open-Source-Modell
- Optionale OpenAI-Bildanalyse, niemals als Voraussetzung
- Austauschbare KI- und 3D-Provider
- Druckbarkeit vor künstlerischer Perfektion
- Keine Benutzerkonten, Telemetrie oder Cloud-Pflicht
- API-Schlüssel ausschließlich in der macOS-Keychain
- STL- und 3MF-Export
- Interaktive 3D-Vorschau direkt neben dem Originalbild
- Konturgetreuer Export anhand von Transparenz oder erkanntem Bildhintergrund
- Umschaltbare Relief-Richtung für helle oder dunkle erhabene Bereiche
- Sichtbare Kostenanzeige für die lokale Verarbeitung

## Bereits testbar

1. Im Studio ein PNG-, JPG- oder WEBP-Bild auswählen.
2. **Relief erstellen** anklicken.
3. Die erzeugte STL oder 3MF unter `Downloads/AI Print Studio` im Slicer öffnen.

Der aktuelle Modus erzeugt eine hochauflösende, wasserdichte Reliefplatte mit
frei wählbaren Abmessungen. Fünf Qualitätsprofile optimieren Fotos, Logos oder
schnelle Entwürfe unterschiedlich. Die mehrstufige Höhenpipeline kombiniert
Normalisierung, kantenerhaltende Glättung, Detailrückführung und profilabhängige
Höhenstufen. Das Ergebnis enthält eine Höhenkarten-Vorschau, einen Druckscore,
eine Materialschätzung und wird im lokalen Verlauf gespeichert.

Unter **Einstellungen → App-Updates** kann die App manuell nach einer neuen
GitHub-Version suchen. Ein verfügbarer Download wird erst nach ausdrücklichem
Klick im Browser geöffnet; automatische Hintergrundupdates gibt es nicht.

## Technischer Aufbau

| Bereich | Technologie | Zweck |
| --- | --- | --- |
| Desktop | Electron | macOS-Fenster, Dateisystem, sichere IPC-Brücke |
| Oberfläche | React + TypeScript + Vite | typisierte, modulare Benutzeroberfläche |
| 3D Worker | Python/PyTorch | lokale Rekonstruktion über CPU oder Metal/MPS |
| Mesh-Pipeline | Trimesh/Open3D | Analyse, Reparatur, Skalierung und Export |
| Konfiguration | macOS Keychain + lokale JSON-Datenbank | Geheimnisse und Einstellungen |
| Releases | Git-Tags + GitHub Actions | `.dmg` und automatische Revisionsnummer |

Weitere Details: [Architektur](docs/ARCHITECTURE.md) und
[Entwicklung](docs/DEVELOPMENT.md).

## Lokale Entwicklung

Voraussetzungen:

- macOS auf Apple Silicon
- Node.js 22 oder neuer
- npm 10 oder neuer
- für den späteren KI-Worker Python 3.11

```bash
npm install
npm run dev
```

Produktionsbuild prüfen:

```bash
npm run verify
```

Unsignierte DMG erzeugen:

```bash
npm run dist
```

Die reale Desktop-Brücke der gepackten App kann anschließend geprüft werden:

```bash
AI_PRINT_STUDIO_SETTINGS_ROOT=/tmp/ai-print-studio-smoke \
  "release/mac-arm64/AI Print Studio.app/Contents/MacOS/AI Print Studio" --smoke-test
```

Das Ergebnis liegt unter `release/`. Ohne Apple Developer ID muss die App nach
dem Download einmalig in **Systemeinstellungen → Datenschutz & Sicherheit**
freigegeben werden.

## Konfiguration

OpenAI ist optional. Der Schlüssel wird in der fertigen App über die
Einstellungen erfasst und in der macOS-Keychain abgelegt. Er gehört niemals in
Git, eine Frontend-Datei oder ein Release-Artefakt.

## Veröffentlichung und Versionierung

Die sichtbare Revision stammt aus der App-Version. Release-Tags verwenden das
Format `vMAJOR.MINOR.PATCH`; der Release-Workflow überträgt die Tag-Version vor
dem Build automatisch in das App-Paket und erzeugt einen zunächst als Entwurf
gespeicherten GitHub Release mit ARM64-DMG.

Projekt-Repository: <https://github.com/Schello805/aiprintstudio>

## Datenschutz

Ohne aktivierte OpenAI-Analyse verlassen keine Nutzbilder oder Modelle den Mac.
Vor einer optionalen Übertragung zeigt die Anwendung Anbieter, Zweck und
übertragene Daten an. Details stehen in [SECURITY.md](SECURITY.md).

## Lizenz

Copyright © Michael Schellenberger.

Der Quellcode ist unter der
[PolyForm Noncommercial License 1.0.0](LICENSE.md) für private und andere
nichtkommerzielle Zwecke verfügbar. Kommerzielle Nutzung ist nicht gestattet.
Diese Einschränkung bedeutet, dass das Projekt im strengen OSI-Sinn nicht als
„Open Source“, sondern als **source-available** einzuordnen ist.

Abhängige KI-Modelle besitzen eigene Lizenzen. Die App zeigt diese vor dem
jeweiligen Modelldownload an.
