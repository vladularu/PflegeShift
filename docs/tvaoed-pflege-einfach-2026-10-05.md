# TVAöD Pflege im einfachen Gehaltsfluss

## Auftrag und Freigabe

Am 05.10.2026 bestätigt: TVAöD Pflege für kommunale Arbeitgeber, Wiederverwendung der mit dem Originalvertrag abgeglichenen Quellentabellen. Einfaches Gehaltsformular, Ausbildungsjahr 1–3, keine Ausbildungsdaten oder Gehaltshistorien als Voraussetzung. Zielgerät: iPhone Preview Build 32. Bestehende Freigabe für Git-Lieferung und interne Preview; keine Production-/Store-Veröffentlichung.

## Getrennte Arbeitspakete

1. A: Auswahlvertrag und atomare Speicherung. Scope: domain/nursing-training.ts, domain/types.ts, domain/validation.ts, database/profile-repository.ts, nursing-training-profile.ts, simple-app-profile.ts, preferences-repository.ts, local-backup-validation.ts, nursing-training-profile.test.ts und dieser Beleg.
2. B: Datierte Ausbildungsentgelte und dienstbezogene Zuschläge im einfachen Rechner. Scope: engine/simple-nursing-training-pay.ts, dessen Referenztest und simple-pay.ts; Monats-/Jahres-Lookback in monthly-analysis.ts, annual-core-report.ts premium-details-screen.tsx, tariff-assessment-screen.tsx und salary-screen.tsx.
3. C: Bestehendes Formular und Gehaltsansichten. Scope: settings-form-values.ts, settings-editor-screen.tsx, profile-update.ts, work-profile-summary.ts, month-overview.tsx, salary-screen.tsx und fokussierte Formular-/Auswertungstests.

Keine nativen Änderungen, kein neuer allgemeiner Tarifkatalog, keine Aktivierung anderer DRAFT-Tarife, keine Rückkehr der abgelehnten datierten Untermenüs.

## Abnahme

- Pflege-Azubi-Tarif bewusst wählen; Jahr 1–3 statt P-Gruppe und Stufe.
- Gespeicherte Auswahl nach Neustart und lokalem Backup/Restore erhalten. Ältere Backups behalten ihren bisherigen Modus.
- TVöD-P, manuelles Gehalt und Azubi-Tarif schließen sich aus; Arbeitszeit-/Namensänderungen erhalten die Gehaltswahl.
- 01.04.2025–30.04.2026: 1415,69 / 1477,07 / 1578,38 EUR. Ab 01.05.2026: 1490,69 / 1552,07 / 1653,38 EUR; im derzeit geprüften Datenumfang bis 31.03.2027. Tabelle automatisch nach Auswertungsmonat. Das gewählte Ausbildungsjahr wird nicht aus einem erfundenen Ausbildungsbeginn abgeleitet.
- Eigene Stundenbasis für Zeitzuschläge, Nacht mindestens 1,28 EUR/h, Schichtzulagen 75 Prozent des zutreffenden Arbeitnehmerbetrags. Keine pauschale Übernahme von 25 EUR oder TVöD-P-Pflegezulage.
- Brutto-Schätzung und aufklappbare Dienste im bisherigen Layout; Erwachsenenvergütung und manuelles Gehalt unverändert.
- verify:fast, gezielte Referenz-/Speicher-/Formulartests, vollständige Datenbanktests, sieben CI-Gates; reale iPhone-Abnahme vor Merge.

## Quellen und Grenzen

[VKA TVAöD BT Pflege, ÄTV 18](https://vka.de/wp-content/uploads/2026/04/TVAOED_BT-Pflege_AETV_18_Lesefassung_Stand_01_07_2025.pdf): § 8 Abs. 1 Kategorie b für Pflegeberufegesetz, § 7 Arbeitszeit, § 8b Nachtminimum und Schichtzulagen. [VKA Allgemeiner Teil, ÄTV 14](https://vka.de/wp-content/uploads/2026/04/TVAOED_AT_AETV_14_Lesefassung_Stand_01_08_2025.pdf): § 1 Abs. 1 b und § 8a. Die Kategorie c, Pflegeassistenz, duales Studium und fremde Arbeitgeber-Tarife werden nicht als TVAöD-Pflegefachausbildung ausgegeben.

Die bisherigen DRAFT-Quellenpakete bleiben erhalten. Es werden genau die geprüften TVAöD-Pflege-Daten gezielt für den neuen einfachen Modus verwendet. Der 31.03.2027 ist die derzeitige Datenabdeckung, keine behauptete Vertragsbeendigung oder angekündigte nächste Erhöhung.

Jahressonderzahlung (§ 14, 90 Prozent der relevanten August–Oktober-Basis, Auszahlung November) und besondere Pflegeerschwerniszulagen benötigen eigenständige Anspruchs-/Referenzangaben. Dieses erste einfache Tarifpaket erfindet diese nicht; sie sind als Folgepaket offen. Eine Brutto-Schätzung ersetzt keine vollständige Lohnabrechnung.

## Korrektur nach iPhone-Nachweis vom 05.10.2026

Die drei Screenshots mit Uhrzeit 03:17 belegen die korrekte Ausbildungsvergütung in der Gehaltsdetailansicht, aber eine falsche manuelle Einordnung in Monatsübersicht und Zeitzuschlagsdetails. Ziel: dieselbe Tarifberechnung in diesen beiden vorhandenen Ansichten erkennen. Scope: month-overview.tsx, premium-details-screen.tsx, analysis-rule-coverage.component.test.tsx und dieser Beleg. Keine Formel-, Datenbank-, native oder Layoutänderung. Abnahme: Übersicht zeigt Grundgehalt, Zeitzuschläge und Brutto gesamt statt manuellem Monatsbrutto; Zuschlagsdetails zeigen die berechneten Dienste; echter manueller Modus und fehlende Tarifabdeckung behalten ihre bisherigen Meldungen. Neuer Preview-Nachweis auf dem iPhone vor Merge.
