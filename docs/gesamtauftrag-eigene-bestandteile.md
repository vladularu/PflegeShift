# Eigene Vergütungsbestandteile

## Auftrag und Grenzen

Plattform: reine TypeScript-Fachlogik unter Expo SDK 57 (~57.0.22), iPhone-first.
Das Paket übernimmt vier bereits vorhandene Berechnungsbausteine aus dem erhaltenen Gesamtcheckout. Es ergänzt persönliche Zeitzuschläge, explizit bestätigte Überstundenbestandteile, feste Zulagen und eigene Sonderzahlungen. Eingaben sind persönliche Bestätigungen, keine tariflichen Anspruchsfeststellungen.
Es erfolgt keine UI- oder Datenbankanbindung, Tarifaktivierung, OTA oder Brutto-Vollständigkeitsbehauptung. Weitere Tarif-, Ausbildungs-, Speicher- und UI-Pakete folgen getrennt.

## Dateiscope

- src/engine/remuneration-own-premiums.ts
- src/engine/remuneration-own-overtime.ts
- src/engine/remuneration-own-allowances.ts
- src/engine/remuneration-annual-payment.ts
- src/engine/remuneration-own-components.test.ts
- docs/gesamtauftrag-eigene-bestandteile.md

## Abnahme

Direkte Tests prüfen Kombination der Zuschläge, reale Zeitwechselminuten, einmalige Pausenschätzung, Cent-Rundung, unbekannte Feiertagsregeln, keine doppelte Stundenlohnbasis, ausdrückliche Nullbeträge, bestätigte Teilmonatsregeln und Ablösung einer Projektion durch eine tatsächliche Jahreszahlung. Fehlende Bestätigungen bleiben nicht verfügbar.
Vor Lieferung: gezielte Tests, npm.cmd run verify:fast und sieben erfolgreiche PR-CI-Prüfungen. Exakter Dateiscope auf aktuellem master; der alte Gesamtcheckout bleibt erhalten.
Die direkte Freigabe des Nutzers für die restlichen Aufträge umfasst diese Git-Lieferung. Die unabhängige fachliche Endabnahme bleibt ein eigener tatsächlicher Nachweis.

## Quellen

Die Beträge in Tests sind synthetische persönliche Angaben aus own-remuneration-test-fixtures.ts. Sie sind keine Tarifdaten oder Rechtsauskunft.
Expo-Dokumentation: https://docs.expo.dev/versions/v57.0.0/
