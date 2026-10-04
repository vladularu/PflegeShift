# Originaltests: Tarifverträge und historische Grenzen

Stand: 2026-10-04, Expo SDK 57 (~57.0.22).

## Vertrag und Dateiscope

Vierzehn Lieferdateien: neun ursprüngliche Test-/Fixturedateien, historische Auswahlfixture und unverändertes r2-Testpaket außerhalb des aktiven Regelkatalogs, ursprüngliche Caritas-Zeitzuschlagspolitik als zusätzliche Testdatei, ergänzter DRK-Vertragsfall sowie dieser Beleg. Nur Testcode; keine produktiven Regeln, UI oder native Änderung.

## Ziel und Abnahme

Alle ursprünglichen Fälle erhalten: vollständige Jahresdeckung, Quellen-/Gruppen-/Regionszuordnung, Datengültigkeit, Fehler statt erfundener Auswahl, sechs Caritas-Regionen über zwei Jahre, getrennte Pflege-/Schicht-/Zeitzuschlags-/Überstundenverträge sowie ältere DRK-Vertragszuordnung. Historische Vertragsfälle werden als solche ausdrücklich isoliert, damit heutige freigegebene Daten und strengere Familiengrenzen erhalten bleiben. Vertrag 8 und 9 bleiben aus dem entfernten Aktivierungskatalog ausgeschlossen. Testfixtures sind keine neuen Tarif-Freigaben.

## Pflichtcheck

Alle betroffenen Originalfälle gezielt und verify:fast auf aktuellem master; genau sieben CI-Prüfungen vor Merge. Sourceoriginale unverändert separat sichern. Kein Tarif wird aktiviert, keine OTA veröffentlicht.

## Ergebnis und begründeter Abgleich

131 gezielte Vertragsfälle grün; verify:fast auf master einschließlich PR #251 vollständig grün: 5.693 Unit-, 542 Komponententests und alle Skriptprüfungen. Keine ursprüngliche Fallgruppe entfällt.

Fünf Caritas-Originaldateien und die zusätzliche alte Zeitzuschlagspolitik sind bytegleich. Das alte r2-JSON bleibt bytegleich als isolierte Testfixture, außerhalb rules/packages. Die Jahresfixture ergänzt daran ausschließlich testweise Vertrag 11. Die übrigen TVöD-Auswahlfälle verwenden den heutigen validen Vertrag 11: BT-B kennt mittlerweile auch KAV-BW; ein ausdrücklich entfernten Regionsdatensatz bleibt abgewiesen. Fremde Familien, Teile oder unvollständige Fähigkeiten werden jetzt bereits durch die strengere Validierung abgewiesen; die datierte Berechnung bleibt unavailable mit dem jeweiligen konkreten Fehlercode. Frühere Vertrag-8-Akzeptanzbehauptungen wurden ausdrücklich durch dessen heutige Sperre ersetzt. Kein Schema oder produktiver Validator wurde gelockert.

Die echte r3-Review und Jahresfähigkeit werden getrennt vom unreviewten, nicht aktivierbaren historischen r2 geprüft. Alle ursprünglichen Bundesland-/Teilzeit-/Stunden-/Datums-/Form- und Anspruchsfälle bleiben. Der ursprüngliche DRK-Fremdvertrag 16 wird zusätzlich zum bereits vorhandenen Vertrag 14 geprüft. Originale unverändert im Erhaltungscheckout gesichert.
