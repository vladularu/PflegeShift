# Originaltests: Tarifverträge und historische Grenzen

Stand: 2026-10-04, Expo SDK 57 (~57.0.22).

## Vertrag und Dateiscope

Vierzehn Lieferdateien: neun ursprüngliche Test-/Fixturedateien, historische Auswahlfixture und unverändertes r2-Testpaket außerhalb des aktiven Regelkatalogs, ursprüngliche Caritas-Zeitzuschlagspolitik als zusätzliche Testdatei, ergänzter DRK-Vertragsfall sowie dieser Beleg. Nur Testcode; keine produktiven Regeln, UI oder native Änderung.

## Ziel und Abnahme

Alle ursprünglichen Fälle erhalten: vollständige Jahresdeckung, Quellen-/Gruppen-/Regionszuordnung, Datengültigkeit, Fehler statt erfundener Auswahl, sechs Caritas-Regionen über zwei Jahre, getrennte Pflege-/Schicht-/Zeitzuschlags-/Überstundenverträge sowie ältere DRK-Vertragszuordnung. Historische Vertragsfälle werden als solche ausdrücklich isoliert, damit heutige freigegebene Daten und strengere Familiengrenzen erhalten bleiben. Vertrag 8 und 9 bleiben aus dem entfernten Aktivierungskatalog ausgeschlossen. Testfixtures sind keine neuen Tarif-Freigaben.

## Pflichtcheck

Alle betroffenen Originalfälle gezielt und verify:fast auf aktuellem master; genau sieben CI-Prüfungen vor Merge. Sourceoriginale unverändert separat sichern. Kein Tarif wird aktiviert, keine OTA veröffentlicht.
