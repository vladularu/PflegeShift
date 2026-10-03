# Gesamtauftrag: gemeinsame Vergütungsverträge

## Task-Vertrag

- Ziel: vorhandene primitive Verträge des erhaltenen Gesamtcheckouts als einzeln prüfbare Grundlage in aktuellen master integrieren.
- Scope: zehn neue Dateien: eigene Vergütung plus Fixture/Test, Geld-Ergebnisvertrag, Zulagen-Ergebnisvertrag, bestätigte Jahreszahlungen plus direkter Test, Cent-Rundung plus direkter Test und dieser Beleg.
- Plattform: TypeScript-Fachkern, Expo ~57.0.22; passende SDK-57-Dokumentation geprüft.
- Nicht-Ziele: Tarifaktivierung, DB-Migration, UI, Historie/Provider oder Berechnung eines vollständigen Bruttos; diese folgen in getrennten Paketen.
- Abnahme: strikte Eingaben ohne unbekannte Schlüssel, sichere positive Cent-/Bruchwerte, explizite unbekannte Ansprüche, Unveränderlichkeit, eindeutige Zahlung/Jahr-Identität, exakte Halb-Cent-Rundung, Typecheck und vollständige verify:fast-Prüfung auf aktuellem master.
- Lieferung: Nutzerfreigabe vom 03.10.2026 für sämtliche verbleibenden Aufträge; genaue Git-Dateiliste, sieben grüne PR-Gates vor Merge.

## Bestehende Arbeit und Grenzen

Die sieben bestehenden Quell-/Test-/Fixturedateien stammen unverändert aus dem erhaltenen Gesamtcheckout. Zwei direkte Tests sichern Jahreszahlungsvalidierung und Cent-Rundung für die selbständige Integration ab. Der ursprüngliche Checkout wird nicht zurückgesetzt oder mit master überschrieben.

Nicht verfügbare Geldbeträge bleiben null mit Grund; ausdrücklich bestätigte Nullzahlungen sind dagegen gültige Daten. Persönliche Jahreszahlung und tatsächlicher Auszahlungsmonat sind getrennt; eine Schätzung ist keine bestätigte Zahlung. Geldpositionen tragen Quelle, Status und Teilbetragsgrenzen. Diese Verträge wenden keine neue Tarifformel an und sind noch nicht an die App angebunden.

## Verifikation

- Quellcheckout: vollständiges `verify:fast` mit 4.419 Fach-/Integrationstests und 805 Komponententests bestanden.
- 114 gezielte Vertrags- und Rundungstests auf Quell- und aktuellem master-Stand bestanden.
- Aktueller master-Integrationscheck: `verify:fast` mit 1.877 Fach-/Integrationstests, 472 Komponententests und 53 Audit-/Härtungsfällen bestanden.
- Produktions-Audit, `release:check`, Format und `git diff --check` grün.
- Vor Merge sind alle sieben PR-CI-Gates erforderlich.
