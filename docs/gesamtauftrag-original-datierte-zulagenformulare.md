# Originalauftrag: datierte Zulagenbestätigungen und Einschätzung

Stand: 2026-10-04. Expo SDK 57 (~57.0.22), iPhone zuerst.

## Ziel und Dateiscope

Neun Dateien: vier neue ursprüngliche Formular-/Karten-/Testdateien, gezielter Abgleich der bestehenden Einschätzungsseite und ihres Regelabdeckungstests die ursprüngliche periodenspezifische Kartenbeschriftung, die additive ursprüngliche Report-Fußnote sowie dieser Beleg. Die Einschätzung verwendet datierte Vergütungsprofile und Bestätigungen mit genauem Zeitraum und Tarifidentität. Frühere undatierte Monatsfestlegungen müssen ausdrücklich neu zugeordnet werden.

## Abnahmekriterien

Alle ursprünglichen Fälle bleiben erhalten. Tarifwechsel, Teilbestätigungen und unbestätigte Arbeitgeberfragen dürfen keine Zulage aus anderen Zeiträumen übernehmen. Bestätigter Anspruch und automatisch erkanntes Dienstmuster bleiben sichtbar getrennt. Schreibkonflikte, doppelte Betätigung, Ladefehler und geänderte Restore-Stände erhalten die Eingaben und blockieren veraltete Schreibzugriffe. Ein bereits geöffneter Entfernen-Dialog darf nach einer Änderung des geladenen Standes nicht schreiben.

## Erhaltene Darstellung

Der aktuelle Zurück-Footer sowie die bestehenden Kriterienzeilen mit Statussymbolen, Farben, Abständen und Textskalierung werden erhalten. Die Originalquellen werden separat unverändert gesichert; notwendige Lieferkorrekturen werden mit konkretem Nachweis dokumentiert.

## Liefergrenze

Die bestehende Einschätzungsroute ist betroffen. UI-Merge erst nach gemeinsamer kohärenter Integration und echter iPhone-Abnahme. Keine separate OTA, Production- oder TestFlight-Veröffentlichung. Fehlende bzw. DRAFT-Regel- und Anspruchsgrundlagen bleiben erkennbar.

## Prüfung

Ursprüngliche Komponentenfälle, bestehende Regelabdeckung und notwendige Restore-Regressionen sowie verify:fast werden vor Lieferung ausgeführt. Ergebnisse werden im Lieferabgleich dokumentiert.

## Nachgewiesene Lieferkorrekturen

Vier zusätzliche Fälle prüfen unveränderte Revision bei geänderten Profil-/Bestätigungsinhalten, Laden und einen verzögerten Entfernen-Dialog. Drei davon lösten vor dem Guard einen veralteten Schreibzugriff aus; nach vollständigen Quellenbindungen und aktuellem Dialog-Guard bleiben alle Entwürfe erhalten. Der ursprüngliche Quellenbeleg r2 wird ausschließlich im Liefer-Test auf den tatsächlichen r3-Stand angepasst. Sämtliche 33 Originalfälle bleiben erhalten; die vier vorhandenen Kartenfälle werden zusätzlich ausgeführt. Die fehlende ursprüngliche ReportFootnote und der periodenspezifische Accessibility-Parameter werden additiv geliefert. Der bestehende Erklärungstext für fehlende Tarife bleibt bei genau dieser Diagnose erhalten.
