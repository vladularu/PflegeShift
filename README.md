# MediShift

MediShift ist ein lokaler, iPhone-first Dienstplaner für Schichtarbeit. Die App verbindet Kalender, Arbeitszeitauswertung und eine unverbindliche TVöD-P-Gehaltsberechnung in einer ruhigen, systemadaptiven Oberfläche.

MediShift basiert auf Expo SDK 54, React Native und SQLite. Die Nutzung benötigt weder Konto noch Backend; alle persönlichen Planungsdaten bleiben lokal auf dem Gerät.

> **Beta:** Die aktuelle Vorabversion ist [`v0.1.0-beta.1`](https://github.com/vladularu/MediShift/releases/tag/v0.1.0-beta.1).

## Hauptbereiche

### Kalender

- Monats- und Jahresansicht ohne dauerhaft eingeblendete Kalenderwochen
- vertikaler Monatswechsel und direkter Sprung zum heutigen Datum
- Dienste und Abwesenheiten als kompakte Farbbalken, Termine als Punkt mit Kurztext
- sichtbare Feiertagsnamen entsprechend dem gewählten Bundesland
- Tagesdetails mit Soll-, Ist- und Saldostunden
- Schnelleingabe für vorhandene Dienstvorlagen, Urlaub, Krank und Frei
- Stempelmodus zum Eintragen desselben Dienstes an mehreren Tagen
- native Zeitwahl auf iOS und Android

### Auswertung

- Monats- und Jahresauswertung
- Soll-, Ist- und Saldostunden
- Dienstverteilung
- Arbeitszeit- und Planungshinweise
- automatische Empfehlung für Schicht- und Wechselschichtzulagen
- manuelle Bestätigung der tatsächlich anzuwendenden Zulage

### Gehalt

- unverbindliche monatliche Brutto-Schätzung
- TVöD-P-Tabellenentgelt nach Bereich, Gruppe und Stufe
- Zeit-, Überstunden-, Schicht- und Wechselschichtzuschläge
- TVöD-Zulage und Pflegezulage
- nachvollziehbare Aufschlüsselung einzelner Zeitzuschläge

### Mehr

- Bundesland und Wochenarbeitszeit
- TVöD-Bereich, Entgeltgruppe und Stufe
- Verwaltung und Sortierung der Dienstvorlagen
- lokale App- und Dateninformationen
- systemabhängiger Hell-/Dunkelmodus

## Fachliche Grundlagen

- Dienste über Mitternacht und Zeitumstellungen werden zeitzonensicher berechnet.
- Termine zählen nicht als Arbeitszeit.
- Feiertage werden bundeslandbezogen berücksichtigt; kommunale Sonderregelungen sind nicht vollständig abgedeckt.
- Abwesenheiten werden entsprechend der hinterlegten Wochenarbeitszeit angerechnet.
- Die Schichtzulagen-Erkennung wertet Dienstwechsel und qualifizierende Nachtdienste aus. Eine manuell bestätigte Monatsentscheidung hat Vorrang.
- Gehaltswerte sind Schätzungen und ersetzen weder Lohnabrechnung noch tarifliche oder rechtliche Prüfung.

## Lokale Datenhaltung

MediShift speichert Profileinstellungen, Dienstvorlagen, Einträge und Monatsentscheidungen in einer lokalen SQLite-Datenbank. Änderungen verwenden Revisionen und Soft-Delete, damit Datensätze konsistent aktualisiert werden können.

Nicht enthalten sind:

- Benutzerkonten oder Cloud-Synchronisation
- externe Kalender-Synchronisation
- automatische Backups
- Serien- und Rotationsregeln
- verbindliche Lohnabrechnungen

## Entwicklung starten

Voraussetzungen:

- Node.js und npm
- Expo Go auf einem kompatiblen iOS- oder Android-Gerät

```powershell
npm.cmd install
npm.cmd start
```

Anschließend den QR-Code mit Expo Go öffnen.

Plattformspezifisch starten:

```powershell
npm.cmd run ios
npm.cmd run android
npm.cmd run web
```

Wenn Entwicklungsrechner und Mobilgerät nicht im selben Netzwerk sind:

```powershell
npx.cmd expo start --tunnel
```

## Qualitätssicherung

```powershell
npm.cmd run lint -- --max-warnings 0
npm.cmd run typecheck
npm.cmd test
npm.cmd run export:web
npm.cmd run export:android
npm.cmd run export:ios
```

Die Tests decken unter anderem Kalender- und Feiertagslogik, Monatswechsel, Schnelleingabe, Abwesenheiten, Nachtarbeit, TVöD-Zulagen, Gehaltsaggregation, ArbZG-Hinweise sowie SQLite-Migrationen und CRUD-Lebenszyklen ab.

## Testlabor

Das interne Testlabor erzeugt reproduzierbare Testmonate und ist standardmäßig verborgen:

1. Tab **Mehr** öffnen.
2. Die obere grüne MediShift-Karte fünf Sekunden gedrückt halten.
3. Unter **Intern** das **Testlabor** öffnen.

Verfügbar sind unter anderem normale Rotation, zuschlagsreiche Monate, Compliance-Fälle und UI-Stresstests. Testläufe sichern vorhandene Monatsdaten und können anschließend wiederhergestellt oder übernommen werden.

## Projektstruktur

```text
app/                         Expo-Router-Routen und Tab-Stacks
src/application/             Provider und reaktiver App-Zustand
src/domain/                  Typen und Eingabevalidierung
src/engine/                  Kalender-, Arbeitszeit-, TVöD- und Gehaltslogik
src/features/                Kalender, Auswertung, Gehalt, Editoren und Einstellungen
src/infrastructure/database/ SQLite-Migrationen und Repositories
src/navigation/              Tabs und typisierte Routenziele
src/theme/                   semantische Farben und Schichtdarstellung
src/ui/                      wiederverwendbare Design- und Formkomponenten
scripts/                     reproduzierbare Markenassets
```

## Technischer Stand

- Expo SDK 54
- Expo Router mit nativen Tabs auf iOS und Android
- React Native New Architecture und React Compiler
- SQLite als lokale Datenquelle
- Vitest für Fach- und Repositorytests
- statischer Web-Export
