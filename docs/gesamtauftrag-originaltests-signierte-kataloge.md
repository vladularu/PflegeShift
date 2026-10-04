# Originalabgleich: signierte Mehrtarif-Kataloge

## Auftrag und Abnahme

Wiederherstellung der fehlenden ursprünglichen Publikations-, Geräteverifikations-, Resolver- und Manifestfälle auf dem aktuellen master. Plattform: gemeinsame TypeScript-Fachlogik und iOS-Verifikationsadapter, Expo SDK 57. Dateiscope: vier vorhandene Testdateien, eine Fehlermeldung und dieser Beleg. Abnahme: zwölf zusätzliche Originalfälle, verify:fast und sieben PR-CI-Prüfungen.

## Erhalt und Anpassungen

Alle neueren Tests bleiben erhalten. Die ursprünglichen Mehrtarif-, Legacy-Bindungs-, Rollback-, ungültigen Datum- und Manifestfälle werden als zusätzliche Blöcke übernommen. Originale bleiben im Quellcheckout unverändert. Signaturen verwenden ausschließlich öffentliche deterministische Testschlüssel und synthetische Reviewbelege.

Die alte Vertragsversion 8 ist inzwischen ausgeschlossen. Die ursprüngliche Auswahlsignatur verwendet daher den aktuellen Vertrag 11; der TVöD-DRAFT-Fall nutzt den bereits isoliert erhaltenen Original-r2-Inhalt mit gültigem synthetischem Vertrag 11 und Jahressonderzahlungsregeln. Die Erwartung annualPayment entspricht dem aktuellen SUPPORTED-Vertrag. Das ist keine Reviewfreigabe eines echten Tarifpakets. Alte Apps müssen neue Vertragsversionen weiterhin ablehnen. Der separate TVAöD-Vertrag-10-Fall bleibt erhalten.

Die ursprüngliche Fehlerbeschreibung wird präzisiert: ein eindeutiger Legacy-Tarif und je ein Rechts-/Feiertagstrack; mehrere Tarife sind mit Manifest v2 zulässig. Keine Logikänderung. Keine echten Paketdaten, native Integration, UI oder Veröffentlichung.

## Prüfung

Gezielte vier Dateien: 74 Fälle grün, darunter zwölf wiederhergestellte Originalfälle. Typecheck und verify:fast bestanden: 5.705 Unit- und 542 Komponententests sowie alle Skriptprüfungen ohne Fehler. PR-CI ist vor Merge separat abzugleichen.
