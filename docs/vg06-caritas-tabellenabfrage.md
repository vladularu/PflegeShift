# VG-06: datierte Caritas-Pflege-Tabellenabfrage

Stand: 24.09.2026. `lookupCaritasCareTable` liest aus einem vollständig
validierten DRAFT-Paket den gedruckten monatlichen **Vollzeit-Tabellenwert**.
Die Abfrage verlangt Datum, Anlage, Region beziehungsweise Tarifgebiet,
P-Gruppe und Stufe. Sie liefert Tabellenkennung und Quellen-IDs mit oder
einen ausdrücklichen Grund für einen nicht verfügbaren Wert.

Die Funktion verwendet nur Engine-Vertrag 14 und die expliziten
Tabellenzeiger der regionalen Caritas-Pakete. Tests belegen beide
West-Stichtage, die abweichende 2025er Ost-Tabelle für Anlage 32 im
Tarifgebiet Ost, die gemeinsame 2026er Ost-Tabelle, fehlende Stufen,
ungültige Daten, Gültigkeitsgrenzen und ein manipuliertes Paket. Die
gedruckten Werte und Primärquellen stehen in
`vg06-caritas-quellentabellen.md`,
`vg06-caritas-west-draft.md` und `vg06-caritas-ost-draft.md`.

Dies ist keine persönliche Gehaltsberechnung. Teilzeitquote,
Vollzeit-Wochenstunden, Zulagen, Zeitzuschläge, Überstunden,
Sonderzahlung und persönliche Ansprüche werden weder angenommen noch
berechnet. Die Funktion ist nicht an Profil, Auswertung oder
Katalogaktivierung angeschlossen; Version 14 bleibt außerhalb der
Remote-Engine-Allowlist. Für einen persönlichen Tabellenbetrag folgt ein
getrenntes Paket mit datierter regionaler Arbeitszeitbasis und
quellengebundener Teilzeitregel.
