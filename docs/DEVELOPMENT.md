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

- macOS 13 oder neuer auf Apple Silicon
- Node.js 22 oder neuer
- npm 10 oder neuer
- Xcode Command Line Tools für die nativen Swift-Worker

Die nativen Worker werden mit dem expliziten Deployment-Target
`arm64-apple-macos13.0` gebaut. Dadurch wird nicht versehentlich die
macOS-Version des jeweiligen Build-Macs zur Mindestversion des Releases.

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
| `src/` | React-Oberfläche und 3D-Vorschau |
| `src/domain/` | testbare Renderer-Domänenlogik wie Bildprüfung und Palette |
| `electron/main.ts` | Fenster, IPC, Dateien, Einstellungen, Updates und OpenAI |
| `electron/relief.ts` | Relief-, Farb-, STL- und 3MF-Pipeline |
| `electron/cad.ts` | validierter CAD-Plan und lokale Binär-STL-Erzeugung |
| `native/` | Swift-Worker für die lokale Core-ML-Tiefenerkennung |
| `scripts/` | Build-, Revisions-, DMG- und Smoke-Test-Helfer |

## Exportregeln

- STL ist ein einfarbiges, wasserdichtes Fallback.
- Mehrfarbige 3MF-Dateien enthalten getrennte Farbkörper und Basismaterialien
  als Komponenten eines einzigen Assembly-Objekts.
- Die konfigurierte Seitenfarbe umfasst Tragkörper, Außenwände und Farbgrenzen.
- Motivfarben bilden eine 0,4-mm-Decklage auf horizontalen Oberflächen.
- Das 3MF verwendet Millimeter und genau einen Eintrag im Build-Bereich.
- Farbdreiecke besitzen explizite Core-3MF-Materialreferenzen.
- Orca-/Anycubic-Metadaten müssen Palette und Extruderzuordnung aller
  Farbkörper enthalten.
- Erzeugte Modelle werden zunächst nur im temporären Vorschauverzeichnis
  abgelegt. Dauerhafte STL-/3MF-Dateien dürfen erst über `export:save` und den
  nativen Speicherdialog entstehen.
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
6. Der Release-Workflow signiert die App mit Developer ID, aktiviert Hardened
   Runtime, notarisiert das DMG, heftet das Ticket an und prüft Gatekeeper.
7. Nur wenn alle Sicherheitsprüfungen erfolgreich sind, wird das DMG
   veröffentlicht.

Der Workflow benötigt die GitHub-Secrets `MACOS_CERTIFICATE` (Base64-P12),
`MACOS_CERTIFICATE_PASSWORD`, `APPLE_API_KEY_P8`, `APPLE_API_KEY_ID` und
`APPLE_API_ISSUER`. Fehlt ein Wert, bricht das Release absichtlich ab. Dadurch
kann kein weiterer als „offiziell“ bezeichneter, aber lediglich ad hoc
signierter Build veröffentlicht werden.

### Einmalige Apple-Einrichtung

1. Eine aktive Mitgliedschaft im Apple Developer Program sicherstellen.
2. In Xcode unter **Settings → Accounts → Manage Certificates** ein
   **Developer ID Application**-Zertifikat erstellen.
3. Zertifikat und privaten Schlüssel in der Schlüsselbundverwaltung gemeinsam
   als passwortgeschützte `.p12`-Datei exportieren. Weder P12 noch Passwort
   werden in das Repository eingecheckt oder per Chat weitergegeben.
4. Die P12-Datei Base64-kodiert als GitHub-Secret `MACOS_CERTIFICATE` und ihr
   Exportpasswort als `MACOS_CERTIFICATE_PASSWORD` hinterlegen.
5. In App Store Connect unter **Users and Access → Integrations** einen
   API-Schlüssel erzeugen. Den unveränderten Inhalt der einmalig
   herunterladbaren `.p8`-Datei als `APPLE_API_KEY_P8`, die Key-ID als
   `APPLE_API_KEY_ID` und die Issuer-ID als `APPLE_API_ISSUER` hinterlegen.
6. Erst danach den nächsten Release-Tag pushen. Der Workflow prüft alle Werte,
   ohne sie in Logs auszugeben.
