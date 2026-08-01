# Architektur

## Kontext

Ein einzelnes Bild enthält keine vollständige Rückseiten- oder
Tiefeninformation. **Bild zu 3D** erzeugt deshalb heute vor allem kontrollierte
2,5D-Reliefs. **Prompt zu 3D** erstellt einen validierten CAD-Bauplan aus
druckbaren Grundkörpern. Die Geometrieerzeugung und Prüfung bleiben lokal.

## Komponenten

```text
React Renderer
  │ sichere, typisierte IPC-Aufrufe
Electron Main Process
  ├── Systemcheck / Hardware- und Ressourcenprüfung
  ├── Einstellungen / lokaler AES-GCM-Tresor für OpenAI
  ├── Verlauf / Updateprüfung
  ├── Dateivalidierung
  ├── OpenAI CAD-Planung (optional)
  ├── Native Worker
  │     └── Depth Anything V2 / Core ML
  └── lokale 3D-Pipelines
        ├── Relief / Kontur / Höhenkarte
        ├── CAD-Körpergenerator mit Quader-, Zylinder-, Dach- und Blattkörpern
        ├── Druckbarkeitsanalyse
        └── STL / 3MF
```

Rechenintensive Relief- und Mehrfarben-Meshes laufen in einem separaten
`worker_threads`-Worker. Fortschrittsmeldungen werden über eine begrenzte
IPC-Verbindung an den Renderer übertragen. Ein Abbruch beendet sowohl native
Tiefenprozesse als auch den aktiven Mesh-Worker, ohne den Electron-Hauptprozess
oder den aktuellen Studio-Stand zu blockieren.

Die Ressourcenanzeige fragt über eine schmale, nur lesende IPC-Methode
`app.getAppMetrics()` ab. CPU- und Working-Set-Werte aller Electron-Prozesse
werden im Hauptprozess summiert und alle 1,5 Sekunden in der Seitenleiste
aktualisiert. Es werden keine Prozessdaten gespeichert oder übertragen.

Der Renderer erhält keinen direkten Node.js-, Dateisystem- oder Shell-Zugriff.
Nur explizit freigegebene IPC-Kommandos werden im Preload-Skript veröffentlicht.
Netzwerkzugriffe erfolgen ausschließlich im Electron-Hauptprozess.

## Bild-, Schrift-, Lithophan- und Reliefpipeline

Die Reliefpipeline nimmt ein validiertes Bild und ein Qualitätsprofil entgegen:

1. Eingabe und Abmessungen validieren
2. Motivmaske und Verarbeitungsprofil bestimmen
3. Konturen oder Tiefenwerte glätten und Höhen rekonstruieren
4. geschlossenes Reliefmesh mit Grund- und Seitenflächen erzeugen
5. Druckbarkeit, Mindestdimensionen, Konturqualität und Volumen bewerten
6. Topologie auf ungültige, degenerierte und doppelte Dreiecke prüfen
7. STL und/oder materialisiertes 3MF im Speicher erzeugen und deren Container,
   Einheiten, Koordinaten und Dreieckszahl validieren
8. nur validierte Vorschaudateien temporär bereitstellen

Bei **Logo mit Text** kann die Pixelmaske vor der Vermaschung druckgerecht
erweitert werden. Der Standardwert von 0,8 mm entspricht zwei Extrusionslinien
einer 0,4-mm-Düse. Diese Mindestbreite verändert Vorschau, STL und 3MF
gemeinsam und wird für eine typische 0,4-mm-Düse automatisch angewendet.
Bei aktiviertem Hintergrund wird die Vorschau aus dem vollständigen
wasserdichten Höhenkörper aufgebaut, nicht nur aus dessen Deckfläche. Dadurch
sind Boden, Seiten und erhabenes Motiv in Vorschau und Export identisch.
Für nicht transparente Logos interpoliert die Motiverkennung die erwartete
Hintergrundfarbe positionsabhängig aus den vier Bildecken. Gleichmäßige
Farbverläufe bleiben so auf Grundhöhe, während Schrift und Signet auf die
vollständige Reliefhöhe gesetzt werden.
Der Modus **Auf gut Glück** nutzt zusätzlich den Farbabstand der vier Ecken als
Verlaufsindikator. Bei einem Logo-Profil mit deutlichem Verlauf wechselt sie in
die Wordmark-Pipeline, aktiviert Hintergrund und Mindestbreite und nutzt 384
Rasterpunkte. Explizit ausgewählte Wappen werden mit 512 Rasterpunkten
analysiert und danach in echte Polygone überführt.

Die lokale Reparatur verändert den gewählten Modus nicht. Sie erzeugt für
Kontur- und Höhenverfahren mehrere Kandidaten mit unterschiedlicher Glättung in
reduzierter Prüfauflösung, bewertet Druckscore, erkannte Probleme und
Meshaufwand sowie eine quantitative Konturmetrik und rendert den besten Kandidaten anschließend in voller
Zielauflösung. Die Konturglättung wirkt bei Wappen direkt auf die Polygonringe,
nicht nur auf das Höhenfeld.

Wappen- und Schriftlogo-Referenzen sind als Golden Master versioniert. Die
Tests vergleichen neben Geometrie- und Konturwerten auch die SHA-256-Prüfsumme
des binären STL. Unbeabsichtigte Änderungen an der Exportgeometrie werden damit
vor einem Release sichtbar.

Meshbereinigung, Topologieprüfung und Konturmetrik liegen in einem separaten
Qualitätsmodul. Die eigentliche Reliefpipeline erhält dadurch nur validierte
Qualitätsergebnisse und bleibt unabhängig von UI und Dateidialogen.

Der Renderer speichert den aktuellen Studio-Eingabestand verzögert über eine
enge IPC-Methode. Der Hauptprozess schreibt atomar zunächst eine temporäre
Datei und ersetzt anschließend den letzten Wiederherstellungsstand. Nach einem
Neustart wird das eingebettete Quellbild wieder in einen lokalen temporären
Pfad materialisiert. Fertige Exportdateien werden bewusst nicht dupliziert.

Relieffehler erhalten eine lokale Diagnose-ID. Das Log enthält Zeitpunkt,
Verarbeitungsmodus, Profil, Dateiendung und technische Ursache, aber weder das
Bild noch seinen Pfad. Eine Übertragung findet nicht statt.

Die Renderer-Orchestrierung prüft Dreieckszahl und tatsächliche Puffergröße
nach jeder Erzeugung. Bei Überschreitung wird mit einer aus beiden Grenzwerten
berechneten Zielauflösung neu erzeugt. Unabhängig davon prüft der Hauptprozess
beim Speichern erneut und verweigert Dateien über 250.000 Dreiecken oder
25.000.000 Byte. Damit kann die UI diese Grenze nicht umgehen.

Bei explizit ausgewähltem **Wappen & Emblem** wird die Außenkontur des
Tragkörpers unabhängig von den inneren Farb- und Höhenflächen aufgebaut. Jede
binäre Farbmaske wird mit Marching Squares (`d3-contour`) in geschlossene
Polygonringe konvertiert, geglättet und mit Three.js/Earcut trianguliert. Boden,
Deckfläche und Seiten entstehen als gemeinsame solide Extrusion. Vorschau, STL
und 3MF verwenden dieselben Polygone; ein Rückfall auf die alte zellenweise
Rasterwand ist damit ausgeschlossen.

Schrift wird zunächst lokal als eng zugeschnittene transparente Vorlage
gerendert und anschließend durch dieselbe Reliefpipeline verarbeitet. SVG wird
beim Import sicher gerastert, bevor die Verarbeitung beginnt.

Lithophane verwenden dieselbe wasserdichte Meshpipeline und ergänzen sie vor
der Vermaschung um eine definierte Außenmaske. Rechteck,
abgerundetes Rechteck, Kreis, Wappen, Sechseck und Herz werden aus normierten
Koordinaten erzeugt; ein optionales Aufhängeloch wird direkt aus der Maske
ausgespart. Ein Rahmen hebt ausschließlich die äußere Maskenkante an. Die
Lithophan-Wölbung transformiert Vorschau, STL und 3MF mit derselben
Zylinderabbildung.

Die Vorschau besitzt bewusst mehrere Diagnosematerialien. Normalen- und
Drahtgitteransicht helfen bei Topologieproblemen, neutrale PLA-Materialien bei
der Formprüfung und die beleuchtete, teiltransparente Ansicht bei Lithophanen.
Originalbild und erzeugte Höhenkarte bleiben nebeneinander umschaltbar; damit
ist sichtbar, welche Information tatsächlich in die Geometrie eingeflossen ist.

## AMS- und 3MF-Aufbau

Die lokal erkannte Palette wird auf zwei bis acht frei definierbare
Filamentfarben abgebildet. Motivfarben werden als separate, 0,4 mm starke und
damit slicer-taugliche Deckkörper erzeugt. Diese Decklage liegt innerhalb der
eingestellten Gesamthöhe: Der Tragkörper endet 0,4 mm darunter und die Farbe
schließt exakt auf Sollhöhe ab.

Außenränder und Farbübergänge werden vor dem Meshaufbau der gewählten Farbe
**Seiten & Tragkörper** zugewiesen. Dadurch bleiben senkrechte Wände einfarbig.
Jede einzelne Farbmaske erhält dabei ihre eigene vektorisierte und geglättete
Kontur. Vorschau, STL und 3MF verwenden bei aktiviertem AMS dieselben
geschlossenen Farbkörper; so fällt der einfarbige STL-Fallback nicht auf die
alte Rasterkontur zurück. Im 3MF sind alle
Farbkörper Komponenten eines einzigen Assembly-Objekts; der Build-Bereich
enthält deshalb genau ein gemeinsames Modell in Millimetern. STL bleibt ein
einfarbiges Fallback.

Zusätzlich zu den standardisierten Basismaterialien trägt jedes Dreieck seine
Materialreferenz explizit. `Metadata/model_settings.config` ordnet die
Farbkörper den Extrudern zu und `Metadata/project_settings.config` übergibt die
Filamentpalette an Anycubic-/Orca-basierte Slicer. Die Core-3MF-Daten bleiben
dabei die interoperable Quelle für andere Programme.

## Prompt zu 3D

OpenAI erzeugt ausschließlich einen strukturierten Plan aus erlaubten
Grundkörpern. `electron/cad.ts` validiert Bauteilzahl, Koordinaten, Gesamtgröße
und Mindestmaterialstärke und erzeugt die Binär-STL lokal. Beliebiger Modellcode
wird nicht ausgeführt und fremde Mesh-Dateien werden nicht heruntergeladen.

Der Renderer baut aus demselben Plan eine lokale Three.js-Vorschau auf. Eine
Folgeanweisung überträgt den validierten Ausgangsplan zusammen mit der neuen
Anweisung an OpenAI. Die Antwort ist stets ein vollständiger Ersatzplan, wird
erneut validiert und als neue STL gespeichert. Vorherige Pläne bleiben während
des geöffneten Dialogs für Rückgängig erhalten.

Die Responses-API wird gestreamt. Der Main-Prozess leitet Phasen- und
Tokenereignisse per IPC an den Renderer weiter. Während des Streams werden
Texttoken näherungsweise erfasst; `response.completed.usage` ersetzt diese
Schätzung am Ende durch die gemeldeten Eingabe-, Cache- und Ausgabetoken. Der
angezeigte Prozentwert beschreibt den Arbeitsabschnitt und nicht die unbekannte
Restlaufzeit. Die Euroanzeige verwendet die hinterlegte Modellpreisliste und
einen ausdrücklich als Schätzung gekennzeichneten USD/EUR-Kurs.

Die Modellregistrierung in `electron/openai-usage.ts` ist die einzige Quelle
für erlaubte Modell-IDs und Preise. Der Renderer erhält eine reduzierte
Darstellung per IPC; jede Modellauswahl wird im Main-Prozess erneut gegen die
Allowlist geprüft. Dadurch kann das Frontend keine beliebigen Modellnamen an
die OpenAI-API weiterreichen.

Jeder Prompt-zu-3D-Auftrag erhält eine Diagnose-ID. Start, Abschluss oder Fehler
werden ohne Promptinhalt und ohne Zugangsdaten als JSONL unter dem
Electron-Logverzeichnis protokolliert. Bei Fehlern hält der Renderer zusätzlich
Modell, letzte Phase, Laufzeit und den verschachtelten Node-/Undici-Systemfehler
fest. Ein automatischer Retry ist bewusst nicht aktiv, da ein abgebrochener
Stream serverseitig bereits Token verbraucht haben kann.

Der Workflow ist für einfache konstruktive Modelle gedacht. Organische
Text-zu-3D-Rekonstruktion ist nicht Teil der aktuellen Architektur.

## Jobzustände und Verlauf

`validating → analysing → reconstructing → repairing → exporting → completed`

Der Renderer zeigt den aktuellen Zustand. Berechnete STL- und 3MF-Dateien
liegen zunächst ausschließlich im temporären Vorschauverzeichnis. Der Main
Process kopiert sie erst nach einer ausdrücklichen Benutzeraktion über den
nativen macOS-Speicherdialog an einen dauerhaften Ort. Beim nächsten App-Start
wird das Vorschauverzeichnis bereinigt. Im lokalen Verlauf bleiben nur
Metadaten, keine dauerhaften Modelldateien oder veralteten Dateipfade.

## Erweiterbarkeit

Die Studio-Werkzeuge **Bild zu 3D**, **Schrift zu 3D**, **Foto zu Lithophan**
und **Prompt zu 3D** sind
getrennte Einstiege mit gemeinsam genutzter Vorschau-, Parameter-, Prüf- und
Exportlogik. Neue Workflows sollen diesen Aufbau beibehalten.
Benutzerverwaltung, Telemetrie und Serverbetrieb gehören bewusst nicht zur
lokalen Desktop-Anwendung.

## Transparenz in der App

Der Hauptmenüpunkt **Über & Technik** erklärt die vier Arbeitswege, die
Verarbeitungspipeline, verwendete Frameworks und Modelle sowie Datenschutz und
fachliche Grenzen. Die Inhalte werden bewusst aus Anwendersicht formuliert,
damit lokale Verarbeitung und optionale OpenAI-Übertragung unterscheidbar
bleiben. Die vorbereitende Checkliste für eine Store-Veröffentlichung steht in
[APP_STORE_CHECKLIST.md](APP_STORE_CHECKLIST.md).
