# Entwicklung

## Standards

- TypeScript im Strict-Modus
- kleine Komponenten mit eindeutigem Verantwortungsbereich
- Domänenlogik außerhalb von React-Komponenten
- validierte IPC-Daten an jeder Prozessgrenze
- keine Geheimnisse im Renderer oder Log
- keine Netzwerkzugriffe aus dem Renderer
- reproduzierbare Builds über Lockfiles
- automatisierte Tests für Domäne, IPC-Validierung und Mesh-Kennzahlen
- deterministische Farb- und Geometriealgorithmen mit Regressionstests

## Voraussetzungen

- macOS auf Apple Silicon
- Node.js 22 oder neuer
- npm 10 oder neuer
- Xcode Command Line Tools für die nativen Swift-Worker

## Befehle

| Befehl | Zweck |
| --- | --- |
| `npm run dev` | Vite und Electron im Entwicklungsmodus |
| `npm run lint` | statische Prüfung |
| `npm run test` | Tests einmalig ausführen |
| `npm run build` | typisierter Produktionsbuild |
| `npm run verify` | alle Qualitätsprüfungen |
| `npm run build:depth-worker` | Core-ML- und Object-Capture-Worker bauen |
| `npm run smoke:depth-worker` | gepackten Tiefen-Worker prüfen |
| `npm run dist` | lokales ARM64-DMG erzeugen |

## Projektbereiche

| Pfad | Inhalt |
| --- | --- |
| `src/` | React-Oberfläche, 3D-Vorschau und Flächeneditor |
| `src/domain/` | testbare Renderer-Domänenlogik wie Palette und Auswahl |
| `electron/main.ts` | Fenster, IPC, Dateien, Einstellungen, Updates und OpenAI |
| `electron/relief.ts` | Relief-, Farb-, STL- und 3MF-Pipeline |
| `electron/cad.ts` | validierter CAD-Plan und lokale Binär-STL-Erzeugung |
| `native/` | Swift-Worker für Core ML und Object Capture |
| `scripts/` | Build-, Revisions-, DMG- und Smoke-Test-Helfer |

## Exportregeln

- STL ist ein einfarbiges, wasserdichtes Fallback.
- Mehrfarbige 3MF-Dateien enthalten getrennte Körper und Basismaterialien.
- Die konfigurierte Seitenfarbe umfasst Tragkörper, Außenwände und Farbgrenzen.
- Motivfarben bilden nur eine 0,04-mm-Decklage auf horizontalen Oberflächen.
- Exportänderungen müssen mindestens mit `electron/relief.test.ts` geprüft werden.
- Änderungen an IPC-Verträgen müssen Main Process, Preload und
  `src/vite-env.d.ts` gemeinsam aktualisieren.

## Lokaler Pakettest

```bash
npm run verify
npm run dist
```

Die reale Desktop-Brücke der gepackten App kann anschließend geprüft werden:

```bash
AI_PRINT_STUDIO_SETTINGS_ROOT=/tmp/ai-print-studio-smoke \
  "release/mac-arm64/AI Print Studio.app/Contents/MacOS/AI Print Studio" --smoke-test
```

## Releases

1. Changelog und betroffene Dokumentation aktualisieren.
2. Version in `package.json` und `package-lock.json` erhöhen.
3. `npm run verify` ausführen.
4. Änderungen committen und auf `main` pushen.
5. Git-Tag `vX.Y.Z` erstellen und pushen.
6. Der Release-Workflow baut und veröffentlicht das ARM64-DMG.

Für eine Verteilung ohne Gatekeeper-Warnung werden ein gültiges
Apple-Developer-ID-Zertifikat, Hardened Runtime und Apple-Notarisierung
benötigt. Ohne diese Voraussetzungen bleibt das Artefakt funktional, muss aber
gegebenenfalls unter **Datenschutz & Sicherheit** manuell freigegeben werden.
