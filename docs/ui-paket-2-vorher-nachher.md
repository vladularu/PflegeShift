# UI-Paket 2: Vorher-/Nachher-Bericht

Stand: 23. August 2026

Arbeitsbranch: `codex/ui-foundation`

Voraussetzung: UI-Paket 1 mit gemeinsamem Screen-Raster

## Ziel und Scope

Paket 2 vereinheitlicht die vier Haupttabs Kalender, Auswertung, Schichten und Mehr. Alle verwenden jetzt dieselbe Header-Grundlage, denselben horizontalen Bezug und – soweit der Inhalt scrollbar ist – dieselbe Screen-Shell. Kalenderraster, Auswertungsberechnung, Schichtenverwaltung, Einstellungen und Navigation wurden funktional nicht verändert.

Bewusst nicht enthalten sind die Vereinheitlichung der Dienst-/Termin-Editoren, Detailseiten, Formulare und modalen Overlays. Diese folgen in den nächsten Arbeitspaketen.

## Vorher / Nachher

| Bereich                      | Vorher                                                                 | Nachher                                                               | Wirkung                                                      |
| ---------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------ |
| Header-Systeme               | Drei getrennte Implementierungen                                       | Eine gemeinsame `TabScreenHeader`-Grundlage                           | Einheitliche Titelkante, Safe Area und Dynamic Type          |
| Titelkante                   | Kalender/Auswertung/Standardheader meist 24 pt                         | Einheitlich 20 pt                                                     | Ruhige vertikale Fluchtlinie                                 |
| Kalenderaktionen             | 6 pt rechter Rand, je 61 pt breit                                      | 20 pt rechter Rand, je 44 pt breit                                    | Kompakter, professioneller und dennoch vollständig bedienbar |
| Kalender während Ladezustand | Native Large-Title-Konfiguration konnte sichtbar werden                | Nativer Root-Header dauerhaft deaktiviert                             | Kein Wechsel zwischen zwei Header-Systemen                   |
| Auswertungszeitraum          | 72 % Breite, negative Offsets, Pfeile 28 × 28 pt                       | Volle Inhaltsbreite, keine absolute Positionierung, Pfeile 44 × 44 pt | Luftiger und sicherer bei großer Schrift                     |
| Schichten-Inhalt             | 16 pt Rand, 16 pt Abstand, 36 pt Abschluss                             | 20 pt Rand, 24 pt Abstand, 48 pt Abschluss                            | Gleiches Raster wie Berichte und Formulare                   |
| Schichten-Texthierarchie     | „Schichten“ plus redundantes „Meine Schichten“                         | Nur „Schichten“                                                       | Weniger Text und direkter Einstieg in die Liste              |
| Mehr-Inhalt                  | 16 pt Rand, 20 pt Abstand, 42 pt Abschluss                             | 20 pt Rand, 24 pt Abstand, 48 pt Abschluss                            | Einheitlicher und luftiger                                   |
| Header-Hintergrund           | Teilweise anderer Hintergrund als Seiteninhalt                         | Header und Inhalt verwenden denselben Surface-Typ                     | Keine sichtbare Farbkante                                    |
| Tab-Beschriftung             | Lokale 11-pt-Werte in zwei Navigationsdateien                          | Gemeinsames `overline`-Typografie-Token                               | Tab-Chrome folgt dem Design-System                           |
| Token-Schulden               | 28 Dateien mit lokaler Typografie, 24 mit lokalem horizontalem Padding | 26 Typografie-, 23 Padding-Dateien                                    | Bestehende Abweichungen messbar reduziert                    |

## Technische Änderungen

- `TabScreenHeader` unterstützt jetzt Theme-Surface, animierte Titel, Zubehör und eine optionale Toolbar-Zeile.
- Kalender- und Auswertungsheader verwenden dieselbe Titelkomponente wie Schichten und Mehr.
- Monats-/Jahresanimationen des Kalenders bleiben erhalten.
- Der Planungsmodus blendet seine Kalenderaktionen weiterhin aus und entfernt sie aus der Accessibility-Struktur.
- Monats- und Jahresnavigation der Auswertung verwendet vollständige 44-pt-Touchziele.
- Schichten und Mehr verwenden `ScreenScrollView` statt eigener ScrollView-Metriken.
- Fehlerhinweise im Kalender sind auf die gemeinsame 20-pt-Inhaltskante ausgerichtet.
- Native- und Fallback-Tab-Leisten beziehen ihre Typografie aus demselben Token.

## Verifikation

Fokussierte Prüfungen:

- TypeScript: bestanden
- Layout-, Token- und Dynamic-Type-Tests: 17 bestanden
- Betroffene Komponententests: 12 bestanden

`npm.cmd run verify:fast` ist vollständig erfolgreich:

- Vitest: 62 Dateien, 314 Tests bestanden
- Jest: 37 Suites, 100 Tests bestanden
- Audit-Policy: 5 Tests bestanden
- ESLint mit 0 Warnungen, Prettier und `git diff --check`: bestanden

Insgesamt wurden erneut 419 automatisierte Tests erfolgreich ausgeführt.

## Visuelle Abnahme

Die Code- und Komponentenabnahme ist abgeschlossen. Paket 2 wurde noch nicht per EAS Update veröffentlicht und deshalb noch nicht auf dem iPhone visuell bestätigt. Das vorherige EAS Update `39b563c9-b874-493d-a81f-f7c3f107b998` enthält ausschließlich den Stand von Paket 1.

Empfohlene Screenshot-Strecke für Paket 2:

1. Kalender in Monats- und Jahresansicht
2. Auswertung in Monats- und Jahresansicht
3. Schichten mit geöffneter Verwaltungszeile
4. Mehr mit allen regulären Abschnitten
5. Dieselben Header bei einer vergrößerten Dynamic-Type-Stufe
