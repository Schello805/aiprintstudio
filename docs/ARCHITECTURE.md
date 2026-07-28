# Architektur

## Kontext

Ein einzelnes Foto enthält keine vollständige Rückseiten- oder Tiefeninformation.
Die Rekonstruktion ist daher eine plausible Schätzung. AI Print Studio trennt
diese probabilistische KI-Stufe strikt von der deterministischen Prüfung und
Reparatur des Meshes.

## Komponenten

```text
React Renderer
  │ sichere, typisierte IPC-Aufrufe
Electron Main Process
  ├── Settings / Keychain
  ├── Job Repository
  ├── File Validation
  └── Worker Supervisor
        │ JSON Lines über stdin/stdout
        ▼
Native Apple Worker
  ├── Depth Anything V2 / Core ML
  └── RealityKit Object Capture
        │
        ▼
3D Pipeline
  ├── Image Preprocessing
  ├── Reconstruction Provider
  ├── Mesh Repair Pipeline
  ├── Printability Analysis
  └── STL / 3MF Export
```

Der Renderer erhält keinen direkten Node.js-, Dateisystem- oder Shell-Zugriff.
Nur explizit freigegebene IPC-Kommandos werden im Preload-Skript veröffentlicht.

## Kernverträge

`ReconstructionProvider` nimmt ein normalisiertes Bild und ein Qualitätsprofil
entgegen und erzeugt ein neutrales Mesh-Artefakt. Die lokale Implementierung
kann dadurch später ausgetauscht werden, ohne UI, Historie oder Export zu ändern.

`MeshProcessor` führt unabhängig vom Provider folgende Schritte durch:

1. Szenen auf ein einzelnes Mesh reduzieren
2. ungültige und doppelte Flächen entfernen
3. Vertices verschmelzen
4. Normalen korrigieren
5. Löcher schließen
6. Komponenten prüfen und kleine Artefakte entfernen
7. auf Millimeter skalieren und auf der Druckplatte ausrichten
8. Wasserdichtigkeit und Mindestdimensionen bewerten
9. STL und/oder 3MF exportieren

## Jobzustände

`queued → validating → analysing → reconstructing → repairing → exporting → completed`

Jeder Zustand wird persistiert. Abbruch, App-Neustart und Worker-Fehler dürfen
keinen unklaren Zustand oder halbfertigen Download erzeugen.

## Erweiterbarkeit

Lithophane, Relief und Text-to-3D werden als neue Workflows implementiert, nicht
als Sonderfälle in der Image-to-3D-Pipeline. Benutzerverwaltung und Serverbetrieb
gehören bewusst nicht zur ersten Desktop-Version.
