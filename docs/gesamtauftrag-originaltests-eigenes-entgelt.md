# Originaltests: eigenes Entgelt und gemeinsamer Monatsbetrag

Stand: 2026-10-04, Expo SDK 57 (~57.0.22).

## Scope und Abnahme

Sieben Lieferdateien: sechs vollständig gelesene Originaltests und dieser Beleg. Alle Originalfälle bleiben erhalten: persönlicher Monatsbetrag ohne zweite Teilzeitkürzung, echte bezahlte Minuten/Abwesenheiten, fehlende Bestätigungen, Zuschlagskombination, Datum-/Monatswechsel, Sommerzeit, Rundung, tarifunabhängige Auszahlung, Jahrescache bei Restore gleicher Revision und gemeinsame Monatszusammensetzung ohne doppelte Zahlung. Es gibt keine Produktionscode-Änderung und keine UI-Lieferung.

Die Tests werden auf aktuellem master ausgeführt. Abweichende historische Fixtures werden nur bei konkretem Nachweis mit dem gegenwärtigen Vertrag abgeglichen; alle fachlichen Behauptungen bleiben bestehen. Die unveränderten Originaldateien werden getrennt erhalten.

## Liefergrenzen

Commit, Push, PR und Merge nach genau sieben grünen CI-Prüfungen durch die fortgeltende Gesamtfreigabe autorisiert. Keine App-Aktivierung, native Änderung, einzelne OTA, Production oder TestFlight.

## Pflichtprüfung

Alle sechs Originaltestdateien gezielt sowie verify:fast auf dem sauberen master-Elternstand.

Ergebnis: alle 85 ursprünglichen Fälle unverändert grün. verify:fast grün auf master-Elternstand: 5345 Unit- und 542 Komponententests sowie alle Liefer-, Operator-, Audit- und Runtime-Prüfungen. Kein historischer Test musste abgeschwächt oder angepasst werden.
