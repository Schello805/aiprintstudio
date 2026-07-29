# Changelog

## Unveröffentlicht

- Fehlgeschlagene Prompt-zu-3D-Aufträge zeigen jetzt Diagnose-ID, letzte Phase,
  Modell, Laufzeit und die technische Netzwerkursache direkt im Dialog.
- Ein datensparsames JSONL-Protokoll kann aus der Fehlermeldung im Finder
  geöffnet werden. API-Schlüssel und Promptinhalt werden nicht protokolliert.
- Netzwerkfehler werden nicht mehr als unverständliches `fetch failed`
  ausgegeben. Eine bewusste Wiederholung ist möglich; automatische
  Wiederholungen bleiben zum Schutz vor doppelten API-Kosten deaktiviert.
- **Prompt zu 3D** bietet ein Modell-Dropdown mit GPT-5.6 Sol, Terra und Luna.
  Qualitätsschwerpunkt, Beschreibung, offizielle Tokenpreise und ein typischer
  Eurobetrag werden direkt vor der Erstellung angezeigt.
- Terra ist als ausgewogene Standardauswahl voreingestellt. Die letzte Auswahl
  bleibt lokal erhalten und wird serverseitig gegen die unterstützte
  Modellliste validiert.
- **Prompt zu 3D** verarbeitet OpenAI-Antworten jetzt als Stream. Ein
  Fortschrittsbalken zeigt den geschätzten Arbeitsabschnitt von Verbindung,
  Konstruktion, Validierung und lokalem STL-Export.
- Die laufende Kostenanzeige schätzt den Eurobetrag während der Antwort aus
  Eingabe- und Ausgabetoken. Nach Abschluss wird sie mit den von OpenAI
  gemeldeten Token korrigiert und zeigt die Werte neben dem Ergebnis.
- Fortschritt und Kosten sind bewusst als Schätzwerte gekennzeichnet: OpenAI
  liefert keinen exakten Gesamtfortschritt, und die Euroanzeige verwendet einen
  festen USD/EUR-Schätzkurs.
- **Prompt zu 3D** erkennt einen gespeicherten, nach dem App-Neustart noch
  gesperrten OpenAI-Schlüssel und zeigt das Passwortfeld jetzt direkt im
  Prompt-Dialog. Nach dem Entsperren kann das Modell ohne Umweg erstellt werden.
- Fehlermeldungen unterscheiden eindeutig zwischen „nicht eingerichtet“ und
  „verschlüsselt gespeichert, aber für diese Sitzung gesperrt“.
- Die neue neutrale Exportoption **Auf 250.000 Dreiecke reduzieren** passt die
  Auflösung nur bei Bedarf automatisch an und erleichtert den Import in
  Programme mit begrenzter Meshgröße.
- Der Druckscore kennzeichnet Modelle über 250.000 Dreiecken jetzt sichtbar,
  statt trotz möglicher Importgrenzen 100/100 anzuzeigen.
- Erhabene Bereiche von Logos mit Hintergrund werden als echte gestufte
  Extrusion mit senkrechten Wänden aufgebaut. Schräge Übergangsdreiecke und
  dadurch sichtbare Spitzen an Motivenden entfallen in Vorschau, STL und 3MF.
- Logo-Hintergründe werden nicht mehr nur aus vier Eckfarben geschätzt: Ein
  robustes quadratisches Flächenmodell erkennt jetzt auch radiale Verläufe und
  Vignetten, sodass deren Bildmitte nicht versehentlich erhaben wird.
- Die Prozentanzeige der Reliefberechnung besitzt neben dem Fortschrittsbalken
  einen festen Platz und bleibt auch bei 100 % vollständig lesbar.
- Studio-Stände lassen sich als portable `.aips`-Projektdateien speichern und
  mit Quelle, Einstellungen, AMS-Farben und manuellen Korrekturen wieder öffnen.
- Der Druckscore bietet eine bestätigungspflichtige automatische Reparatur:
  Mindestbreiten werden auf 0,8 mm optimiert, die Grundplatte stabilisiert,
  zusammengehörige Logo-Elemente verbunden und übergroße Meshes reduziert.
- Eine lokale Schichtsimulation zeigt Schichtzahl, geschätzte Druckzeit,
  Filamentlänge, Materialgewicht und Farbwechsel ohne Cloud- oder API-Aufruf.
- Der Flächeneditor besitzt freie Pinsel- und Radierwerkzeuge für Höhe und
  AMS-Farbe sowie sichtbare Aktionen zum Verbinden und Trennen von Bereichen.
- **Automatisch** erkennt Verlaufslogos jetzt selbstständig als Logo mit
  Hintergrund, aktiviert die 0,8-mm-Mindestbreite und verwendet eine
  slicerfreundliche Logoauflösung. Beim Referenzlogo sinkt das Mesh von rund
  833.000 auf 590.000 Dreiecke und wird zu einem zusammenhängenden Körper.
- Ein positionsabhängiges Hintergrundmodell trennt Logo-Motive jetzt auch bei
  vertikalen und diagonalen Farbverläufen klar von der Grundfläche.
- Logos mit aktiviertem Hintergrund werden auch in der 3D-Vorschau als
  vollständiger massiver Körper mit Boden und Seitenwänden dargestellt.
- Eine robustere Vordergrundschwelle trennt Schrift und Signet klarer von
  typischen grauen Hintergrundverläufen und Schatten.
- Die feste Seitenleiste zeigt live die CPU-Last und den RAM-Verbrauch aller
  AI-Print-Studio-Prozesse. Die Messung aktualisiert sich alle 1,5 Sekunden und
  kennzeichnet laufende Berechnungen.
- Der Kostenhinweis besitzt einen eigenen Layoutplatz und überlappt nicht mehr
  mit **Mehrfoto-Scan** oder anderen Einstellungen.
- Toggle-Schalter zeigen ihren Schaltpunkt in beiden Zuständen zuverlässig.
- **Logo mit Text** kann feine Stege standardmäßig auf 0,8 mm verstärken. Das
  entspricht zwei Linien mit der üblichen 0,4-mm-Düse und lässt sich vor der
  Erstellung bewusst deaktivieren.
- 3MF-Dateien dokumentieren 0,4 mm als bevorzugte Düsengröße; STL und 3MF
  erhalten dieselbe druckoptimierte Geometrie.
- **Logo mit Text** bietet jetzt den Schalter **Hintergrund mitdrucken**.
  Vorschau, STL und 3MF verwenden gemeinsam entweder eine geschlossene
  Grundplatte oder ein freigestelltes Motiv.
- Einfarbige Textlogos mit Hintergrund erhalten klare, binäre Höhen: Die
  Grundfläche bleibt auf der eingestellten Plattendicke, Signet und Schrift
  werden um die vollständige Reliefhöhe angehoben.
- Die AMS-Vorschau zeigt bei Wappen für Nicht-Trägerfarben nur noch die
  tatsächlichen Deckflächen. Unterseiten und innere Seitenwände bleiben dadurch
  vollständig in der gewählten Trägerfarbe geschlossen.
- Fortschritt, Abbruch und Exportergebnis stehen jetzt durchgehend direkt unter
  der 3D-Vorschau; nach Abschluss erscheint dort der Finder-Button.
- Reliefberechnungen laufen in einem eigenen Worker und können über einen
  sichtbaren **Abbrechen**-Button tatsächlich beendet werden.
- Ein animierter 3D-Spinner zeigt Phase, Beschreibung und prozentualen
  Fortschritt von Analyse, Meshaufbau, Prüfung und Export.
- Große Mehrfarben-Wappen werden ohne riesige Spread-Aufrufe aufgebaut; dadurch
  tritt `Maximum call stack size exceeded` nicht mehr auf.
- Die Wappen-Unterseite zeigt nur den vollständig gefüllten Tragkörper.
  Interne Unterseiten der Farbdecklagen werden in der Vorschau ausgeblendet.
- Auch mehrfarbige Textlogos werden in der Vorschau als vollständige Körper mit
  Boden und Seitenflächen angezeigt und liegen sichtbar auf dem Raster.
- Die 0,4-mm-AMS-Farbdecklage liegt innerhalb der gewählten Reliefhöhe statt
  diese um weitere 0,4 mm zu überschreiten.
- Freigestellte Textlogos sind insgesamt exakt so hoch wie der eingestellte
  Reliefwert; die Grundplattendicke wird ohne vorhandene Platte nicht addiert.
- Die 3D-Vorschau zeigt bei flachen Logos jetzt Deckfläche, Seiten und Boden,
  sodass das Modell sichtbar auf dem Raster steht statt zu schweben.
- STL und 3MF spiegeln die Bild-Y-Achse beim Export korrekt, sodass Schrift und
  Logos im Slicer genauso aufrecht liegen wie in der 3D-Vorschau.
- Die Dreiecksorientierung wird bei der Achsenkorrektur mitgedreht; Ober- und
  Unterseiten behalten gültige Normalen.
- **Wappen & Emblem** und **Logo mit Text** sind getrennte Ergebnisarten:
  Wappen behalten eingeschlossene Flächen, Textlogos öffnen Buchstabenräume.
- Hintergrundfarbene Innenräume von a, e, d, o, ö und ähnlichen Zeichen werden
  im Textlogo-Modus zuverlässig aus dem Mesh entfernt.
- Filigrane Wort- und Signet-Logos werden als gemeinsame ebene Reliefhöhe
  rekonstruiert; Kantenglättungsfarben erzeugen keine Spitzen mehr.
- Dünne Buchstaben und geschwungene Linien bleiben in der Logo-Maske erhalten.
- Ein Regressionstest bildet ein mehrfarbiges medizinisches Wortlogo mit
  dünner Schreibschrift und Signet nach.
- Offizielle macOS-Releases verlangen jetzt zwingend eine echte
  Developer-ID-Signatur und überschreiben sie nicht mehr versehentlich mit
  einer Ad-hoc-Signatur.
- Hardened Runtime und die benötigten Electron-Entitlements sind konfiguriert.
- Die Release-Pipeline notarisiert das DMG bei Apple, heftet das Ticket an und
  prüft Signatur sowie Gatekeeper vor der Veröffentlichung.
- Fehlen Zertifikat oder Notarisierungszugang, wird kein unsicherer offizieller
  Release mehr erzeugt.

## 0.15.1

- Die 3D-Vorschau behält bei Logo-Modellen die volle Rasterauflösung bei,
  sodass Rundungen nicht erneut durch Vorschau-Downsampling kantig werden.
- Sidebar und macOS-Titelleiste bleiben auf allen Hauptseiten fixiert; nur der
  rechte Inhaltsbereich scrollt.
- Ein Regressionstest schützt die hochauflösende Logo-Vorschau.

## 0.15.0

- Der neue Hauptmenüpunkt **Über & Technik** erklärt Bild-, Schrift- und
  Prompt-Workflows sowie die fünfstufige Verarbeitungspipeline.
- Eine technische Übersicht nennt die tatsächlich verwendeten Frameworks,
  Modelle, Werkzeuge und Lizenzen.
- Datenschutz, lokale Verarbeitung, optionale OpenAI-Nutzung und fachliche
  Grenzen werden direkt in der App verständlich beschrieben.
- Eine separate Mac-App-Store-Checkliste dokumentiert rechtliche Pflichtfelder,
  Datenschutz, EU-Händlerstatus, Verschlüsselung und technische Store-Arbeiten.

## 0.14.3

- Beim Wechsel zwischen Studio, Verlauf und Einstellungen bleiben Bild,
  Parameter, Farbauswahl, Editoränderungen und Ergebnis erhalten.
- Ein erneuter Klick auf Studio kehrt zum zuletzt geöffneten Werkzeug zurück,
  statt ungefragt die Werkzeugübersicht zu öffnen.
- Vor **Alle Werkzeuge** warnt die App, wenn dadurch ein aktueller Studio-Stand
  verworfen würde.

## 0.14.2

- Die native macOS-Farbpalette bleibt beim Verschieben und Anklicken geöffnet.
- Farbfelder behalten beim Ändern des Farbwerts ihre stabile React-Identität
  und werden nicht mehr nach jeder Eingabe neu erzeugt.

## 0.14.1

- Außenkonturen durchlaufen mehr sanfte Glättungsschritte, sodass regelmäßige
  Pixelwellen und Zähne an geraden sowie gerundeten Rändern verschwinden.
- Die 3D-Vorschau verwendet eine deutlich höhere Konturauflösung und erzeugt
  beim Downsampling keine neuen sichtbaren Wellen mehr.
- Der Regressionstest für kreisförmige Konturen akzeptiert nur noch halb so
  große Radiusabweichungen wie zuvor.

## 0.14.0

- Der OpenAI-Key kann dauerhaft lokal gespeichert werden, ohne auf den
  macOS-Schlüsselbund oder das Mac-Passwort zuzugreifen.
- Ein selbst gewähltes AI-Print-Studio-Passwort wird mit `scrypt` in einen
  Schlüssel abgeleitet; AES-256-GCM verschlüsselt und authentifiziert den API-Key.
- Gespeichert werden ausschließlich Salt, Nonce, Authentifizierungstag und
  Chiffretext. Das App-Passwort wird nie gespeichert.
- Nach einem Neustart entsperrt der Nutzer den Tresor mit seinem App-Passwort.
- Der Einrichtungsdialog erklärt vor der Eingabe eindeutig Speicherung,
  Passwortverlust und den Verzicht auf den macOS-Schlüsselbund.
- Falsche Passwörter und veränderte Tresordaten werden mit einer einheitlichen
  Fehlermeldung abgewiesen.

## 0.13.9

- Der OpenAI-API-Schlüssel wird nicht mehr im macOS-Schlüsselbund gespeichert.
- Der Schlüssel bleibt ausschließlich im Arbeitsspeicher der aktuellen
  App-Sitzung und wird beim Beenden verworfen.
- Dadurch benötigt AI Print Studio keinen Zugriff auf gespeicherte Passwörter
  und macOS zeigt keine Schlüsselbund-Passwortabfrage mehr an.
- Die Einstellungen erklären vor der Eingabe klar die Sitzungsspeicherung und
  weisen darauf hin, dass der Schlüssel nach einem Neustart erneut einzugeben ist.
- Alte verschlüsselte Schlüsselwerte werden ohne Entschlüsselung aus der lokalen
  App-Konfiguration entfernt.

## 0.13.8

- Ein lokaler Systemcheck prüft vor dem Laden des Studios Plattform,
  Apple-Silicon-Architektur, macOS-Version, RAM, freien Speicher und native
  KI-Komponenten.
- Nicht unterstützte Systeme erhalten eine konkrete Abbruchmeldung; bei knappen
  Ressourcen kann der Nutzer bewusst fortfahren oder die App beenden.
- Die README enthält vor der Funktionsbeschreibung eine übersichtliche
  Kompatibilitätsmatrix und eine einfache Schnellprüfung.
- Native Core-ML- und Object-Capture-Worker werden ausdrücklich für macOS 13
  statt versehentlich für die SDK-Version des Build-Macs kompiliert.
- Das App-Bundle deklariert macOS 13.0 als Mindestversion.

## 0.13.7

- Filament-Presets in Anycubic-/Orca-basierten Slicern heißen jetzt
  **AI Print Studio** statt wie die importierte 3MF-Datei.
- Auch das eingebettete Prozessprofil verwendet den kurzen Namen
  **AI Print Studio**.

## 0.13.6

- Mehrfarbige 3MF-Projekte heißen im Slicer einheitlich und kompakt
  **AI Print Studio**.
- Der lange Name der Bilddatei wird nicht mehr als sichtbarer Modell- oder
  Profilname in den 3MF-Metadaten verwendet.

## 0.13.5

- Sekundäre Aktionen wie **Alle Werkzeuge**, **Erweiterte Einstellungen** und
  **Motivbereiche manuell korrigieren** besitzen größere Klickflächen,
  kontrastreiche Hintergründe und klar erkennbare Rahmen.
- Primäre, sekundäre und Einstellungsbuttons verwenden einheitliche
  Hover-, Fokus- und Aktivzustände.
- Werkzeuge im Flächeneditor sind größer und leichter lesbar.
- Die linke Hauptnavigation hebt Studio, Verlauf und Einstellungen deutlicher
  als interaktive Bereiche hervor.
- Die stärkere Buttonhierarchie kommt ohne zusätzliche Inhaltsblöcke aus und
  vergrößert den Scrollumfang nur minimal.

## 0.13.4

- Mehrfarbige 3MF-Dateien enthalten zusätzlich zur Objektfarbe eine explizite
  Materialreferenz an jedem Dreieck.
- Anycubic-/Orca-Projektmetadaten ordnen jeden Farbkörper dem richtigen
  Extruder beziehungsweise Filamentplatz zu.
- Die in AI Print Studio gewählte Palette wird als Projektpalette übernommen,
  sodass Anycubic Slicer Next Rot, Weiß, Schwarz und Gelb nicht mehr gesammelt
  als Filament 1 lädt.
- Ein echter Roundtrip mit dem lokal installierten Anycubic-Slicer-Parser
  bestätigt vier erhaltene Farben und die Extruderzuordnung 1–4.

## 0.13.3

- Original und 3D-Vorschau bleiben nach der Modellerstellung beim Scrollen
  sichtbar; die Vorschaufläche wurde für kleinere Displays kompakter gestaltet.
- Druckscore, Modellmaße, Prüfungen und Finder-Aktion stehen jetzt unmittelbar
  unter der 3D-Vorschau statt am Seitenende.
- Prompt zu 3D zeigt transparent an, dass jede Erstellung und Folgeänderung über
  den eigenen OpenAI-API-Account abgerechnet wird.
- Transparente, monochrome Schrift wird als plane Extrusion erkannt.
  Halbtransparente Antialias-Randpixel erzeugen keine welligen Höhen oder
  abgesenkten Buchstabenkanten mehr.
- Ein Integrationstest prüft die einheitliche Deckhöhe antialiaster Schrift.

## 0.13.2

- Mehrfarbige 3MF-Dateien werden als ein gemeinsames Assembly mit mehreren
  Materialkomponenten exportiert, statt jeden Farbkörper als separates
  Hauptobjekt zu laden.
- Der 3MF-Build-Bereich enthält genau ein Modell und weist Millimeter explizit
  als Einheit aus. Dadurch entfallen die Anycubic-Rückfragen zu Skalierung und
  getrennt positionierten Objekten.
- Farbige Deckkörper sind nun 0,4 mm stark und damit bei einer üblichen
  Schichthöhe von 0,2 mm zuverlässig druck- und slicebar.
- Regressionstests prüfen Assembly-Struktur, Komponentenanzahl und die neue
  Farbkörperstärke.

## 0.13.1

- Das neue AI-Print-Studio-Logo wird als offizielles macOS-App- und Finder-Icon verwendet.
- Die Seitenleiste verwendet das abgeleitete grün-blaue Bild-/Würfel-Signet statt des bisherigen generischen Ebenen-Symbols.
- Das hochauflösende 1024×1024-Original wird beim macOS-Paketbau explizit als Iconquelle verwendet.

## 0.13.0

- Prompt zu 3D zeigt das erzeugte CAD-Modell unmittelbar als dreh- und zoombare lokale 3D-Vorschau.
- Folgeanweisungen überarbeiten den bestehenden CAD-Bauplan, statt ein neues Modell ohne Kontext zu erzeugen.
- Nicht ausdrücklich geänderte Bauteile sollen bei Revisionen erhalten bleiben; jede Antwort liefert einen vollständig validierten Ersatzplan.
- Frühere Revisionen lassen sich im geöffneten Dialog schrittweise wiederherstellen.
- Bauteile wie Dächer, Fenster und Türen erhalten in der Vorschau unterscheidbare Materialien.
- Jede Revision erzeugt lokal eine neue STL und kann direkt im Finder geöffnet werden.
- Datenschutztext und CAD-Validierung berücksichtigen den bei Folgeanweisungen übertragenen Ausgangsplan.

## 0.12.4

- Lokal gerenderte Schrift wird in der Originalvorschau reinweiß statt fast schwarz dargestellt.
- Der Hintergrund der Schriftvorlage bleibt vollständig transparent.
- Antialias-Randpixel werden vor der Reliefverarbeitung in eine saubere binäre Alphakontur überführt.
- Einfarbige Schrift erhält eine einheitliche Reliefhöhe, damit an diagonalen Buchstabenenden wie beim „M“ keine erhöhten Spitzen entstehen.
- Neue Regressionstests prüfen weiße Pixel, transparente Binärkonturen und einheitliche Schrifthöhen.

## 0.12.3

- Die vereinfachte 3D-Vorschau stabilisiert Randfarben erst nach dem Herunterskalieren des Meshrasters.
- Außenwände bleiben dadurch auch bei hochauflösenden und gekrümmten Motiven vollständig in der gewählten Farbe „Seiten & Tragkörper“.
- Diagonale Randkontakte werden zusätzlich berücksichtigt, damit an schrägen Konturen keine einzelnen Fremdfarben sichtbar bleiben.
- Ein Regressionstest prüft, dass eine farbige Innenfläche erhalten bleibt, während die Vorschau-Außenkante einfarbig dargestellt wird.

## 0.12.2

- Außenkanten und Farbübergänge werden konsequent der gewählten Farbe „Seiten & Tragkörper“ zugewiesen.
- Der einfarbige Tragkörper reicht nun bis zur vollständigen Motivhöhe statt 0,6 mm unter der Oberfläche zu enden.
- AMS-Farben bilden nur noch eine 0,04 mm dünne Decklage auf horizontalen Oberflächen.
- Sichtbare rot-weiß-schwarze Streifen und überlappende Farbflächen an senkrechten Kanten werden vermieden.
- Die 3D-Vorschau verwendet dieselbe stabilisierte Farbzuordnung wie der 3MF-Export.
- Ein neuer Regressionstest schützt einfarbige Außen- und Motivkanten.
- README, Architektur-, Entwicklungs-, Sicherheits- und Roadmap-Dokumentation wurden auf den aktuellen Studio-, OpenAI-, AMS- und Release-Stand gebracht.

## 0.12.1

- Info-Symbole verwenden ein optisch exakt zentriertes „i“ statt eines innerhalb kleiner Kreise versetzten SVG-Icons.
- Der Höhenregler aktualisiert die 3D-Vorschau flüssig während des Ziehens.
- Eine komplette Reglerbewegung erzeugt nur noch einen Undo-Schritt statt einer Änderung pro Pixel.
- Pointer-Cancel und Tastaturbedienung schließen eine Regleränderung zuverlässig ab.
- Der größere interaktive Reglerbereich verbessert Treffen und Ziehen mit Maus oder Trackpad.
- Ohne aktive Auswahl erklärt die Statuszeile eindeutig, warum der Regler deaktiviert ist.
- „Motiv automatisch auswählen“ aktiviert mit einem Klick alle erkannten Motivflächen.

## 0.12.0

- Meshy wurde vollständig aus Konfiguration, Oberfläche und aktivem Netzwerkpfad entfernt.
- „Prompt zu 3D“ benötigt nur noch den bereits vorhandenen OpenAI API-Schlüssel.
- GPT-5.6 Sol erzeugt über Structured Outputs einen strikt validierten, druckgerechten CAD-Bauplan.
- Die App konstruiert Geometrie und Binär-STL anschließend vollständig lokal.
- Der lokale CAD-Kern unterstützt Quader, hochauflösende Zylinder und Satteldach-Prismen.
- OpenAI-Ausgaben werden auf Bauteilzahl, Koordinaten, Gesamtgröße und mindestens 1,2 mm Materialstärke geprüft.
- Prompt-Dialog, Datenschutztext und Einstellungen erklären den OpenAI-only-Workflow eindeutig.
- 31 Tests prüfen jetzt zusätzlich CAD-Validierung und STL-Erzeugung.

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
