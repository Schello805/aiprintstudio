# Changelog

## 0.11.0

- „Studio“ öffnet jetzt eine übersichtliche Werkzeug-Zentrale statt sofort alle Relief-Einstellungen anzuzeigen.
- Drei klar getrennte Einstiege führen zu „Bild zu 3D“, „Schrift zu 3D“ und „Prompt zu 3D“.
- Jede Werkzeugkarte erklärt Ergebnis, Verarbeitung und wichtigste Möglichkeiten vor dem Start.
- Bild zu 3D behält Foto-, Logo-, Tiefen- und AMS-Werkzeuge in einem fokussierten Workflow.
- Schrift zu 3D verwendet automatisch die passende Kontur-Engine und blendet ungeeignete Foto- und Tiefenmodi aus.
- Die Prozessschritte, Überschriften und Upload-Flächen passen sich dem ausgewählten Werkzeug an.
- Eine sichtbare Rückkehr zu „Alle Werkzeuge“ verhindert Sackgassen und macht den Wechsel zwischen Funktionen eindeutig.
- Die neue Startzentrale wurde in Desktopbreite und kompaktem Layout visuell geprüft.

## 0.10.0

- Neuer „Prompt zu 3D“-Workflow für vollständige STL-Objekte über die offizielle Meshy Text-to-3D-API.
- OpenAI optimiert den eingegebenen Prompt optional auf zusammenhängende, wasserdichte und FDM-taugliche Geometrie.
- Meshy API-Schlüssel werden getrennt vom OpenAI-Schlüssel verschlüsselt gespeichert und können in den Einstellungen verwaltet werden.
- „Text zu STL“ heißt präziser „Schrift zu STL“ und rendert eng zugeschnittene, transparente Vorlagen ohne aggressive Erosion dünner Buchstaben.
- Der Flächeneditor weist ausgewählten Motivbereichen gezielt einen AMS-Slot zu; die Korrekturen werden in Vorschau und 3MF-Objekten übernommen.
- Neue Baukastenaktion für Vertiefungen sowie die vorhandenen Höhen-, Glättungs- und Abrundungswerkzeuge stehen direkt an der Auswahl bereit.
- Der Druckscore prüft jetzt zusätzlich Mindestbreiten und getrennte Kleinteile und zeigt die Einzelprüfungen sichtbar an.
- 29 Tests sichern unter anderem den vollständigen Schrift-zu-Mesh-Workflow ab.

## 0.9.0

- Neuer Einstieg „Text zu STL“ für bis zu sechs Textzeilen mit Schriftart, Fett/Kursiv und Ausrichtung.
- Text wird vollständig lokal als transparente, hochauflösende Vorlage gerendert und anschließend über den bewährten Logo-Reliefpfad exportiert.
- Mehrfarbige Reliefs besitzen jetzt einen zusammenhängenden, einfarbigen Tragkörper; nur die oberen 0,6 mm bilden die farbigen Deckschichten.
- Seitenflächen und Grundstruktur lassen sich gezielt einem AMS-Slot zuweisen, standardmäßig der dunkelsten erkannten Farbe.
- Erkannte Oberflächenfarben bleiben unabhängig von der gewählten Seitenfarbe.
- Sichtbare Info-Tooltips erklären Farbanzahl und Seitenfarbe.
- Neue Tests prüfen sichere Textdarstellung, transparente Hintergründe, einfarbige Seitenkörper und dünne Farbdeckschichten.

## 0.8.0

- Neuer AMS-Farbdruck-Modus mit frei wählbaren zwei bis acht Farben.
- Dominante Bildfarben werden lokal automatisch erkannt und als editierbare AMS-Palette angezeigt.
- Erkannte Bildfarben und gewünschte Filamentfarben bleiben getrennt, sodass ein Filamentwechsel die Flächenerkennung nicht verändert.
- Die 3D-Vorschau zeigt die erkannte Mehrfarben-Aufteilung direkt am Relief.
- Mehrfarbige 3MF-Dateien enthalten pro Farbe einen eigenen, passgenauen und benannten Körper mit 3MF-Basismaterial.
- Die Grundplatte wird mit AMS-Farbe 1 kombiniert, sodass keine zusätzliche Farbe und kein zusätzliches Grundplattenobjekt entsteht.
- STL bleibt als einfarbiger Fallback erhalten.
- Neue Tests prüfen Palettenerkennung, Farbzuordnung und den mehrteiligen 3MF-Materialexport.

## 0.7.4

- Logos werden mit höherer Mesh-Auflösung verarbeitet, damit runde Außenkonturen weniger polygonal wirken.
- Die Silhouetten-Glättung arbeitet mit zusätzlichen Konturpässen, ohne innere Schrift- und Motivdetails weichzuzeichnen.
- Die 3D-Vorschau tastet Außenkanten feiner ab und zeigt Rundungen näher am exportierten Modell.
- Ein geometrischer Regressionstest schützt kreisförmige Konturen vor erneutem Treppeneffekt.

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
