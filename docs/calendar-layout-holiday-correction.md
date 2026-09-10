# Kalenderlayout und Feiertagshinweis – lokaler Kandidat

Freigabe: nur lokale Umsetzung und Prüfung. Basis 7a8f1bd, bestehender isolierter
Kalenderbranch. Kein Commit, Push, Build, OTA oder Merge.

Zielgerät: iPhone 14 Pro Max, iOS 26.6.1, Build 31. Expo SDK 57
(https://docs.expo.dev/versions/v57.0.0/sdk/reanimated/).

Scope: Kalenderkopf, opt-in Titelgeometrie im gemeinsamen Header, Feiertagsanzeige,
Hinweisweitergabe an Kalenderdarstellung, zugehörige Tests. Keine historischen
Regelpakete, Gehaltslogik, Datenbank, Abhängigkeiten oder Animationstimings ändern.

- Zwei bestehende Buttons; kein zusätzlicher Info-Platz. Ein absolut positionierter
  Punkt und das Accessibility-Label weisen auf die vollständige Meldung in der
  Kalenderdarstellung hin. Die Meldung beschreibt den Zustand beim Öffnen.
- Kalenderüberschriften bleiben einzeilig in einem von der Schriftvergrößerung,
  aber nicht vom Titeltext abhängigen Höhenrahmen. Lange Titel passen ihre Schrift
  an die verfügbare Breite an; das fremde Jahr bleibt Teil des Titels und VoiceOver.
  Andere App-Header behalten ihren bisherigen Zeilenumbruch.
- Die Monatsansicht prüft nur den dargestellten Monat. Unsichtbare Nachbarmonate
  lösen keinen Abdeckungshinweis aus. Echte Lücken bleiben gemeldet.

Lokale Abnahme: Titelvertrag für September 2027/Jahr, exakt zwei Buttons mit/ohne
Hinweis, Januar/Dezember mit begrenztem Regelpaket und echte fehlende Monate,
validierte Hinweisweitergabe; verify:fast.

Geräteabnahme offen: erste und wiederholte Wechsel Januar/September/Dezember
2026/2027, beide Richtungen, Hell/Dunkel und große Schrift. Keine wechselnde
Kalenderhöhe, keine abgeschnittenen Titel/Jahreszahlen. Tests beweisen nicht die
native Flüssigkeit. Bleibt der Ruckler, keine weitere ungezielte Timing-Korrektur.

## Lokales Ergebnis – 10.09.2026

- `verify:fast` bestanden: 602 Unit-Tests, 268 Komponententests und alle
  Skriptprüfungen; Typecheck, Lint, Formatierung und Diff-Check grün.
- Titelgeometrie für Schriftfaktoren 1, 1.4 und 2 getestet. Die bestehende
  Schrumpf-Schutzregel erlaubt ausschließlich den opt-in stabilen Header;
  Testdateien werden bei der Produktionscode-Suche nicht mitgezählt.
- Interner iOS-Export bestanden:
  `entry-5d49f7a219d08a49986edcd488c80978.hbc`.
- Runtime unverändert: `eac302484061dfb3fa63e2a74b8618ff6000861c`.
- Aktueller Graph lokal unter `artifacts/calendar-layout-final-graph`.
- 13 Task-Dateien; fremde Ignore-/Graft-Änderungen unberührt.
- Kein Commit, Push oder Upload. Geräteabnahme ausstehend.
