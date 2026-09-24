# VG-06: westliche Caritas-Pflege-Tabellenpakete

Stand: 24.09.2026. Zehn regionale `DRAFT`-Kandidaten binden die bereits
geprüften P-Monatswerte an die fünf westlichen Regionalkommissionen. Jede
Kommission hat ein Paket für 01.07.2025–31.01.2026 und eines für
01.02.–31.12.2026. Die Werte gelten für Anlagen 31 und 32; jede Anlage hat
eine eigene Auswahl und einen ausdrücklichen Tabellenzeiger.

Die [korrigierte Bundeskommission-Fassung](https://caritas-dienstgeber.de/fileadmin/Beschluesse/BK/02_BK_2025-02_Beschluss_Allgemeine_Tarifrunde_Caritas_2025_Teil_1_gezeichnet_korrigiert.pdf)
enthält die P-Tabellen. Die regionalen Übernahmen sind in den Beschlüssen
für [Baden-Württemberg](https://caritas-dienstgeber.de/fileadmin/Beschluesse/RK_BW/2025-06-24_Beschluss_RKBW_Tarifrunde_2025_Teil1.pdf),
[Bayern](https://caritas-dienstgeber.de/fileadmin/Beschluesse/RK_Bayern/2025-06-26_RKBayern_Beschluss_allgemeineTarifrunde_Teil1_gez.pdf),
[Mitte](https://caritas-dienstgeber.de/fileadmin/Beschluesse/RK_Mitte/2025-06-26_Beschluss_RKMitte_Tarifrunde_2025gez.pdf),
[Nord](https://caritas-dienstgeber.de/fileadmin/Beschluesse/RK_Nord/2025-06-18-beschluss-tarifrunde_2025-teil1-rk-nord.pdf)
und [Nordrhein-Westfalen](https://caritas-dienstgeber.de/fileadmin/Beschluesse/RK_NRW/2025-06-27-beschluss-tarifrunde_2025-rk-nrw.pdf)
belegt. Die CSV-Transkription und ihre SHA-256 stehen in
`vg06-caritas-quellentabellen.md`.

Der Kandidat enthält pro Tabelle genau 62 Vollzeitwerte: P4 und P6,
Stufen 1–6, sowie P7–P16, Stufen 2–6. Der Test vergleicht alle 620
Paketwerte mit der CSV. Kein Paket enthält P5. Die einzige weitere Quelle
ist die bestehende Produktheuristik für das vom gemeinsamen Schema
vorgeschriebene `workPatternPolicy`-Feld; sie ist keine Caritas-Rechtsquelle
und wird hier nicht ausgeführt.

Alle fünf Berechnungsfähigkeiten stehen auf `UNSUPPORTED`. Zulagen,
Zeitzuschläge, Überstunden, Arbeitszeit und Sonderzahlung sind aus den
älteren Gesamtentwürfen bewusst nicht übernommen. Der Vertragsstatus bleibt
`DRAFT`, und Engine-Vertragsversion 14 ist nicht in der Remote-Allowlist.
Die Pakete zeigen deshalb noch kein Caritas-Gehalt in der App.

Nächster getrennter Teil: RK Ost mit seinen eigenen 2025er Tabellen für
Anlage 32/Tarifgebiet Ost und den 2026er Werten. Danach folgen
quellengebundene persönliche Berechnungsregeln, Fachreview und Geräteabnahme.
