# Datierte Zeitzuschläge

## Auftrag

Die bereits geprüften persönlichen und TVöD-P-Profile erhalten einen datierten Zeitzuschlagspfad. Das Paket übernimmt den Intervallzähler aus dem erhaltenen Gesamtcheckout und behält den bestehenden Ganzdienstpfad bei. Reine TypeScript-Fachlogik, Expo SDK 57 (~57.0.22), iPhone-first.

## Dateiscope und Grenzen

- src/domain/types.ts: ausschließlich optionale Regelidentität an PremiumLine
- src/engine/pay.ts
- src/engine/pay-premium-minutes.ts
- src/engine/remuneration-tariff-adapter.ts
- src/engine/remuneration-premiums.ts
- src/engine/remuneration-premiums.test.ts
- src/engine/remuneration-premiums-own-boundaries.test.ts
- docs/gesamtauftrag-datierte-zeitzuschlaege.md

Die Berechnung bindet exakt das gewählte Paket. Unbekannte oder nicht gelieferte Familien bleiben nicht verfügbar. Ausbildungs-, TV-L-, Anlage-A- und SuE-Adapter werden in späteren eigenen Paketen integriert. Keine UI, Datenbankänderung, Gehaltsaktivierung oder OTA.

## Abnahme

Die originalen TVöD-P-Tests schützen die Ganzdienst-Ergebnisse, Paket- und Profilwechsel, DST-Minuten, Monatsüberhänge, einmalige Pausen, fehlende Quellen und bestätigte Nullwerte. Zusätzliche eigene Tests prüfen die Rundung über Mitternacht und einen persönlichen Basiswechsel. Gezielte Tests, verify:fast und sieben PR-CI-Prüfungen sind Voraussetzung für Merge.

Der Gesamtcheckout bleibt erhalten. Die Nutzerfreigabe umfasst die abgegrenzte Git-Lieferung. Fachliche Endfreigabe und Geräteabnahme sind getrennte tatsächliche Nachweise.

Expo-Dokumentation: https://docs.expo.dev/versions/v57.0.0/
