# Kompakte Prüfhinweise

## Task-Vertrag

- Ziel: Einzelne Prüfhinweise und betroffene Dienste auf dem iPhone schnell überblicken.
- Nicht-Ziele: Prüfregeln, Einstufung, Vergütung, Einstellungen und Navigation ändern.
- Plattform: iOS, installierter interner Preview-Build mit kompatibler OTA.
- Scope: `compliance-issue-content.tsx`, bestehende Komponententests der Tagesliste und dieser Task-Vertrag.
- Ausgangspunkt: Geräteabgenommener UI-Stand auf `codex/grouped-salary-choice` (6920608). Die laufende App-Branchfolge bleibt erhalten; `master` enthält diesen gesamten akzeptierten App-Stand noch nicht.
- Freigabe: Bestehende ausdrückliche Freigabe für Implementierung, Commit, Push, PR und Preview-OTA. Merge erst nach grüner CI und Geräteabnahme.

## Abnahmekriterien

1. Aufgeklappte Hinweise zeigen kompakte Dienstzeilen: Name und kurzes Datum, Uhrzeit daneben.
2. Lange Listen zeigen zunächst drei Dienste; alle weiteren lassen sich direkt darunter auf- und zuklappen.
3. Alle verfügbaren Dienste bleiben chronologisch erreichbar; fehlende Dienste werden weiterhin benannt.
4. Hinweise bleiben standardmäßig geschlossen. Andere Hinweise verdrängen den zuvor geöffneten Hinweis.
5. Große Systemschrift darf umbrechen; keine neuen Textabschneidungen oder Skalierungsgrenzen. Bedienelemente mindestens 44 pt.
6. Prüfungsansicht im realen iPhone-Preview prüfen: Sieben-Tage-Serie, Auf-/Zuklappen, andere Hinweise.

## Prüfung

Gezielte Komponententests und `npm.cmd run verify:fast`; anschließend PR-CI und iPhone-Abnahme.
