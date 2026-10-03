# Datierte Zulagen und Überstunden

## Auftrag

TVöD-P und eigene persönliche Vergütung erhalten datierte Zulagen- und Überstundenbestandteile. Es werden ausschließlich ausdrücklich bestätigte Anspruchseingaben und Überstunden ausgewertet. Reine TypeScript-Fachlogik unter Expo SDK 57 (~57.0.22), iPhone-first.

## Dateiscope

- src/engine/pay-allowances.ts: bestehende Zulagenregeln als gemeinsame API
- src/engine/remuneration-allowances.ts
- src/engine/remuneration-allowances.test.ts
- src/engine/remuneration-overtime.ts
- src/engine/remuneration-overtime.test.ts
- src/engine/remuneration-supplement-result.ts
- src/engine/remuneration-supplements-integration.test.ts
- docs/gesamtauftrag-datierte-zulagen-ueberstunden.md

## Grenzen und Abnahme

Keine UI, Datenbank, weitere Tarifaktivierung oder OTA. Noch nicht gelieferte Familienadapter bleiben im erhaltenen Gesamtcheckout. Null, fehlende Bestätigung und widerrufene Aufteilung sind verschieden. Ein positiver Zeitkontostand erzeugt keine Überstundenvergütung.

Die vorhandenen TVöD-P-Tests prüfen Quellen, zeitliche Entscheidungen, Rundung und Paketwechsel. Eigene Grenzfälle prüfen bestätigte persönliche Beträge sowie Tagesaufteilung, Dienstrevision, Widerruf und Dubletten. Gezielte Tests, verify:fast und sieben erfolgreiche CI-Prüfungen vor Merge.
Die Nutzerfreigabe für den Gesamtauftrag umfasst dieses Paket. Die unabhängige Fachabnahme bleibt ein eigener tatsächlicher Nachweis.

Expo-Dokumentation: https://docs.expo.dev/versions/v57.0.0/

## Gepruefter Lieferstand

Integration auf master 69e5f02: 68 gezielte Tests und verify:fast (2300 Unit-/Integrationstests, 472 Komponententests) erfolgreich.
