# Originaltests: Vergütungsdatenbank und Sicherung

Stand: 2026-10-04, Expo SDK 57 (~57.0.22).

## Vertrag

Ziel: fünf vollständig gelesene Originaltests unverändert auf aktuellem master prüfen und sichern. Scope sechs Dateien einschließlich dieses Belegs. Plattform: vorhandene SQLite-/SQLCipher-Datenverträge, CPU-Datenbanktests mit Neustart- und Transaktionsfällen; keine neue native Änderung. Keine UI oder Gehaltsaktivierung.

## Abnahme

Alle Originalfälle erhalten: datierte TV-L-/TVA-L-Auswahl, eigene Monats-/Stundenvergütung, Ausbildungsjahrübergänge, widerrufene Bestätigungen, Mehrfachänderungen, veraltete Schichtangaben, native Dateineustart-Adapter, komplette lokale Sicherung/Wiederherstellung einschließlich Altfassung, Prüfsummen, Fremd-/Doppeldatensätze und vollständiger Rollback bei Fehlern. Snapshot darf keine halb aktualisierten Daten lesen. TV-L-Brandpflegeintervalle und TVA-L-Samstagsbestätigung getrennt erhalten und bei Profiländerung entwerten.

## Versionsprüfung

Live vor Übernahme: Datenbankschema 31, lokale Sicherung 19, Entwicklungssicherung 16. Diese Werte entsprechen den Originalfixtures. Kein Versionstausch oder produktiver Migrationsschritt geplant.

## Pflichtcheck

Fünf gezielte Originaltests, gesamte Datenbanktests und verify:fast; anschließend genaue sieben CI-Prüfungen. Sourceoriginale werden unverändert separat versioniert. Keine OTA oder DRAFT-Aktivierung.

## Ergebnis

Alle fünf Originaldateien bytegleich: 89 gezielte Fälle grün. Die gesamte Datenbanksuite besteht mit 772 Tests. verify:fast auf master mit PR #249 vollständig grün: 5.434 Unit-, 542 Komponententests und alle Skriptprüfungen. Nach Einbeziehung des inzwischen gemergten Jahreszahlungspakets wird der gemeinsame Stand erneut vollständig geprüft.
