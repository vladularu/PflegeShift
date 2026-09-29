# VG-06: Caritas-Zeitzuschlagssatzabfrage (DRAFT)

Stand: 29.09.2026. Die reine Abfrage liest für Datum, Anlage 31/32 und
regionales Tarifgebiet genau einen Satzdatensatz aus einem validierten
Caritas-Paket des Vertrags 14. Sie liefert sechs Grundprozentsätze in
Basispunkten, die Bezugsstufe 3 sowie Paket-, Satz- und Quellenkennungen.

Die fachliche Bedeutung der Sätze ist im
[Vertrag](vg06-caritas-zeitzuschlagsvertrag.md) festgehalten. Die datierten
Quellen und Gültigkeitsfenster stehen in den Belegen für
[West](vg06-caritas-west-zeitzuschlagssaetze.md) und
[RK Ost](vg06-caritas-ost-zeitzuschlagssaetze.md). Bei West beginnt das
Paket am 01.07.2025; bei RK Ost sind auch Januar bis Juni 2025 belegt.
Außerhalb der Paketgültigkeit, bei unbekannter Auswahl, fehlendem Satz oder
ungültigem Paket liefert die Abfrage ausdrücklich „nicht verfügbar“.

Der Test prüft alle 42 datierten DRAFT-Sätze, die Jahresquellen, beide Anlagen,
fünf westliche Regionalkommissionen und drei Ost-Tarifgebiete sowie
Zeitgrenzen und fehlerhafte Pakete. Die Abfrage entscheidet weder über
persönliche Zuschlagsstunden und Feiertagsarten noch über Ansprüche,
Kombinationen oder ein Monatsbrutto. Alle Caritas-Fähigkeiten bleiben
`UNSUPPORTED`; App-Anbindung und OTA gehören nicht zu diesem Paket.
