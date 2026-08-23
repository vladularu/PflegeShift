# UI-Paket 3: Vorher-/Nachher-Bericht

Stand: 23. August 2026

Arbeitsbranch: `codex/ui-entry-flows`

Voraussetzung: UI-Paket 1 und 2 auf Commit `471f2ab`

## Ziel und Scope

Paket 3 vereinheitlicht den iPhone-Editor für neue und bestehende Dienste und Termine. Alle vier Kernfälle verwenden nun dieselbe kompakte Kartenstruktur, denselben transparenten Modal-Rahmen und dieselbe Schließen-/Speichern-Interaktion.

Nicht verändert wurden Datenmodell, Berechnungen, Wiederholungs- und Benachrichtigungslogik, Ortssuche, native Konfiguration und Android.

## Vorher und nachher

| Bereich           | Vorher                                                                                                        | Nachher                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Neuer Dienst      | Native `formSheet`-Seite mit Kopfzeile, Modusumschalter, separatem Formularraster und größeren Inhaltsblöcken | Kompakte Editor-Karte wie beim Bearbeiten; direkter Fokus auf Dienst, Beginn, Ende und Pause            |
| Dienst bearbeiten | Eigener, vollständig duplizierter Overlay-Rahmen                                                              | Gemeinsamer `EntryEditOverlayFrame` wie beim Termin                                                     |
| Neuer Termin      | Kompakte Editor-Karte                                                                                         | Unverändert kompakt, jetzt mit derselben Modal-Semantik wie der Dienst                                  |
| Termin bearbeiten | Kompakte Editor-Karte                                                                                         | Unverändert kompakt, jetzt mit derselben Modal-Semantik wie der Dienst                                  |
| Navigation        | Neuer Dienst über `/day-editor`, bestehender Dienst über `/shift-editor`                                      | Neue und bestehende Dienste über `/shift-editor`; der ältere Einstieg erhält dieselben Overlay-Optionen |
| Löschen           | Im Dienst-Overlay immer sichtbar                                                                              | Nur bei bereits gespeicherten Diensten oder Terminen sichtbar                                           |
| Sheet-Verhalten   | Dienst und Termin hatten getrennte Implementierungen für Safe Area, Schatten, Bewegung, Fehler und Abschluss  | Eine gemeinsame Implementierung steuert Layout, Safe Area, Bewegung, Fehler und Abschluss               |
| Barrierefreiheit  | Custom-Overlay ohne explizite Modal-Markierung                                                                | Gemeinsamer Sheet-Inhalt ist mit `accessibilityViewIsModal` als modaler Bereich markiert                |

## Konkrete Änderungen

- Gemeinsame transparente Screen-Optionen für `day-editor`, `shift-editor` und `appointment-editor`.
- Neue Dienste werden direkt zur kompakten Dienst-Route navigiert.
- Neue und bestehende Einträge aktivieren denselben kompakten Editorpfad.
- Der Dienst-Editor verwendet den gemeinsamen Rahmen statt einer zweiten Kopie mit eigenem Animations- und Safe-Area-Code.
- Löschaktionen werden bei noch nicht gespeicherten Diensten ausgeblendet.
- Komponenten- und Navigationstests decken neuen Dienst, beide Editorarten, Modal-Semantik und Löschsichtbarkeit ab.

## Wirkung

- Weniger visueller Kontextwechsel zwischen Anlegen und Bearbeiten.
- Luftigerer Kernfluss ohne redundanten Dienst-/Termin-Umschalter beim direkten Einstieg.
- Identische Außenabstände, Kartenradius, Schatten, Headerhöhe und Abschlussaktion für Dienst und Termin.
- Geringeres Risiko zukünftiger Abweichungen, weil der große duplizierte Rahmen im Dienst-Overlay entfällt.

## Verifikation

- Fokussierter Navigationstest: 9/9 bestanden.
- Fokussierte Editor-Komponententests: 3 Suiten, 16/16 Tests bestanden.
- TypeScript-Prüfung bestanden.
- `git diff --check` bestanden.
- Vollständiges `npm.cmd run verify:fast` bestanden:
  - 62 Vitest-Dateien mit 314 Tests,
  - 37 Jest-Suiten mit 101 Tests,
  - 5 Audit-Policy-Tests,
  - insgesamt 420 bestandene Tests sowie TypeScript, ESLint, Prettier und `git diff --check`.

## Noch offene Abnahme

Die Code- und Komponententests belegen die gemeinsame Struktur und Interaktion, ersetzen aber keine visuelle iPhone-Abnahme. Vor einer Zusammenführung müssen mindestens neuer Dienst, Dienst bearbeiten, neuer Termin und Termin bearbeiten auf dem installierten iOS-Preview-Stand visuell geprüft werden. Es wurde in Paket 3 kein EAS Update veröffentlicht.
