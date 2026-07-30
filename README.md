# MediShift

MediShift ist ein lokaler Dienst- und Terminkalender für iOS und Android. Der MVP läuft mit Expo SDK 54 in Expo Go und benötigt weder Konto noch Backend.

## MVP-Funktionen

- vertikal durchlaufender Monatskalender
- mehrere Dienste und Termine pro Tag
- editierbare Dienstvorlagen mit den CareCheck-Startzeiten
- Urlaub, Krankheit, Fortbildung und Frei
- Soll-, Ist- und Saldostunden pro Monat
- bundesweite und landesweite deutsche Feiertage
- DST-sichere Berechnung von Diensten über Mitternacht
- SQLite-Persistenz mit Revisionen und Soft-Delete
- System-Hell-/Dunkelmodus

## Starten

```powershell
npm.cmd install
npm.cmd start
```

Anschließend den QR-Code mit Expo Go öffnen. Für Android kann alternativ `npm.cmd run android` verwendet werden, wenn ein Gerät oder Emulator verbunden ist.

Für den Browser:

```powershell
npm.cmd run web
```

## Qualität

```powershell
npm.cmd run lint -- --max-warnings 0
npm.cmd run typecheck
npm.cmd test
npm.cmd run export:web
npm.cmd run export:android
npm.cmd run export:ios
```

Die Tests umfassen Kalender- und Feiertagslogik, Sommer-/Winterzeit, Monatsstunden sowie echte SQLite-Migrationen und CRUD-Lebenszyklen.

## Struktur

```text
app/                         Expo-Router-Routen
src/application/             reaktiver App- und Datenzustand
src/domain/                  öffentliche Typen und Validierung
src/engine/                  Kalender-, Feiertags- und Stundenlogik
src/features/                Kalender, Tageseditor, Vorlagen, Onboarding
src/infrastructure/database/ Migrationen und SQLite-Repositories
src/theme/                   MediShift-Farbwelt
scripts/                     reproduzierbare Markenassets
```

## Fachliche Grenzen des MVP

Sollzeit wird als `Wochenarbeitszeit ÷ 5 × Werktage` berechnet. Bundesweite und landesweite Feiertage werden berücksichtigt; kommunale Ausnahmen noch nicht. Termine beeinflussen Arbeitsstunden nicht.

Nicht enthalten sind Cloud-Sync, Benutzerkonten, Erinnerungen, externe Kalender, Serien/Rotationen, TVöD-Zuschläge, Gehaltsberechnung, ArbZG-Prüfungen, Exporte, Widgets und Smartwatch-Unterstützung.

## SDK-54-Hinweis

`expo-doctor` bestätigt die vollständige SDK-54-Kompatibilität. Der npm-Audit führt weiterhin transitive Hinweise aus Expo-/React-Native-Buildwerkzeugen auf; die angebotene automatische Behebung würde Expo auf SDK 57 anheben und wurde wegen der festgelegten SDK-54-Vorgabe bewusst nicht angewendet.
