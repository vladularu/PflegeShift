# 9G-B – Prüfung nach Kategorien darstellen

> Statusabgleich 12.09.2026: Paket abgenommen und über [PR #67](https://github.com/vladularu/PflegeShift/pull/67) integriert. Aktueller Status und verbleibende Prüfpunkte stehen in der [zentralen Roadmap](roadmap.md). Die folgenden Freigaben, offenen Abnahmen und Implementierungsbeschreibungen dokumentieren den damaligen Arbeitsstand; sie sind keine neuen Aufträge und kein Beleg für den heutigen Code. Fachliche Grenzen bleiben maßgeblich, soweit spätere Pakete sie nicht ausdrücklich ersetzen.

Ziel: Gespeicherte Auswahl aus 9G-A wirkt auf Monat, Jahr und Detailansicht. Gesetzliche Meldungen bleiben sichtbar; freiwillige Planung ist optional. Zähler, Farben und Meldungslisten bleiben konsistent einschließlich Informationsmeldungen.

Nicht-Ziele: Rechtsregeln, Gehalt, Tarifprüfung, Kalender, neue Score-Formel oder native Integration. Expo ~57.0.20, SQLite-Referenz https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/.

Wegen Dateiumfang zwei Umsetzungsteile, eine gemeinsame Auslieferung:

1. 9G-B1: reine Auswahlfunktionen und Kategorie-Metadaten beider Jahresgeneratoren, Unit-Tests. Keine Einstellungsabhängigkeit in Generator oder Cache-Schlüssel.
2. 9G-B2: gemeinsamer Preferences-Provider, Einstellungsseite und Monats-/Jahres-/Detaildarstellung, Komponenten- und Regressionstests.

Fallback: Ohne Klassifikation werden alte Berichtszähler nicht weggefiltert. Nicht verfügbare Prüfungen bleiben nicht verfügbar. Ausgeblendete Planung wird ausdrücklich gekennzeichnet. Speichern publiziert die neue Auswahl erst nach Datenbankerfolg; Fehlermeldung und bisherige Auswahl bleiben erhalten. Backup-Restore lädt die App ohnehin neu.

Dateiscope B1: check-visibility.ts/test, annual-report.ts, annual-core-report.ts und gezielter Generator-Test. B2: check-preferences.tsx, app/_layout.tsx, check-settings-screen.tsx/test, settings-screen.tsx, analysis-screen.tsx, compliance-details-screen.tsx, annual-report-view.tsx sowie passende Komponenten-/Hook-Tests.

Geräteabnahme iPhone 14 Pro Max: bestehender Monat mit Planungshinweisen, Schalter aus/ein, Vergleich von Liste/Zähler/Farbe in Monat/Jahr/Details, gesetzliche Meldungen unverändert, Neustart, Jahreswechsel flüssig und Gehalt/Dienste unverändert. Eine Preview-OTA bei passender Runtime, keine automatische Geräteabnahme oder Merge.
