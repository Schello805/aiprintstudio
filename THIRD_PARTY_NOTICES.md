# Drittanbieter-Hinweise

AI Print Studio lädt keine externen 3D-Modellgewichte oder ausführbaren
KI-Komponenten nach. Frühere experimentelle Modellgewichte werden beim ersten
Start einer aktuellen Version automatisch aus dem App-Datenordner entfernt.

## Marken und Referenzbilder

Marken-, Hersteller- und Produktnamen dienen ausschließlich der Beschreibung.
AI Print Studio ist mit den genannten Rechteinhabern weder verbunden noch von
ihnen autorisiert. KI-generierte oder öffentlich gefundene Referenzen sind keine
offiziellen CAD-Daten. Vor dem Verwenden fremder Bilder, Designs oder Marken
müssen Bild-, Design-, Urheber- und Markenrechte geprüft werden.

## Vektorkonturen

Für die lokale Polygonisierung von Bildmasken verwendet AI Print Studio
`d3-contour` (ISC). Die Triangulation der geschlossenen Konturen erfolgt über
`ShapeUtils.triangulateShape` beziehungsweise Earcut aus Three.js (MIT). Die
robuste Vereinigung der gestapelten Wappen-Volumen verwendet Manifold
(Apache-2.0). Die Geometrieengine läuft vollständig lokal als WebAssembly.
Bibliotheken verarbeiten ausschließlich lokale Geometriedaten.
