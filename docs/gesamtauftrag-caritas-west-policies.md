# Caritas West: ursprüngliche Policy-Pakete

Stand: 2026-10-04. Vierzehn Dateien: Generator, zehn westliche DRAFT-Revisionen, vollständiger ursprünglicher Regionalreferenztest, ergänzte bestehende Quellenliste und dieser Beleg.

## Ziel und Abnahme

Die fünf Regionalkommissionen BW, Bayern, Mitte, Nord und NRW erhalten für Juli 2025 und Februar 2026 die datierten ursprünglichen Policies für Zeitzuschläge, Überstunden und Jahressonderzahlung. Der ursprüngliche Generator berechnet alle Tabellen weiterhin aus der erhaltenen Quellen-CSV. Vollständige Referenztests prüfen 620 Tabellenwerte, regionale Wochenzeiten, Zulagen und die quellengestützten Policies; --check muss die generierten Dateien bytegenau bestätigen. verify:fast und sieben grüne CI-Prüfungen vor Merge.

## Erhalt vorhandener Lieferungen

Eine ausdrücklich begrenzte Kompatibilitätsergänzung übernimmt bestehende Quellenmetadaten, Wochenzeit-IDs, Pflegezulagen-IDs und die bereits separat gelieferten Zeitzuschlagssatz- und Jahresregelstrukturen aus dem unveränderlichen Snapshot. Die tatsächlichen Wochenzeiten müssen vor dieser Übernahme exakt mit der ursprünglichen Erzeugung übereinstimmen. Tabellenwerte kommen ausschließlich aus der CSV. Der vollständige ursprüngliche Referenztest bleibt erhalten; die SECTION_12_4-ID-Erwartung folgt dem vorhandenen stabilen care-4-Bezeichner.

## Quellen und Grenzen

Die Primär-PDFs AVR 2025/1, AVR 2026 sowie die offiziellen Zeitzuschlagstabellen 2025 und 2026 wurden am 04.10.2026 frisch geladen und gegen ihre Quellenhashes geprüft; siehe gesamtauftrag-caritas-policy-vertrag.md und gesamtauftrag-caritas-quellenbasis.md. Die regionalen P-Tabellen und tatsächlichen Wochenzeiten sind bereits identisch mit der erhaltenen Arbeit. Keine Verlängerung nach 2027. Pakete bleiben DRAFT, App-Komponenten UNSUPPORTED. Persönliche Berechnung, App-Anbindung, unabhängige Fachprüfung und Geräteabnahme erfolgen in getrennten Paketen.

Die bestehende vollständige West-Satzreferenz bleibt ebenfalls erhalten. Ihre exakte Quellenliste enthält zusätzlich die drei tatsächlich gebundenen Policy-Quellen pro Revision; vorhandene Betrags-, Hash- und Gebietserwartungen bleiben unverändert.
