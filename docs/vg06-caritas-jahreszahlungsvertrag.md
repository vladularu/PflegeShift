# VG-06: Caritas-Jahreszahlungsvertrag und Quellenabfrage

## Aufgabe und Abnahme

Stand: 01.10.2026. Plattform: reine TypeScript-Fachlogik, ohne native Änderung.
Branch: `codex/vg06-caritas-annual-payment-contract`, Basis: gemergtes `master`.

Ziel: optionaler Vertrag `caritasAnnualPaymentRules` für Anlagen 31/32,
Anspruchsjahre 2025/2026, validierte Quellenabfrage nach Jahr, Anlage, Gebiet und
P-Gruppe. Elf Dateien: Schema, zwei generierte Verträge/Validatoren,
Validierungsintegration, Caritas-Regel-Allowlist, neue Fachvalidierung,
Vertragstest, Abfrage, Abfragetest, synthetische Testfixture und dieser Beleg.

Nicht-Ziele: regionale produktive Satzdaten, individuelle Anspruchsentscheidung,
Bemessungsbetrag, Zwölftelung, Integration in Monatsausgabe/App, Aktivierung,
OTA und 2027. Bestehende Kandidaten ohne Jahresregeln bleiben gültig; die Abfrage
meldet fehlende Regeln. Vertrag 14 bleibt DRAFT, jede Capability UNSUPPORTED.

Abnahme: Schema und Semantik weisen falsche Jahre, Anlagen, Gebiete, P-Gruppen,
Raten, Quellen, fehlende/mehrfache Abdeckung und falsche Ost-Basis zurück.
Gezielte Vertrag-/Abfragetests sowie `verify:fast` müssen bestehen; danach
Commit, Push, PR und Merge mit sieben grünen CI-Prüfungen unter der dauerhaften
Git-Freigabe des Nutzers.

## Primärquellen und fachliche Grenzen

[AVR, Stand 19.03.2026](https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/AVR_Online-PDF_2026_final.pdf):
Anlage 31 § 12 Abs. 1, § 16 (Druckseiten 250, 255–256);
Anlage 32 § 12 Abs. 1, § 16 (Druckseiten 286, 291–292).
Die P-Zuordnung ergibt 86 % für P4/P6/P7/P8 und 76 % für P9–P16:
P16 entspricht EG12, nicht EG13. P5 gehört nicht zu den belegten P-Tabellen.
Basis sind grundsätzlich die gezahlten Entgelte Juli–September, Gruppe am

1. September, Auszahlung November. Anspruch, Ausnahmen und Kürzungen sind
   separat zu prüfen. Anlage 31 enthält eine zusätzliche Ausscheidensregel;
   Anlage 32 enthält diese nicht.

[Anlage 32 § 16, Fassung bis 31.12.2025](https://www.avr-online.de/lambertus/avr-online/start.xav?start=%2F%2F%2A%5B%40attr_id%3D%27avr-online_normText_AVR_anl32_par16__2023-07-01%27+and+%40outline_id%3D%27avr-online_normText_AVR%27%5D):
Tarifgebiet Ost verwendet 2025 die West-Tabellen der RK Ost.
[Bundesbeschluss 09.10.2025, A.II/IV](https://caritas-dienstgeber.de/fileadmin/Beschluesse/BK/BK_2025-03_Beschluss_Berechnung_JSZ_und_Weihnachtsgeld_fuer_die_RK_Ost_gez.pdf)
streicht diese Sonderregel ab 01.01.2026.

## Vertrag

Jede Regel trägt Jahr, Anlage, Gebiet, eindeutige ID, P-Gruppen, Basispunkte und
Quellen. Metadaten verweisen ausdrücklich auf § 16 Abs. 2 mit seinen
Sonderfällen und Abs. 4 mit seinen Ausnahmen. Sie sind keine implementierte
Anspruchs- oder Bemessungslogik. Der 1. September muss in der Paketgültigkeit
liegen: Ein westliches Juli-2025-Paket mit Ende Januar 2026 liefert keine
Regel für Anspruchsjahr 2026.

Das Gebiet der Tabellenbasis wird separat gespeichert. Für
`OST_TARIF_OST` 2025 ist `OST_TARIF_WEST_HAMBURG` die kanonische Referenz
auf die gemeinsame West-Tabelle im selben Paket; es erfolgt kein
Arbeitsortwechsel. Andere Gebiete/Jahre verwenden ihr ausgewähltes Gebiet.
Die Abfrage gibt zusätzlich die ID der referenzierten Tabelle zurück,
berechnet daraus aber keinen Durchschnitt.

Quellenreferenzen müssen eine Jahresnorm `caritas-avr-jsz-2025` bzw.
`caritas-avr-jsz-2026` und die Quellen der Gebietsauswahl enthalten;
RK Ost 2026 benötigt außerdem `caritas-bk-2025-03-jsz-ost`.
IDs binden die Metadaten; die Prüfung ersetzt keine redaktionelle Quellenprüfung
und verifiziert keine PDF-Authentizität. Tatsächliche Dokumentfassungen,
Hashes und regionale Übernahmen werden erst im Satzdatenpaket aufgenommen.

Alle neuen Jahresregeln existieren in diesem Paket ausschließlich in ausdrücklich
synthetischen Testfixtures mit `example.invalid` und Platzhalterhash.
Keine solche Fixture wird in `rules/packages` geschrieben oder veröffentlicht.

## Nächste Pakete

1. Regionale Jahresregeln samt zeitlich passenden Originalquellen und Hashes.
2. Bestätigte persönliche Jahresbasis/Anspruch und Sonderfälle; keine Ableitung
   aus dem bisherigen unvollständigen Monatsbetrag.
3. Gemeinsame Ausgabe, Referenzfälle, fachliche Prüfung und danach App-Anbindung.

## Lokaler Prüfnachweis

- 43 gezielte Vertrags- und Abfragetests bestehen.
- `npm.cmd run verify:fast` besteht: 1.058 Unit-Tests (140 Dateien),
  472 Komponententests (84 Suites) und alle Operator-/Liefer-/Policy-Tests.
- Typen, Lint ohne Warnungen, Format, generierte Verträge und Whitespace grün.
- Alle 17 vorhandenen Katalogkandidaten und die bestehenden Publikationsverträge
  bleiben gültig. Keine Kandidatendatei wurde verändert.
- Lieferumfang: genau elf Dateien. Die 49 unabhängigen Änderungen im
  Hauptcheckout bleiben unverändert.
