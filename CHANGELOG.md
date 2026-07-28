# Changelog

## 0.7.3

- Tooltips öffnen jetzt ausschließlich über gut sichtbare Info-Symbole statt beim Überfahren kompletter Felder.
- Der Flächeneditor arbeitet mit höherer Auflösung, kräftiger Auswahlmarkierung und einer direkten Millimeter-Eingabe.
- Höhenregler und Flächenauswahl reagieren zuverlässig per Pointer; eine klare Statuszeile erklärt die Übernahme ins neue Relief.
- Die Hauptvorschau wird nach einer Flächenänderung bewusst verworfen, damit kein veraltetes Ergebnis angezeigt wird.
- Die 3D-Vorschau verwendet eine feinere Konturabtastung für sichtbar ruhigere Logo- und Wappenkanten.
- Der macOS-Build wird nach dem Paketieren erneut geprüft und gültig lokal signiert.

## 0.7.2

- Behebt „Maximum call stack size exceeded“ bei hochauflösenden Reliefvorschauen
- Ermittelt die Grundplattenhöhe speichersicher ohne hunderttausende Funktionsargumente
- Neuer Regressionstest deckt Vorschauen mit 384 × 442 Höhenpunkten ab

## 0.7.1

- Stark vereinfachter Standardworkflow mit nur Automatisch, Logo/Wappen und Foto/3D-Tiefe
- Automatik verwendet für Logos direkt den Konturmodus und für Fotos direkt Depth Anything
- Qualitätsprofil wird optimal gewählt statt als zusätzliche 5-fache Auswahl angezeigt
- Sichtbar bleiben nur Breite, Grundplatte und Reliefhöhe; Sonderoptionen liegen unter „Erweitert“
- Kompaktere Überschrift, Vorschau, Workflowleiste und Einstellungsfläche für eine vollständige Bildschirmansicht
- Sofort-Tooltips für alle Werkzeuge des Flächeneditors ergänzt
- Vorschaurand wird auf Grundplattenhöhe fixiert und erzeugt keine langen Sägezahnspitzen mehr

## 0.7.0

- Neuer interaktiver Flächeneditor für Logos, Wappen und andere flächige Motive
- Sichtbare grüne Auswahl mit Umschalt-Mehrfachauswahl, angrenzender Erweiterung, Reduktion, Farbauswahl und Umkehrung
- Höhenwerkzeuge zum Anheben, Absenken, Glätten, Abrunden und Zurücksetzen auf die Grundfläche
- Rückgängig/Wiederholen und direkte 3D-Vorschau während der Bearbeitung
- Manuelle Höhenkarten werden ohne erneute Normalisierung an STL und 3MF übergeben
- Direkter SVG-Import mit sicher gerasterter Bearbeitungsvorschau
- Neues selbsterklärendes DMG-Layout mit deutscher Installationsanweisung
- Erweiterte Druckanalyse als nächster Entwicklungsschritt dokumentiert

## 0.6.4

- Eigene schwarze macOS-Titelleiste als geschützter Bereich für die Fensterknöpfe
- Sidebar und Hauptinhalt beginnen vollständig unterhalb der Titelleiste
- Fensterknöpfe werden innerhalb des neuen Titelbereichs sauber ausgerichtet

## 0.6.3

- Sofort sichtbare Tooltips für alle Verarbeitungsarten, Qualitätsprofile und Reliefparameter
- Jeder Hinweis erklärt die Wirkung der Einstellung und nennt ein konkretes Anwendungsbeispiel
- Tooltips funktionieren per Maus und Tastaturfokus und bleiben an den äußeren Karten vollständig sichtbar

## 0.6.2

- Glättet die tatsächliche Außenkontur des Export- und Vorschaumeshes statt nur die Randhöhe
- Erkennt bei Logos und Wappen getrennte Motivflächen nach ihrer Größe und hebt Objekte wie Rollen gezielt an
- Stuft antialiaste Logos zuverlässiger als Logo statt als Foto ein
- Gleicht die vereinfachte 3D-Vorschau an die Kontur des exportierten Modells an

## 0.6.1

- Erkennt beim Start alte oder doppelte App-Kopien außerhalb von „Programme“
- Öffnet automatisch die bereits installierte neuere Version
- Kann eine gestartete DMG-/Download-Kopie selbst nach „Programme“ verschieben

## 0.6.0

- Neuer Konturmodus clustert Logo- und Wappenfarben zu stabilen Höhenebenen
- Depth Anything V2 Small läuft als gebündeltes Core-ML-Modell vollständig lokal
- Automatische Verarbeitung wählt für flächige Grafiken den Konturmodus
- Apple Object Capture rekonstruiert vollständige USDZ-Modelle aus 12–300 Fotos
- Neue Modusauswahl und geführter Mehrfoto-Workflow im Studio

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
