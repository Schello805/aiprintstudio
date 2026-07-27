# Changelog

Alle wesentlichen Änderungen werden in dieser Datei dokumentiert. Das Format
orientiert sich an Keep a Changelog; Versionen folgen Semantic Versioning.

## [Unreleased]

### Fixed

- Relief-Export speichert ohne verwirrenden zweiten Dateidialog automatisch unter `Downloads/AI Print Studio`
- Gepackte App lädt die Electron-Desktop-Brücke nun zuverlässig als Sandbox-kompatibles CommonJS-Preload
- Paket-Smoke-Test prüft Bildauswahl und Einstellungs-IPC in der tatsächlichen `.app`
- GitHub-Release-Build versucht nicht mehr doppelt über `electron-builder` zu veröffentlichen
- Updatefeste Speicherung des OpenAI-Schlüssels in einem stabilen Bundle-ID-Ordner
- Automatische Migration aus früheren Electron-Datenordnern
- Sofortige Lese- und Entschlüsselungsprüfung nach dem Speichern
- Sichtbarer OpenAI-Konfigurationsstatus in den Einstellungen
- Robuste Bildvalidierung mit verständlichen Fehlermeldungen
- Explizite Zustände für Dateiauswahl, Abbruch, Verarbeitung und Export

## [0.2.0] - 2026-07-27

### Added

- Electron-, React- und TypeScript-Grundstruktur
- Desktopoptimiertes Studio mit Drag-and-drop und Bildvorschau
- Verlauf, Einstellungen und lokale Datenschutzanzeige
- Rechtsansichten und Footer mit automatischer Revision
- Funktionsfähige Einrichtungsdialoge für OpenAI und das lokale 3D-Modell
- Verschlüsselte lokale Ablage des OpenAI-Schlüssels
- Projektweiter GitHub-Link
- Vollständig lokale Bild-zu-Relief-Pipeline
- Wasserdichte Mesh-Erzeugung und STL-/3MF-Export
- Ergebnisanzeige mit direkter Finder-Integration
- Architektur-, Entwicklungs-, Sicherheits- und Beitragsdokumentation

## [0.1.0] - 2026-07-27

### Added

- Erstes Projektfundament
