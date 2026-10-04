# Gehaltsfluss: verbindliche Referenzansichten vom 04.10.2026

## Task-Vertrag

Ziel: den vertrauten Gehaltsfluss der drei vom Nutzer gelieferten TestFlight-/Build-Referenzen erhalten und die neuen Berechnungsergebnisse in diese Ansichten integrieren. Ein zusammenhängender Gehaltsfluss umfasst das Einstellungsformular, die Monatsübersicht und ihre Zuschlagsdetails. Die letzte Vereinfachung allein erfüllt diese Referenzen noch nicht.

Plattform: iOS Preview, reales iPhone. Scope: die drei bestehenden Ansichten, zwei lokale Präsentationskomponenten, ihre Tests und dieser Beleg (höchstens 15 Dateien). Drei Teilbereiche werden getrennt umgesetzt und fokussiert geprüft; gemeinsames verify:fast und PR-CI vor Auslieferung. Keine Änderung an Theme, Berechnungsregeln, gespeicherten Daten, nativen Modulen oder Tariffreigaben.

## Bindende Referenzen und Abnahme

- Foto 1: Gehaltsgrundlage, Berufsbereich, ein Berechnungs-/Tarifwähler, Tarifbereich, Tarifgebiet, Entgeltgruppe, Stufe und tarifliche Vollzeit; Speichern. Datum und Historienverwaltung sind kein vorgeschalteter Hauptfluss. Zusätzliche Wochenstunden- und Verlaufsangaben nur bei gezieltem Öffnen.
- Foto 2: großer Monatsbetrag, Filter nach Zuschlagsart, chronologische Dienstkarten, Details erst beim Aufklappen; Daten und Quellen bleiben korrekt auf ihren Dienst oder ihren tatsächlichen Tagesbezug begrenzt.
- Foto 3: großer Monatsbetrag und eine kompakte Zusammensetzung mit einzelnen Zulagen und direkt erreichbaren Zuschlagsdetails. Jahressonderzahlung kommt als Zeile im betreffenden Monat hinzu. Vollständig fehlende Teile werden nicht als null Euro ausgegeben.
- Bestehende Palette für Hell und Dunkel verwenden, keine neue Farbentscheidung. Die Beträge der Referenzbilder sind Darstellungsbeispiele; sie ersetzen keine tatsächliche tarifliche Grundlage.
- Funktionsumfang bleibt neue Tarife, Jahressonderzahlung sowie Azubi-Tarife und Jugendarbeitszeitprüfung. Bereits entstandene Rechner bleiben erhalten; technische Status- und Quellenverwaltung gehört in gezielt geöffnete Details.
- Reale Geräteabnahme der Korrektur offen. Der vorher veröffentlichte Zwischenstand wird durch die neue, konkretisierte Referenz nicht als abgenommen behandelt. Kein UI-Merge vor Geräteabnahme.

## Prüfung

- Zuerst fünf erwartete Referenzregressionen rot bei 66 bestehenden grünen Tests; danach alle 108 gezielten Formular-, Gehalts-, Zuschlags- und Quellenschutzprüfungen grün.
- Vollständiges `verify:fast` bestanden: 372 Vitest-Dateien mit 5.750 Unit-Tests, 113 Jest-Suites mit 842 Komponententests sowie Regel-, Typ-, Lint-, Format- und Skriptprüfungen.
- `release:check` bestanden. Aufgelöste interne iOS-Runtime `f2f4b99ba254b82ab22b99594d5228bd8c3774f7` entspricht dem installierten Preview Build 32.
- Präsentation summiert ausschließlich bereits berechnete Centbeträge. Fehlende Positionen bleiben unvollständig; Tagesaggregate ohne Dienstzuordnung werden nicht einem geratenen Dienst zugewiesen. Dienste aus dem Vormonat werden nach ihrem Abrechnungstag gezeigt.
- Genau 13 UI-, Präsentations-, Test- und Belegdateien. Keine Tarif-, Datenbank-, native oder Theme-Datei geändert. Kontextgraph lokal erneuert.
- Pull-Request-CI und anschließende Preview-Auslieferung noch offen. Reale iPhone-Abnahme bleibt offen; kein UI-Merge vor dieser Abnahme.
