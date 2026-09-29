# VG-06: Caritas-Schichtzulagensatzabfrage (DRAFT)

Stand: 29.09.2026. Die reine Abfrage liest einen datierten Satzdatensatz
nach Anlage 31/32 und regionalem Tarifgebiet aus einem validierten
Caritas-Paket des Vertrags 14. Sie liefert alle vier getrennten Werte
für ständige und nichtständige Wechsel- beziehungsweise Schichtarbeit
sowie Paket-, Satz- und Quellenkennungen.

Die Satzquellen und Gültigkeitsfenster sind in den bestehenden Belegen
für [West](vg06-caritas-west-schichtzulagensätze.md) und
[RK Ost](vg06-caritas-ost-schichtzulagensätze.md) dokumentiert.
Für RK Ost vor dem 01.07.2025 wird kein Satz behauptet. Außerhalb der
Paketgültigkeit, bei unbekannter Auswahl, fehlendem Satz oder ungültigem
Paket liefert die Abfrage ausdrücklich „nicht verfügbar“.

Der Test prüft alle fünf westlichen Regionalkommissionen in beiden
Zeiträumen und Anlagen, alle drei Ost-Tarifgebiete, die zeitlichen
Grenzen und fehlerhafte Pakete. Der Rückgabewert entscheidet keinen
persönlichen Anspruch, verrechnet keine Stunden und bildet kein
vollständiges Monatsbrutto. Die Caritas-Fähigkeiten bleiben DRAFT/
UNSUPPORTED; weder App-Anbindung noch OTA gehören zu diesem Paket.
