# Auswertung bei maximaler Systemschrift

## Task-Vertrag

Ziel: vollständiger Zeitraum, Überschriften und Kennzahlen in der Auswertungsübersicht
bei großer iPhone-Systemschrift. Referenz: Nutzerscreenshot vom 2026-09-20.

Nicht-Ziele: Berechnungen, Gehalts-/Tariflogik, Prüflogik, gespeicherte Daten,
Animationen und native Konfiguration. Keine Schriftverkleinerung oder Skalierungsgrenze.

Plattform: iPhone 14 Pro Max, Preview Build 31 (bisheriger Nutzer-Testkontext).
Branch: codex/analysis-dynamic-type, Basis origin/master babcca7.
Kein Commit, Push, PR, Merge, Build oder OTA ohne separate Freigabe.

## Dateiscope und Umsetzung

- analysis-period-header.tsx: ab fontScale 1.3 volle Breite für Zeitraum/Jahreslabel,
  Pfeile in einer Zeile darunter; unveränderte Beschriftungen und 44-Punkt-Touchflächen.
- analysis-report-cards.tsx: explizit gestreckte Kartenüberschriften; Stundenkennzahlen,
  Schichtwerte und Summen ab fontScale 1.3 untereinander. Keine Änderung an Zahlen.
- expandable-highlight-card.tsx: Meldungszähler mit Mindestmaßen statt festen Maßen,
  Meldungslabel bei großer Schrift darunter. Gehaltswerte bleiben unverändert.
- compliance-details.tsx: bei großer Schrift Zeilenumbruch vor „keine Auffälligkeiten“.
- analysis-period-arrow.tsx, report-card-title.tsx und analysis-count-badge.tsx:
  kleine ausgelagerte Darstellungskomponenten; bestehende Dateigrößenbudgets bleiben erhalten.
- analysis-dynamic-type.component.test.tsx: Größen 1, 1.29, 1.3, 2, 3.1; Jahreswechsel-
  Darstellung, Schriftwechsel, unveränderte Werte, Pfeile und Toggle, Zähler 0 und 100.

## Grenzen und Abnahme

Der ursprüngliche native Textbeschnitt ist nicht im Komponententest reproduziert.
Die Tests prüfen Layout-Eigenschaften und Interaktionen, nicht native Textmessung.
Geteilte Komponenten gelten auch für Jahresansicht und Prüfdetails.
Höhere Karten benötigen mehr vertikales Scrollen.

Auf dem iPhone nach separat freigegebenem OTA prüfen:

1. Maximalschrift: Monat mit langem Zeitraum vollständig lesbar, Pfeile bedienbar.
2. Prüfung aufklappen: Meldungszahl und vollständiger Status, keine abgeschnittenen Zeilen.
3. Arbeitszeit: Soll, Ist und Saldo samt Vorzeichen vollständig und unverändert.
4. Schichten zählen / Stunden pro Schicht: Titel, Einträge und Gesamtsummen vollständig.
5. Gehalt, Jahresansicht sowie Schriftwechsel maximal → normal bei offener App prüfen;
   Hell/Dunkel und Erreichbarkeit letzter Karte oberhalb der Tab-Leiste bestätigen.

Gerätenachweis: Die Nutzerbilder vom 2026-09-20 zeigen lesbare Auswertungswerte;
anschließend wurde der unten beschriebene kompakte Feinschliff angefordert.

## Kompakter Feinschliff nach Screenshot-Rückmeldung

Die drei Nutzerbilder zeigen lesbare Werte, aber unnötig hohe Dienstzeilen.
Freigegebener Nachtrag: ausschließlich Dienstzeilen in analysis-report-cards.tsx,
zugehörige Komponententests und diese Notiz; bestehender Paketbranch bleibt erhalten.
Bei großer Schrift teilen sich Symbol und Name eine Zeile, der Wert erhält die
volle Breite darunter. Der vertikale Abstand wird auf SPACING.xs reduziert.
Lange Namen bleiben unbegrenzt skalierbar und dürfen umbrechen. Normale Schrift,
Summen, Arbeitszeit, Prüfung und Berechnungen bleiben unverändert.
Abnahme: beide Dienstkarten bei Maximalschrift kompakter, Name und Symbol zusammen,
Wert darunter ohne Beschnitt; Rückwechsel auf normale Schrift unverändert.
Zielgerät bleibt iPhone 14 Pro Max. Preview Build 31 erhielt den Feinschliff mit
OTA-Gruppe `b9c1c4a4-0b36-423f-868c-f317dcdf49b6` (iOS-Update
`01a0bfea-8ba1-7dc1-a6d2-6750ed4598d8`, Runtime
`eac302484061dfb3fa63e2a74b8618ff6000861c`). Nutzerabnahme am 2026-09-20:
„Ja passt“. Keine gesonderte Aussage zu Android oder jedem einzelnen Testzustand.
Commit, Push, PR und Merge wurden danach ausdrücklich freigegeben.

Verifikation des Feinschliffs: 18 gezielte Tests bestanden; `npm.cmd run verify:fast`
erfolgreich (738 Unit-Tests, 409 Komponententests sowie sämtliche übrigen Gates).
