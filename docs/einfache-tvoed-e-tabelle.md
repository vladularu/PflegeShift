# TVöD VKA E-Tabelle im einfachen Pflegefluss

## Auftrag und Abnahme

- Ziel: Auswahl „TVöD · E-Tabelle“, vertragliche Entgeltgruppe und Stufe, vertraute Monats-/Jahresauswertung und Zeitzuschlagskarten.
- Plattform: iOS Preview, installiertes Build 32; reale iPhone-Abnahme vor Merge.
- Scope A: domain/types, domain/vka-e-tariff, domain/validation, database/simple-salary-profile (ersetzt nursing-training-profile), profile-repository, preferences-repository, simple-app-profile, local-backup-validation und Persistenztests.
- Scope B: lokale E-Tabellen-/Berechnungsadapter, simple-pay, fachliche Quellen-/Regressionstests.
- Scope C: bestehendes Gehaltsformular, Profilzusammenfassung, Monats-/Jahresauswertung, Gehalt, Zeitzuschläge, bestehende Schichtzulagenprüfung und Komponententests.
- Nicht-Ziele: automatische Eingruppierung anhand eines Studiums, verpflichtende Datumsangaben, Gehaltshistorien, weitere Untermenüs, TVöD Bund, Ärztevergütung, neue Native-Abhängigkeiten, Backend/Production/TestFlight.
- Der Nutzer hat die Umsetzung nach Erklärung des Tarifs freigegeben. Tabellen und Quellen der vorbereiteten Arbeit werden dafür erneut geprüft und gezielt wiederverwendet. Frühere DRAFT-Bedienabläufe werden nicht aktiviert.
- Git-Lieferung und interne Preview-OTA sind durch die bestehende Nutzerfreigabe umfasst. Gerätenachweis bleibt offen bis ausdrücklicher Abnahme.

## Quellen und fachliche Grenzen

VKA Originalfassungen vom 6. April 2025, erneut geprüft 5. Oktober 2026:

- https://vka.de/wp-content/uploads/2026/04/250406_TVoeD_Krankenhaeuser_TV-Aerzte-VKA.pdf
- https://vka.de/wp-content/uploads/2026/04/250406_TVoeD_Pflege_u_Betreuungseinrichtungen.pdf

Anlage A: 17 Gruppen, 101 gültige Zellen je Periode, EG1 ohne Stufe1. April2025–April2026 und Mai2026–März2027. Das Datendeckungsende behauptet keine neue Tabelle ab April2027.
BT-K §44:38,5h, KAV BW39h. BT-B §6:39h. Zuschläge nach §8 auf Stufe3; Überstunden-Grundentgelt auf persönlicher Stufe maximal4, Zuschlag E1–E9b30%, E9c–E15 15%. Pausen/DST aus den bestehenden Kalenderhilfen.
BT-K §52(5):E5–E15 feste25€/BW35€; BT-B §51a(4) betrifft nurP-Gruppen. Pflegezulage §52(6)/§51a(5) betrifft nurP-Gruppen. Keine Übertragung aufE.
Die Eingruppierung für Hochschulpflegekräfte steht in der Entgeltordnung (BT-K S.139–140); ein Studium allein bestimmt keine Gruppe. Tabelle und Stufe werden dem Arbeitsvertrag entnommen.
Jahressonderzahlung bleibt ein getrenntes Folgepaket und wird nicht aus ungeprüften Beschäftigungsvoraussetzungen erfunden.

## Lokale Prüfung

verify:fast vollständig grün: 5.859 Vitest-Tests in378 Dateien,572 Komponententests in94 Suiten sowie sämtliche Werkzeug-/Regel-/Runtime-/Build-Abhängigkeitsprüfungen. Typen, Lint, Format und git diff --check grün. Geräteabnahme folgt nach Preview-OTA.

VKA-PDF-SHA256 live verifiziert; beide Generator-Kandidatenchecks sowie202 Quellentabellenzellen bestanden. 31 Persistenz-,36 Berechnungs-/Regressionstests und50 fokussierte Komponententests grün. iOS-Fingerprint identisch mit installiertem Build32: f2f4b99ba254b82ab22b99594d5228bd8c3774f7.
