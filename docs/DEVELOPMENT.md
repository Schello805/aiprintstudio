# Entwicklung

## Standards

- TypeScript im Strict-Modus
- kleine Komponenten mit eindeutigem Verantwortungsbereich
- Domänenlogik außerhalb von React-Komponenten
- validierte IPC-Daten an jeder Prozessgrenze
- keine Geheimnisse im Renderer oder Log
- reproduzierbare Builds über Lockfiles
- automatisierte Tests für Domäne, IPC-Validierung und Mesh-Kennzahlen

## Befehle

| Befehl | Zweck |
| --- | --- |
| `npm run dev` | Vite und Electron im Entwicklungsmodus |
| `npm run lint` | statische Prüfung |
| `npm run test` | Tests einmalig ausführen |
| `npm run build` | typisierter Produktionsbuild |
| `npm run verify` | alle Qualitätsprüfungen |
| `npm run dist` | unsignierte ARM64-DMG |

## Releases

1. Changelog aktualisieren.
2. Prüfungen mit `npm run verify` ausführen.
3. Version in `package.json` erhöhen.
4. Git-Tag `vX.Y.Z` erstellen.
5. Release-Workflow erzeugt die DMG.

Nach Einrichtung einer Apple Developer ID werden Signierung und Notarisierung
als zusätzliche CI-Schritte ergänzt; die Anwendung selbst bleibt unverändert.
