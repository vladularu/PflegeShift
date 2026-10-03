# Gesamtauftrag: datierte persönliche Vergütungsprofile

## Task-Vertrag

- Ziel: vorhandenen validierten Profilvertrag des Gesamtcheckouts separat in aktuellen master integrieren.
- Scope: sieben neue Dateien: datierter Profilvertrag/Test, persönliche TV-L- und TVA-L-Pflegeangaben mit je einem Test und dieser Beleg.
- Plattform: TypeScript-Domain, Expo ~57.0.22; SDK-57-Dokumentation geprüft.
- Nicht-Ziele: SQLite/Backup/Provider, neue Tarifformeln, automatische Eingruppierung, UI oder Tarifaktivierung.
- Abnahme: strikte Versionen 1–8, persönliche wöchentliche Minuten, explizite Tarifidentität und eigene Vergütung, unbekannte Ansprüche bleiben unbekannt, nachvollziehbare historische Gültigkeit, Fachtests und verify:fast auf aktuellem master.
- Git-Lieferung durch aktuellen Gesamtauftrag freigegeben; sieben grüne PR-Gates vor Merge.

## Erhaltene Arbeit und Aussagen

Die sechs bestehenden Code-/Testdateien stammen aus dem erhaltenen Gesamtcheckout. Das zuvor integrierte primitive Vertrags-Paket ist Voraussetzung. Keine bestehenden lokalen Dateien werden zurückgesetzt oder überschrieben.

Das Profil hält bestätigte persönliche Angaben getrennt von Tariftabellen. Es berechnet weder Anspruch noch Gehalt. Bekannte Legacy-Werte werden übernommen; das Datum der App-Profilerstellung wird nicht als historische Gültigkeit erfunden. Vor dem ersten bekannten Gültigkeitsdatum bleibt die Zuordnung offen. Pflege-/Funktions- und Arbeitgeberangaben sind ausdrücklich bestätigt oder unbekannt; Beruf, Bundesland oder Alter ersetzen keine Bestätigung.

## Verifikation

- Quellcheckout: vollständiges `verify:fast` mit 4.419 Fach-/Integrationstests und 805 Komponententests grün.
- 96 gezielte Profil-/Bestätigungstests auf Quell- und aktuellem master-Stand bestanden.
- Aktueller master-Integrationscheck: `verify:fast` mit 1.973 Fach-/Integrationstests, 472 Komponententests und 53 Audit-/Härtungsfällen bestanden.
- Keine Native-, UI- oder Datenbankänderung; Speicherung und App-Anbindung folgen separat.
- Vor Merge sind sieben grüne PR-CI-Gates erforderlich.
