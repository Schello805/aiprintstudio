# Changelog

## 0.5.3

- Erkennt veröffentlichte Updates zuverlässig über GitHub Releases
- Öffnet verfügbare DMG-Dateien direkt aus den App-Einstellungen
- Veröffentlicht erfolgreiche Release-Builds automatisch statt als Entwurf

## 0.5.2

- Glättet transparente Motivkonturen und entfernt gezackte Außenwände
- Fügt einen flachen Sicherheitsrand zwischen Relief und Außenwand ein
- Erkennt flächige Grafiken automatisch und empfiehlt das Logo-Profil
- Passt die 3D-Kamera dynamisch an die Modellabmessungen an

## 0.5.1

- Korrigiert den ungültigen Blur-Wert des Logo-Qualitätsprofils

## 0.5.0

- Mehrstufige, profilabhängige Höhenverarbeitung mit Glättung und Detailrückführung
- Qualitätsprofile für schnelle Entwürfe, Fotos, Logos und feine Modelle
- Einstellbare Modellmaße, Reliefhöhe, Glättung und Detailstärke
- Höhenkarten-Vorschau, Druckscore und geschätztes Modellvolumen
- Lokaler Modellverlauf und manuelle Update-Prüfung über GitHub Releases

Alle wesentlichen Änderungen werden in dieser Datei dokumentiert. Das Format
orientiert sich an Keep a Changelog; Versionen folgen Semantic Versioning.

## [Unreleased]

### Added

- Interaktive 3D-Vorschau rechts neben dem Originalbild
- Drehen und Zoomen der Vorschau direkt im Studio
- Konturmaske aus Transparenz oder automatisch erkanntem Randhintergrund
- Umschaltung zwischen hellen und dunklen erhabenen Bereichen
- Kostenanzeige für die lokale Umwandlung

### Changed

- Exportauflösung von 128 auf 256 erhöht
- Kontrastnormalisierung und 32 Höhenstufen für klarere Konturen
- Separates leichtes Vorschaumesh bei voller Exportqualität

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
