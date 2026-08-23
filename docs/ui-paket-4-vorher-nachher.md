# UI-Arbeitspaket 4: Tagesdetails und Schichtauswahl

Stand: 23. August 2026
Plattform: iPhone zuerst
Status: lokal umgesetzt und vollständig automatisiert geprüft; Geräteabnahme und Veröffentlichung offen

## Ziel

Tagesdetails und Schichtauswahl folgen demselben visuellen Grundraster wie die bereits vereinheitlichten Hauptseiten. Unabhängig vom Einstiegspunkt erscheint die Auswahl eigener Dienste als dieselbe luftige Vollbildoberfläche. Speichern, Löschen und Template-CRUD behalten ihre bisherigen fachlichen Verträge.

## Vorher/Nachher

| Bereich                    | Vorher                                                                                                    | Nachher                                                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Tagesdetails: Seitenraster | Eigener `ScrollView` mit 16 pt Außenabstand, 16 pt Elementabstand und manuell berechnetem unteren Abstand | Gemeinsamer `ScreenScrollView`: 20 pt Seitenraster, 12 pt Startabstand, 24 pt Hauptrhythmus und 48 pt Abschlussabstand |
| Tagesdetails: Aktionen     | „Schicht hinzufügen“ und „Termin hinzufügen“ gleich stark als Primärbuttons                               | „Schicht hinzufügen“ bleibt Primäraktion; „Termin hinzufügen“ ist klar als Sekundäraktion eingeordnet                  |
| Tagesdetails: Kennzahlen   | Drei Karten immer nebeneinander                                                                           | Bei großer Systemschrift ab Faktor 1,6 untereinander; regulär weiterhin kompakt nebeneinander                          |
| Tagesdetails: Typografie   | Feiertag mit lokaler 13-pt-Schriftdefinition                                                              | Semantischer `label`-Token mit Dynamic-Type-Unterstützung                                                              |
| Schnellauswahl             | Kleine Form-Sheet-Variante mit eigener Liste und eigenem Spacing                                          | Dieselbe Vollbild-Auswahlkomponente wie „Meine Dienste“, inklusive identischer Karten, Zeilen und Navigation           |
| Orientierung               | Titel nur „Schicht“; das gewählte Datum war visuell nicht im Kopf sichtbar                                | Klare Überschrift „Schicht auswählen“ plus ausgeschriebenes Datum direkt darunter                                      |
| Auswahlraster              | Auswahlkarte mit 16 pt Seitenabstand                                                                      | Auswahlkarte am gemeinsamen 20-pt-Screen-Raster                                                                        |
| Fehlermeldungen            | Zwei getrennte Implementierungen mit festem 16-pt-Abstand, ohne sicheren Home-Indicator-Abstand           | Eine gemeinsame Fehlermeldung, am 20-pt-Raster und an der unteren Safe Area ausgerichtet                               |
| Accessibility              | Datum nur Teil des modalen Labels; lokale Schriftgrößen im Header                                         | Sichtbares Datum, präziser Header-Name, Dynamic Type und weiterhin 44 × 44 pt Schließen-Ziel                           |
| Design-Token-Schuld        | Tagesdetails und Schichtauswahl waren als Ausnahmen für rohe Schriftgrößen gelistet                       | Beide Dateien aus der Typografie-Ausnahmeliste entfernt                                                                |

## Bewusst unverändertes Verhalten

- Die Schnellauswahl „Schicht hinzufügen“ trägt eine Vorlage weiterhin hinzu und löscht keinen bestehenden Dienst.
- Der separate Kalender-Flow „Meine Dienste“ behält sein bewusstes Eintragen/Entfernen-Verhalten über `useQuickStampAction`.
- Das Anlegen einer Vorlage aus der Schnellauswahl erzeugt weiterhin nicht automatisch einen Kalendereintrag.
- Template-Bearbeitung, Datenbankzugriffe, Kalenderberechnung und Rückkehrvertrag wurden nicht fachlich verändert.
- Android und native Konfiguration sind nicht Teil dieses Pakets.

## Betroffene Dateien

- `app/_layout.tsx`
- `src/features/calendar/shift-selection-panel.tsx`
- `src/features/calendar/shift-selection-screen.tsx`
- `src/features/calendar/shift-selection-screen.component.test.tsx`
- `src/features/day-details/day-details-screen.tsx`
- `src/features/day-details/day-details-screen.component.test.tsx`
- `src/features/day-editor/quick-add-screen.tsx`
- `src/features/day-editor/quick-add-screen.component.test.tsx`
- `src/theme/design-token-usage.test.ts`

## Automatisierte Abnahme

- TypeScript: bestanden
- ESLint ohne Warnungen: bestanden
- Prettier: bestanden
- Paket-4-Komponententests: 3 Suites, 4 Tests, bestanden
- Design-Token-Audit: 6 Tests, bestanden
- Vollständiges `npm.cmd run verify:fast`: bestanden
- Gesamttests im Projekt-Gate: 62 Vitest-Dateien mit 314 Tests, 38 Jest-Suites mit 102 Tests und 5 Audit-Policy-Tests; insgesamt 421 Tests bestanden

## Noch offen

- Visuelle Prüfung auf einem realen iPhone, insbesondere Kopfbereich, lange Vorlagennamen, große Systemschrift und Home-Indicator-Abstand
- Vorher-/Nachher-Screenshots auf dem Zielgerät
- Commit, Push und EAS Update nur nach jeweils ausdrücklicher Freigabe
