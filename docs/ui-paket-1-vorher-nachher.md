# UI-Paket 1: Vorher-/Nachher-Bericht

Stand: 23. August 2026

Ausgangsbasis: `15f3a76`

Arbeitsbranch: `codex/ui-foundation`

## Ziel und Scope

Paket 1 schafft eine belastbare UI-Grundlage für die anschließende Vereinheitlichung der Hauptseiten und Editor-Flows. Umgesetzt wurden gemeinsame Screen-Metriken, eine wiederverwendbare Screen-Shell, angehobene Lesetypografie, eine klare Button-Hierarchie, semantische Overlay-Farben und rekursive Design-Token-Gates.

Bewusst nicht enthalten sind die vollständige Umstellung aller Haupttabs, die Vereinheitlichung der Dienst-/Termin-Editoren, Änderungen an Fachlogik oder Navigation sowie Native-/EAS-Arbeiten. Diese Punkte gehören in die folgenden Pakete.

## Vorher / Nachher

| Bereich               | Vorher                                                                | Nachher                                                                          | Wirkung                                               |
| --------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Screen-Raster         | Formulare und Reports nutzten eigene Werte; meist 16 pt Seitenabstand | Gemeinsame `ScreenScrollView` mit 20 pt Seitenabstand                            | Ruhigere, konsistentere Kantenführung                 |
| Vertikaler Rhythmus   | Formularabstand 20 pt, Reportabstand 16 pt                            | Gemeinsamer Inhaltsabstand 24 pt                                                 | Luftiger und besser scannbar                          |
| Unterer Abschluss     | Formulare standardmäßig 40 pt, Reports 48 pt                          | Gemeinsamer Standard 48 pt                                                       | Einheitlicher Abschluss über der Safe Area            |
| Tab-Header            | Eigene Implementierung mit 24 pt Seitenabstand                        | Gemeinsamer `TabScreenHeader` mit 20 pt Raster                                   | Grundlage für einheitliche Hauptseiten                |
| Große Schrift         | Header ohne semantischen Dynamic-Type-Ramp                            | `largeTitle`; Zubehör stapelt ab Font Scale 1,6                                  | Robuster bei großen Bedienungshilfen-Schriften        |
| Abschnittstitel       | 16/22 pt                                                              | 17/23 pt                                                                         | Klarere Hierarchie                                    |
| Fließtext             | 15/22 pt                                                              | 16/23 pt                                                                         | Bessere Lesbarkeit bei weiter kompakter iPhone-Dichte |
| Buttontext            | 15/20 pt                                                              | 16/22 pt mit `headline`-Ramp                                                     | Prägnantere Aktionen und bessere Skalierung           |
| Button-Hierarchie     | Primär/Gefahr vorhanden, keine gemeinsame sekundäre Stufe             | Primär/Gefahr 52 pt, Sekundär 48 pt, Mindest-Touchziel 44 pt                     | Klarere Gewichtung von Aktionen                       |
| Sheet-Overlay         | Feste schwarze Deckkraft 0,64 in Feature-Code                         | Semantisches Theme-Overlay: hell 0,32, dunkel 0,52                               | Weniger schwer, theme-konsistent                      |
| Switch-/Grabber-Farbe | Lokale Weiß-Literale                                                  | Gemeinsames kontrastgeprüftes Text-Token                                         | Keine isolierte Farblogik                             |
| Token-Prüfung         | Nur 7 manuell ausgewählte Dateien, nur Farbwerte                      | Rekursiv 132 produktive UI-Quellen; Farbe, Typografie, Radien und Seitenabstände | Neue Abweichungen werden automatisch blockiert        |

## Technische Änderungen

- `SCREEN_LAYOUT` bündelt Seitenabstand, Inhaltsabstände, Header-Metriken und Dynamic-Type-Breakpoint.
- `MINIMUM_TOUCH_TARGET` definiert das gemeinsame 44-pt-Minimum.
- `ScreenScrollView` vereinheitlicht Form- und Report-Seiten, ohne Keyboard- oder Safe-Area-Verhalten zu verlieren.
- `TabScreenHeader` ist Safe-Area-fähig, unterstützt Zubehör und reagiert auf große Schrift.
- `PrimaryButton`, Gefahr- und neuer `SecondaryButton` teilen Implementierung, Motion und Accessibility-Verhalten.
- Drei lokale Farb-Literale in den Editor-Overlays wurden durch semantische Palette-/Kontrastwerte ersetzt.
- Bestehende Token-Schulden wurden exakt erfasst. Neue Dateien oder neue Abweichungen lassen die Tests fehlschlagen.

## Verifikation

`npm.cmd run verify:fast` ist vollständig erfolgreich:

- TypeScript: bestanden
- ESLint mit 0 erlaubten Warnungen: bestanden
- Prettier: bestanden
- Vitest: 62 Dateien, 314 Tests bestanden
- Jest-Komponententests: 37 Suites, 100 Tests bestanden
- Audit-Policy: 5 Tests bestanden
- `git diff --check`: bestanden

Insgesamt wurden 419 automatisierte Tests erfolgreich ausgeführt.

## Verbleibende UI-Schulden

Die neuen Gates frieren den Bestand ein, lösen ihn aber bewusst nicht vollständig in Paket 1:

- 28 Dateien besitzen noch lokale Typografie-Metriken.
- 24 Dateien besitzen noch lokale Radiuswerte.
- 24 Dateien besitzen noch lokale horizontale Paddingwerte.
- Der Quick Planner besitzt noch ein lokales iOS-Blau und Weiß; seine Umstellung gehört mit dem Kalender in Paket 2.
- Die drei unterschiedlichen Haupttab-Header und die unterschiedlichen Neu-/Bearbeiten-Flows werden erst in den nächsten Paketen auf die neue Grundlage migriert.

## Visuelle Abnahme

Die Änderungen sind durch Code-, Komponenten- und Accessibility-Prüfungen abgesichert. Eine echte iPhone-Abnahme mit Vorher-/Nachher-Screenshots ist noch offen. Dafür muss die Änderung über einen ausdrücklich freigegebenen, zur installierten Preview-App passenden EAS Update oder einen neuen Preview-Build auf das Zielgerät gelangen. EAS-Metadaten oder Tests allein gelten nicht als visueller Nachweis.

Empfohlene Screenshot-Strecke nach Freigabe: Einstellungen, Vorlagen, Jahresauswertung, Dienst bearbeiten und Termin bearbeiten – jeweils in normaler Schrift sowie mit vergrößerter Dynamic-Type-Stufe.
