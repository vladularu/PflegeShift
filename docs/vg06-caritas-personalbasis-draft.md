# VG-06: datierte persönliche Caritas-Tabellenbasis (DRAFT)

Stand: 25.09.2026. Die AVR-Anlagen 31 und 32 regeln in § 12a den Anteil
des Tabellenentgelts nach der individuell vereinbarten durchschnittlichen
Arbeitszeit im Verhältnis zur regelmäßigen Arbeitszeit vergleichbarer
Vollzeitbeschäftigter. Grundlage sind die
[offizielle AVR-Fassung mit Stand 01.07.2025](https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/AVR-PDF_Version_2025.pdf)
und die [Erläuterung der Caritas-Dienstgeber zu Dienstbezügen und Teilzeit](https://caritas-dienstgeber.de/detail-news/avr-erklaert-teil-7-dienstbezuege/).
Die getrennten Quellen für gedruckte Tabellenwerte und regionale
Vollzeitwochenzeit stehen in vg06-caritas-quellentabellen.md,
vg06-caritas-west-arbeitszeit-draft.md und
vg06-caritas-ost-arbeitszeit-draft.md.

calculateCaritasCareDraftBase verlangt Datum, Anlage, Tarifgebiet, P-Gruppe,
Stufe und ausdrücklich vereinbarte Wochenminuten. Es verwendet nur ein
validiertes DRAFT-Paket. Der Betrag ist der gedruckte Vollzeit-Tabellenwert
multipliziert mit den vereinbarten Wochenminuten, geteilt durch die datierte
Vollzeit-Wochenzeit desselben Pakets. Erst das Cent-Ergebnis wird technisch
mit HALF_UP gerundet; aus § 12a wird keine eigene Rundungsvorschrift
abgeleitet. Tabellen-, Arbeitszeitregel- und Quellenkennungen bleiben
erhalten. Ungültige Eingaben und fehlende Quellen liefern einen
Nicht-verfügbar-Grund.

Feste Referenzfälle prüfen unter anderem P6/Stufe 1 mit 30 Wochenstunden:
BW 2025 2.254,18 Euro, Bayern 2025 2.283,46 Euro und Berlin in
Anlage 31 vor/nach dem 01.07.2025 2.223,81/2.252,69 Euro.
Die 2026er BW-Halbzeit ergibt 1.506,25 Euro und prüft die Rundung
eines halben Cents. Alle fünf West-Regionen in beiden Tabellenzeiträumen
und beiden Anlagen werden auch bei Vollzeit geprüft.

Dies ist nur ein datierter Tabellenbestandteil. Geleistete Dienststunden
ersetzen keine vereinbarte Wochenarbeitszeit. Teilmonate, wechselnde
persönliche Verträge, Pflege- und Schichtzulagen, Zeitzuschläge,
Überstunden, Jahressonderzahlung und vollständiges Brutto sind nicht
enthalten. Die Funktion ist nicht mit Profil, Auswertung, Tarifresolver
oder Remote-Katalogaktivierung verbunden. Die Caritas-Pakete bleiben
DRAFT und die Berechnungsfähigkeiten UNSUPPORTED; eine fachliche
Freigabe und weitere Referenzfälle stehen aus.
