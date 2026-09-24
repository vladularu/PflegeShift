# VG-06: Caritas-Pflege-Tabellenpakete der RK Ost

Stand: 24.09.2026. Zwei regionale `DRAFT`-Kandidaten binden die gedruckten
P-Monatstabellen der RK Ost für 2025 und 2026 an Anlagen 31 und 32 sowie
die Tarifgebiete Ost, West/Berlin und West/Hamburg. Es gibt keine
persönliche Gehaltsberechnung oder Veröffentlichung.

Die [RK-Ost-Langfassung mit Werten 2025](https://www.caritas.de/cms/contents/caritas.de/medien/dokumente/arbeitsrechtliche-ko/beschluesse/beschluesse-regional/2023-07-05-langfassu1/2023-07-05_langfassungeckpunktebeschlussrkostbeschlussdez.2019_werte_2025_gez.pdf?d=a&f=pdf)
zeigt für Anlage 32/Tarifgebiet Ost eine eigene P-Tabelle. Anlage 31 und
Anlage 32/Tarifgebiet West verwenden die gemeinsame 2025er Tabelle.
Die [RK-Ost-Langfassung mit Werten 2026](https://www.caritas.de/cms/contents/caritas.de/medien/dokumente/arbeitsrechtliche-ko/beschluesse/beschluesse-regional/2025-06-26-langfassu/2025-06-26_langfassungeckpunktebeschlussrkostbeschlussdez.2019_werte_2026_gez.pdf?d=a&f=pdf)
enthält dieselben P-Werte für beide Anlagen und Tarifgebiete. Die
transkribierten CSV-Dateien und ihre SHA-256 stehen in
`vg06-caritas-quellentabellen.md`.

Der Pakettest gleicht die 124 unterschiedlichen 2025er Werte und die 62
2026er Werte mit den CSV-Dateien ab und prüft alle Tabellenzeiger. Jede
Tabelle enthält P4 und P6 in Stufen 1–6 sowie P7–P16 in Stufen 2–6; P5
gehört nicht dazu. Die zweite Paketquelle ist allein die vom Schema
vorgeschriebene, hier nicht ausgeführte Produktheuristik für
`workPatternPolicy`, keine Caritas-Rechtsquelle.

Alle Berechnungsfähigkeiten bleiben `UNSUPPORTED`, der Status `DRAFT` und
Engine-Vertragsversion 14 außerhalb der Remote-Allowlist. Arbeitszeit,
Teilzeit, Zuschläge, Zulagen, Überstunden, Sonderzahlung und AVR 2027
benötigen eigene quellengestützte Regeln und fachliche Abnahme. Die beiden
Pakete zeigen deshalb noch kein Caritas-Gehalt in der App.
