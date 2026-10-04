# Originale ArbZG-Prüfzeitraum-Nachweise

## Task-Vertrag

Ziel: Originale Nachweise über tatsächlich verwendete Erwachsenen-Prüfzeiträume für die spätere altersabhängige Ausbildungsintegration liefern.
Scope: Vier originale Engine-Erweiterungen, additive Datentypen, alle sechs ursprünglichen Zeitraumtests und dieser Beleg (sieben Dateien).
Plattform: Plattformunabhängiger Expo-SDK57-TypeScript-Kern, ohne sichtbare Änderung.
Abnahme: Originalidentität der Engine-Dateien, alle sechs originalen Erwartungsfälle und bestehende ArbZG-Regressionen sowie verify:fast und sieben grüne CI-Prüfungen.
Nicht-Ziele: Jugendregeln aktivieren, neue Rechtsgrenzen, Monats-/Jahresoberfläche, native Änderungen und Veröffentlichung.

## Nachweise und Grenzen

Berechnungshorizonte schließen den Endtag eines nächtlichen Dienstes konservativ ein. Meldungen über Durchschnittszeiten, Nachtarbeitereigenschaft, Jahres-Sonntagsquoten und gemeinsam zugeordnete Ersatzruhetage tragen ihre verwendeten Zeiträume. Auch eine Berechnung ohne Meldung dokumentiert ihren geladenen Horizont; daraus folgt keine rechtliche Gesamtfreigabe.

Das entspricht den verschiedenen Grundlagen in [ArbZG §3](https://www.gesetze-im-internet.de/arbzg/__3.html), [§6](https://www.gesetze-im-internet.de/arbzg/__6.html), [§11](https://www.gesetze-im-internet.de/arbzg/__11.html) und dem begrenzten Altersgeltungsbereich von [JArbSchG §2](https://www.gesetze-im-internet.de/jarbschg/__2.html), am 04.10.2026 geprüft. Die bestehenden Grenzwerte, Berechnungen und Meldungen bleiben gleich.

Die vier Engine-Dateien sind nach Zeilenendennormalisierung vollständig originalidentisch. Alle sechs Originaltestfälle und Erwartungen bleiben erhalten; lediglich die Testdatenherkunft verwendet die bereits vorhandenen Arbeitnehmer-/ArbZG-Fixtures statt der noch nicht gelieferten Jugendregelfixture. Die vollständige Originalfassung bleibt im Gesamtcheckout erhalten.

## Prüfergebnis

61 gezielte ArbZG-Fälle einschließlich aller sechs ursprünglichen Zeitraumfälle grün. verify:fast bestanden: 4986 Unit- und 536 Komponententests.
