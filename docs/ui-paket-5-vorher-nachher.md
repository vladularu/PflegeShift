# UI-Arbeitspaket 5: Auswertungsdetails

Stand: 23. August 2026
Plattform: iPhone zuerst
Status: lokal umgesetzt und vollständig automatisiert geprüft; Geräteabnahme folgt

## Ziel

Zeitzuschläge, Arbeitszeitprüfung und Schichtzulagen-Einordnung verwenden dieselbe ruhige Detailstruktur: Monat, Ergebnis und Erklärung stehen immer in einem klaren Ergebnisblock. Darunter folgen Belege beziehungsweise Eingaben im gemeinsamen Screen-Raster. Die Gestaltung bleibt sachlich, schnell scannbar und auf wiederholte Nutzung im Pflegealltag ausgelegt.

## Vorher/Nachher

| Bereich             | Vorher                                                                                  | Nachher                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Screen-Raster       | Drei eigene `ScrollView`-Definitionen mit 16 pt Rand, 16 pt Abstand und 36 pt Abschluss | Gemeinsamer `ReportScrollView` mit 20 pt Rand, 24 pt Hauptrhythmus und 48 pt Abschluss       |
| Ergebnisbereich     | Zeitzuschläge in einer Karte; Arbeitszeitprüfung und Schichtzulage als freie Textblöcke | Einheitliche Ergebnis-Karte mit Reihenfolge Monat → Ergebnis → Erklärung                     |
| Arbeitszeitprüfung  | Sichtbarer Titel kombinierte „kritisch“- und „Hinweise“-Zahlen                          | Neutrale Gesamtzahl „Meldung/Meldungen“; Farbe transportiert die höchste Dringlichkeit       |
| Zeitzuschläge       | Lokale Kartenabstände und 13-pt-Leertext                                                | Gemeinsame Spacing- und Typografie-Tokens; Betrag bleibt bewusst die stärkste Kennzahl       |
| Zuschlagspositionen | Betrag und Beschreibung immer horizontal                                                | Bei großer Systemschrift ab Faktor 1,6 untereinander; Betrag bleibt rechts ausgerichtet      |
| Tarifkriterien      | Lokale 12/13-pt-Schriften, 24-pt-Statussymbol und ungleichmäßige Einzüge                | Lesetypografie aus dem Design-System, 28-pt-Statussymbol und exakt ausgerichtete Trennlinien |
| Tariffragen         | Auswahlzustand hauptsächlich über Farbe, lokale Radien und Abstände                     | Stabile 44-pt-Radioziele mit Kreis-/Hakenform, gemeinsamen Radien und Token-Abständen        |
| Speichern           | Eigener 48-pt-Button ohne sichtbaren Fortschritt                                        | Gemeinsamer 52-pt-Primärbutton mit Spinner, Busy-Ansage und Schutz vor Doppeltippen          |
| Fehler              | Kleiner roter Freitext                                                                  | Gemeinsamer `FormStatus` als sichtbarer und semantischer Alert                               |
| Manuelle Auswahl    | Textzeichen `+`, `−`, `●` und `○`                                                       | Vertraute Chevron- und Radio-Icons mit unveränderten Accessibility-Rollen                    |
| Design-Token-Schuld | Drei Typografie-, zwei Radius- und zwei Padding-Ausnahmen                               | Alle sieben Ausnahmen aus dem Token-Gate entfernt                                            |

## Bewusst unverändertes Verhalten

- Berechnung von Zeitzuschlägen, Arbeitszeitmeldungen und Schichtzulagen
- Drei-Monats-Auswertung und Kriterienlogik der Tarifeinordnung
- Speichern der Arbeitsplatzangaben und manuellen Monatswerte
- Routen, Sheet-Höhen und Rückkehrverhalten
- Datenmodell, Datenbank und native Konfiguration
- Android

## Betroffene Dateien

- `src/features/analysis/analysis-detail-layout.tsx`
- `src/features/analysis/analysis-detail-layout.component.test.tsx`
- `src/features/analysis/premium-details-screen.tsx`
- `src/features/analysis/compliance-details-screen.tsx`
- `src/features/analysis/compliance-details-screen.component.test.tsx`
- `src/features/analysis/analysis-screen.tsx`
- `src/features/analysis/tariff-assessment-screen.tsx`
- `src/features/analysis/tariff-assessment-screen.component.test.tsx`
- `src/features/analysis/tariff-question.tsx`
- `src/ui/design-system.tsx`
- `src/ui/form-controls.tsx`
- `src/ui/form-controls.component.test.tsx`
- `src/theme/design-token-usage.test.ts`

## Automatisierte Abnahme

- TypeScript: bestanden
- ESLint ohne Warnungen: bestanden
- Paket-5-Fokustests: 5 Suites, 13 Tests, bestanden
- Design-Token-Audit: 6 Tests, bestanden
- Vollständiges `npm.cmd run verify:fast`: bestanden
- Gesamttests im Projekt-Gate: 62 Vitest-Dateien mit 314 Tests, 40 Jest-Suites mit 106 Tests und 5 Audit-Policy-Tests; insgesamt 425 Tests bestanden

## Noch offen

- Visuelle Prüfung auf einem realen iPhone: alle drei Detail-Sheets, lange Tariftitel und große Systemschrift
- Vorher-/Nachher-Screenshots auf dem Zielgerät
- Commit, Push und EAS Update nur nach jeweils ausdrücklicher Freigabe
