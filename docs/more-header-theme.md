# Mehr: Header-Farben beim Theme-Wechsel

## Umsetzung

SettingsInfoDetailsScreen, DataBackupScreen und TariffAssessmentScreen setzen Header-,
Titel- und Statusleistenfarben lokal aus der aktuellen Palette. Kein Remount der
Navigation; Daten, Formulare und Berechnungen bleiben unverändert.

## Verifikation und Geräteabnahme

- verify:fast bestanden: 738 Unit-Tests, 391 Komponententests und weitere Skriptprüfungen.
- Acht neue Theme-Regressionstests; bestehender Analyse-Test-Mock um Stack.Screen ergänzt.
- Preview Build 31, Runtime eac302484061dfb3fa63e2a74b8618ff6000861c.
- OTA-Gruppe c18503b6-2a3f-489f-af92-2854977b940b, veröffentlicht am 2026-09-20.
- Nutzer bestätigte danach: „ja funktioniert“. Gerät laut bestehendem Testkontext:
  iPhone 14 Pro Max, iOS 26.6.2. Kein neuer Screenshot nach dem Fix vorgelegt.
- Geprüfter Nutzerfluss: Hell → Dunkel → Hell in den Mehr-Unterseiten.
- Commit, Push, PR und Merge nach erfolgreicher CI am 2026-09-20 ausdrücklich freigegeben.
- Kein weiteres OTA oder Production-/TestFlight-Release Teil dieser Git-Auslieferung.
