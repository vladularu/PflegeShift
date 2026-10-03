# KAT-01: Katalog-V2-Auswahl

## Task-Vertrag

- Ziel: Mehrere datierte Tarifspuren mit signierter, ausdrücklicher Altprofil-Zuordnung zulassen. Explizite Tarifabfragen dürfen bei fehlenden Daten keinen anderen Tarif verwenden.
- Nicht-Ziele: Neue Tarifverträge, Aktivierung von DRAFT-Paketen, persönliche Gehaltsberechnung, UI, Datenbank, native Änderungen oder OTA.
- Plattform: Plattformunabhängiger TypeScript-Vertrag; iPhone-Gerätenachweis erst bei späterer Preview-Anbindung.
- Scope: Zwei JSON-Schemas, zwei generierte Verträge, Validator, Resolver, Publisher, drei Regressionstests und dieser Beleg (11 Dateien).
- Expo: ~57.0.22; Referenz https://docs.expo.dev/versions/v57.0.0/.
- Freigabe: Gesamtauftrag und Git-Lieferung durch den Nutzer erteilt.

## Abnahme

- V1 bleibt mit einer Tarifspur lesbar; eine Mehrtarifspur erfordert V2 und einen gültigen legacyTariffPackageId.
- Legal- und Feiertagsauswahl bleiben eindeutig. Unbekannte Tarif-ID, Datum außerhalb der Quelle und Mehrdeutigkeit liefern einen Fehler.
- Eine normale Generation darf Altprofile nicht einem anderen Tarif zuordnen.
- Signatur bindet die Zuordnung; Rückrollen reproduziert Schema, Zuordnung und Pakete der geprüften Zielgeneration.
- Zulässige Engine-Verträge sowie REVIEWED-/Quellen-/Hash-Prüfungen bleiben verbindlich.
- Fokussierte Tests, verify:fast und sieben PR-CI-Prüfungen erforderlich; gemeinsame Integrationsprüfung verify:full folgt vor Preview-Veröffentlichung.

## Ergebnis

Verifiziert am 03.10.2026: 52 fokussierte Tests und verify:fast mit Exit 0 (1.991 Unit-/Integrationstests, 472 Komponententests; sämtliche Script-Gates). Git-Lieferung erfolgt über den Branch codex/catalog-v2-selection und sieben erforderliche PR-CI-Prüfungen. KAT-01/KAT-02 sind mit diesem Teilvertrag noch nicht abgeschlossen.
