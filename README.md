# PflegeShift

PflegeShift ist ein lokaler, iPhone-first Dienstplaner für Schichtarbeit. Die App verbindet Kalender, Arbeitszeitauswertung und eine unverbindliche TVöD-P-Gehaltsberechnung in einer ruhigen, systemadaptiven Oberfläche.

PflegeShift basiert auf Expo SDK 57, React Native und SQLite. Die Kernfunktionen benötigen weder Konto noch PflegeShift-Backend; persönliche Planungsdaten bleiben lokal auf dem Gerät. Die optionale Ortssuche und Kartenansicht verwenden auf iOS Apple-Dienste und auf Android den systemseitigen Geocoder sowie Google Maps. Suchtext, Kartenbereich und gespeicherte Koordinaten können dabei an den jeweiligen Anbieter übermittelt werden; PflegeShift liest keine aktuelle GPS-Position und betreibt kein Standorttracking. Der genaue Vertrag steht in [`docs/location-data-flows.md`](docs/location-data-flows.md).

> **Veröffentlichungsstand:** Für PflegeShift ist derzeit kein Beta-Tag als aktuelle Installations- oder Migrationsbasis freigegeben. [`v0.1.0-beta.1`](https://github.com/vladularu/PflegeShift/releases/tag/v0.1.0-beta.1) gehört noch zu MediShift und verwendet andere App- und Datenbank-IDs.

## Hauptbereiche

### Kalender

- Monats- und Jahresansicht ohne dauerhaft eingeblendete Kalenderwochen
- vertikaler Monatswechsel und direkter Sprung zum heutigen Datum
- Dienste und Abwesenheiten als kompakte Farbbalken, Termine als Punkt mit Kurztext
- sichtbare Feiertagsnamen entsprechend dem gewählten Bundesland
- Tagesdetails mit Soll-, Ist- und Saldostunden
- Schnelleingabe für vorhandene Dienstvorlagen, Urlaub, Krank und Frei
- Stempelmodus zum Eintragen desselben Dienstes an mehreren Tagen
- Terminserien, lokale Erinnerungen sowie optionale Orts- und Kartenangaben
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

PflegeShift speichert Profileinstellungen, Dienstvorlagen, Einträge und Monatsentscheidungen in einer lokal mit SQLCipher verschlüsselten SQLite-Datenbank. Der Schlüssel liegt im nativen SecureStore. Änderungen verwenden Revisionen und Soft-Delete, damit Datensätze konsistent aktualisiert werden können.

Nicht enthalten sind:

- Benutzerkonten oder Cloud-Synchronisation
- externe Kalender-Synchronisation
- automatische Backups
- automatische Dienstserien und Rotationsregeln
- verbindliche Lohnabrechnungen

## Entwicklung starten

Voraussetzungen:

- Node.js und npm
- Android Studio für einen lokalen Android-Native-Build oder Xcode für einen lokalen iOS-Native-Build
- alternativ ein eingerichtetes Expo-/EAS-Konto für interne Geräte-Builds

```powershell
npm.cmd install
npm.cmd run workflow:setup
npm.cmd run web
```

Expo Go wird nicht unterstützt, weil es nicht mit der projektspezifischen SQLCipher-Konfiguration gebaut ist. Native Entwicklung und Abnahme müssen in einem eigenen nativen Build erfolgen.

Lokalen Native-Build starten. Android bleibt bis zur erneuten technischen und realen Geräteabnahme pausiert:

```powershell
npx.cmd expo run:android
# auf macOS:
npx.cmd expo run:ios
```

Auf Windows wird der iOS-Build über EAS erzeugt. Das EAS-Projekt ist bereits verknüpft; vor einem freigegebenen Build werden Konto, Projekt und Zugangsdaten geprüft.

Die generierten Verzeichnisse `android/` und `ios/` sind lokale Buildartefakte und werden nicht committed.

## Qualitätssicherung

```powershell
npm.cmd run verify:fast
# vor Release-Kandidaten oder größeren Integrationen:
npm.cmd run verify:full
```

Die Tests decken unter anderem Kalender- und Feiertagslogik, Monatswechsel, Schnelleingabe, Abwesenheiten, Nachtarbeit, TVöD-Zulagen, Gehaltsaggregation, ArbZG-Hinweise sowie SQLite-Migrationen und CRUD-Lebenszyklen ab.

Aufgaben werden über kurzlebige `codex/<thema>`-Branches und Pull Requests bearbeitet. Scope, Gates und Geräteabnahme sind in der [Workflow-Dokumentation](WORKFLOW.md) festgelegt.

## Release-Kandidat

Die lokale Release-Konfiguration trennt zwei sichere Wege:

- `preview`: intern installierbare iOS-Builds; das vorhandene Android-Profil bleibt für die spätere Wiederaufnahme erhalten
- `production`: Store-Builds mit automatisch erhöhten Buildnummern; Android bleibt bis zur ausdrücklichen Wiederaufnahme pausiert

Vor einem ausdrücklich freigegebenen signierten Build werden die bestehende Projektverknüpfung und das Expo-Konto geprüft:

```powershell
npx.cmd eas-cli@latest whoami
npx.cmd eas-cli@latest build --platform ios --profile preview
```

Expo-, Apple- und Google-Zugangsdaten gehören nicht ins Repository. TestFlight-, Play-Console-, Datenschutz- und Store-Metadaten werden außerhalb des Quellcodes gepflegt.

Die vollständige Abnahme steht in der [Release-Checkliste](docs/release-checklist.md).

## Testlabor

Das interne Testlabor erzeugt reproduzierbare Testmonate und ist ausschließlich in Entwicklungs- und internen Preview-Builds verfügbar:

1. Tab **Mehr** öffnen.
2. Die obere grüne PflegeShift-Karte fünf Sekunden gedrückt halten.
3. Unter **Intern** das **Testlabor** öffnen.

Verfügbar sind unter anderem normale Rotation, zuschlagsreiche Monate, Compliance-Fälle und UI-Stresstests. Testläufe sichern vorhandene Monatsdaten und können anschließend wiederhergestellt oder übernommen werden.

## Projektstruktur

```text
app/                         Expo-Router-Routen und Tab-Stacks
src/application/             Provider und reaktiver App-Zustand
src/domain/                  Typen und Eingabevalidierung
src/engine/                  Kalender-, Arbeitszeit-, TVöD- und Gehaltslogik
src/features/                Kalender, Auswertung, Gehalt, Editoren und Einstellungen
src/infrastructure/database/ SQLCipher-Start, SQLite-Migrationen und getrennte Repositories
src/navigation/              Tabs und typisierte Routenziele
src/theme/                   semantische Farben und Schichtdarstellung
src/ui/                      wiederverwendbare Design- und Formkomponenten
scripts/                     reproduzierbare Markenassets
```

## Technischer Stand

- Expo SDK 57
- Expo Router mit nativen Tabs auf iOS und Android
- React Native New Architecture und React Compiler
- SQLite als lokale Datenquelle
- SQLCipher und SecureStore für lokale Verschlüsselung
- Vitest mit Coverage-Schwellen sowie Jest/RNTL für Komponententests
- statischer Web-Export
