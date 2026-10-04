# AVR.DD: datierte Originalpakete

## Task-Vertrag

Ziel: Die zwei erhaltenen AVR.DD-DRAFT-Pakete und deren vollständige Originalreferenzen reproduzierbar liefern.
Dateiscope: Originalgenerator, zwei JSON-Pakete, vollständiger Originalreferenztest und dieser Quellenbeleg (5 Dateien).
Plattform: Regelkatalog und plattformunabhängige Tarifvorbereitung.
Abnahme: Erzeugung und unverändernder --check, alle Originalreferenzfälle, verify:fast und sieben grüne PR-CI-Prüfungen.
Nicht-Ziele: Persönliche Berechnung, App-Aktivierung, native Änderungen und Veröffentlichung.

## Quellen und unabhängige Kontrolle

Die vier CSV-Tabellen sowie Vertrag 15 stammen aus dem zuvor gelieferten Originalvertrag. Alle 288 Geldzellen und 80 Stufenlaufzeiten wurden am 04.10.2026 unabhängig mit neu geladenen Primär-PDFs abgeglichen.

- 2025: https://www.arkdd.de/avr/avrdd_20260101.pdf ; SHA256 6dbe45ec4234ea189da4635521ea2265d359c35666aec0ef2858a499f0561ad7.
- 2026: https://www.arkdd.de/rs/rs_20250711.pdf ; SHA256 9518d677c23229ee33301b44124e394f159382deebf4667ca88e6f1a32f1304c.
- Aktuelle konsolidierte Fassung: https://www.arkdd.de/avr/avrdd_20260901.pdf ; SHA256 a1fcdca0b6dc58c0f9bb1a1a437f5012c476a9a8df8c9d2c1ceace36699b8591. Alle 144 Geldzellen der September-Tabellen wurden zusätzlich unabhängig mit dieser Fassung abgeglichen.

Die Originalpakete behalten ihre ursprünglichen Quellen und SHA256. Die aktuelle konsolidierte Fassung dient als zusätzlicher externer Abgleich.
Anlage 9 wird separat aus den gedruckten Werten übernommen. Sie wird nicht aus Monatsbeträgen rekonstruiert; separat gerundete veröffentlichte Werte bleiben erhalten.
Die EG-abhängigen tatsächlichen Stufen sowie der Wechsel der §14-Zulagen am 01.07.2026 und der Schichtzulagen am 01.09.2026/01.07.2027 sind datiert erhalten.

## Originalerhalt und Reproduzierbarkeit

Alle ursprünglichen Daten und Referenzassertionen werden vollständig übernommen. Der Generator erhält lediglich einen unverändernden --check; ohne Flag erzeugt er dieselben Originalpakete.
Die Vollfassung des Originalgenerators bleibt im erhaltenen Gesamtcheckout gesichert. Vertrag 15 bleibt DRAFT und UNSUPPORTED und gehört nicht zum ausführbaren Remote-Katalog.
