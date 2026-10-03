# Tarifliche Jahreszahlungen

## Auftrag und Plattform

Das Paket liefert die vorhandene gemeinsame Anspruchs-, Basis- und Cent-Berechnung sowie die Cash-Monatszuordnung. Persönliche Bestätigungen ersetzen weder Tarifauswahl noch fachliche Prüfung. Reine TypeScript-Fachlogik unter Expo SDK 57 (~57.0.22), iPhone-first.

## Dateiscope

- src/engine/tariff-annual-eligibility.ts
- src/engine/tariff-annual-basis.ts
- src/engine/tariff-annual-payment.ts
- src/engine/tariff-annual-payment.test.ts
- src/engine/tariff-annual-test-fixtures.ts
- src/engine/annual-core-test-fixtures.ts
- src/rules/tariff-annual-selection.ts
- src/rules/tariff-annual-selection.test.ts
- src/engine/remuneration-tariff-annual.ts
- src/engine/remuneration-annual-coverage.ts
- src/engine/annual-cash-components.test.ts
- docs/gesamtauftrag-tarifliche-jahreszahlungen.md

## Grenzen und Abnahme

Keine UI, Datenbank, Tarif- oder Ausbildungsaktivierung und keine OTA. Caritas-DRAFT-Ansprüche ohne tatsächliche Zahlung bleiben aus der Cash-Monatsausgabe ausgeschlossen. Tatsächlich bestätigte Beträge sind eigene Eingaben. Private synthetische Ausbildungsfälle prüfen Rechenmechanik; sie liefern keine Ausbildungs-Quellentabellen.

Tests prüfen Beschäftigungsgrenzen, bestätigte Bemessungsmonate, Zwölftel, direkte Übernahme, fehlende Angaben, einmalige HALF_UP-Rundung, historische Pakete, widersprüchliche Regeln, Mehrfachansprüche und tatsächliche Auszahlung im Folgejahr. Vor Merge: gezielte Tests, verify:fast und sieben grüne CI-Prüfungen. Die Nutzerfreigabe umfasst die abgegrenzte Git-Lieferung; die unabhängige fachliche Endfreigabe ist offen.

## Quellenabgleich vom 3. Oktober 2026

Der Katalog verwendet die [VKA-Lesefassung AT/BT-K](https://vka.de/wp-content/uploads/2026/04/250406_TVoeD_Krankenhaeuser_TV-Aerzte-VKA.pdf) und die [VKA-Lesefassung AT/BT-B](https://vka.de/wp-content/uploads/2026/04/250406_TVoeD_Pflege_u_Betreuungseinrichtungen.pdf). Die Dokumente wurden erneut geöffnet; §20 AT und §54 BT-K enthalten den Bemessungs- und Novemberpfad. Das ist ein technischer Quellenabgleich, keine unabhängige fachliche Endabnahme.

Expo-Dokumentation: https://docs.expo.dev/versions/v57.0.0/

## Integrationsabhaengigkeit

Die 62 Tests sind im erhaltenen Gesamtcheckout gruen. Auf aktuellem master fehlen die Ausbildungsfelder und der APPRENTICE-Zweig des Vertrags 11. Dieses Paket bleibt lokal, bis der getrennte Ausbildungskatalog-Vertrag geliefert ist. Es gibt noch keinen PR und keinen Merge.
