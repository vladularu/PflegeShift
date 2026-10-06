# Arbeitsprofil-Flow (iOS)

## Auftrag und Abnahme

Ausgangspunkt ist der bisher abgenommene Preview-Stand; Umsetzung auf Branch `codex/work-profile-flow`. Die Geräteabnahme des neuen Arbeitsprofil-Flows steht noch aus. Expo SDK 57 (`~57.0.22`), Expo Router und vorhandene LUNA-Komponenten. Die zuvor vorhandenen 51 Änderungen sind unter `artifacts/work-profile-before.json` mit SHA-256 geschützt. Der ursprüngliche Implementierungsauftrag enthielt keinen Commit, Push oder Release. Die anschließende ausdrückliche Freigabe „ota“ autorisiert die unten dokumentierte iOS-Preview-OTA-Veröffentlichung; Commit und Push bleiben ausstehend.

Ziel: Übersicht ohne Speichern, normale Bearbeitungs- und Auswahlseiten. Ein lokaler Entwurf je Bearbeitungsseite; Auswahl ändert nur diesen Entwurf. Gemeinsames validiertes Speichern über `updateProfile`, Fehler behalten Eingaben, Abbrechen verwirft, Zurück/Swipe fragt bei Änderungen.

Nicht-Ziele: Tarifberechnung, Zuschläge, Feiertagsberechnung, Dienstplanprüfung, native Integration.

## Arbeitspakete

1. Navigation und Entwurfslebensdauer: bestehender Root-Stack, Auswahlkontext, Schutz beim Verlassen.
2. Übersicht sowie Arbeitszeit-, persönliche und Gehaltsbearbeitung mit vorhandenen Feldern und Tokens.
3. Abhängige Auswahl und Validierung; Komponenten-/Persistenzprüfungen und Projektprüfung.

Dateiscope: `app/_layout.tsx`, neue `app/profile-selection.tsx`, `src/navigation/routes.ts`, Profilübersicht und bestehender Settings-Editor; neue Auswahl-/Verlassens-Helfer; gezielte Komponententests und Test-Harness; optionale Accessibility-Props für `RowButton`; diese Dokumentation. Keine Änderungen an Domain-/Engine-/Repository-Code oder Schema.

## Bestandsdaten

Keine Migration. `SaveProfileInput`, Datenbankspalten und Schlüssel bleiben gleich. `UNKNOWN` bei Prüfannahmen bleibt „Noch nicht bestätigt“ und wird weiterhin als `null` gespeichert. Vorhandene Tarifvollzeit und alle gespeicherten Gehaltsgrundlagen werden übernommen; neue Tarife benötigen ausdrücklich gewählte gültige Gruppe/Stufe bzw. Ausbildungsjahr. Regionale Feiertagsauswahl nur für Bundesländer mit mehreren bestehenden Optionen.

## Prüfungen

Prüfungen und Ergebnisse siehe unten. iOS: Navigation/Zurückwischen, kleine Geräte, Dynamic Type, VoiceOver, Tastatur und Hell/Dunkel müssen am Simulator oder Gerät abgenommen werden. Windows stellt hier keinen iOS-Simulator bereit.

## Geänderte Dateien und Abläufe

- `app/_layout.tsx`: Arbeitsprofil-Editor und Auswahlseite als Karten im bestehenden Root-Stack; temporärer Auswahlkontext.
- `app/profile-selection.tsx`, `src/navigation/routes.ts`: neue Auswahlroute, bestehende Editor-URL bleibt erhalten; Bereich `PERSONAL` ergänzt.
- `src/features/settings/work-profile-screen.tsx`: gespeicherte Zusammenfassungen, persönliche Angaben öffnen ihre Bearbeitung; kein Speicherbutton. Vorhandenes Schichtmodell bleibt erreichbar. Regionshinweise nur für explizit zugeordnete Tarife TV-H/Hessen und TV-UK/Baden-Württemberg.
- `src/features/settings/settings-editor-screen.tsx`: getrennte normale Seiten für persönliche Angaben, Arbeitszeit und Gehalt; lokale Entwürfe, gemeinsames Speichern, Eingaben bei Fehlern erhalten. Tarifentwürfe bleiben beim Wechseln innerhalb der Seite erhalten. Bei neuen Tarifen keine automatische Gruppe/Stufe; Stufe erst nach Gruppenwahl. Persönliche Wochenstunden und Tarifvollzeit getrennt.
- `src/features/settings/profile-selection.tsx`: bestehende Zeilen/Karten/Icons, Auswahlhaken, Tarif-Suche mit bestehenden Kategorien, Rückkehr ohne Persistenz. Anfragen werden beim Verlassen aufgeräumt und doppelte Auswahl wird abgefangen.
- `src/features/settings/use-profile-leave-guard.ts`: Expo-Router-SDK-57-Hook `usePreventRemove` schützt Zurücknavigation; Abbrechen verwirft, erfolgreiche Speicherung beendet die Bearbeitung, laufende Speicherung verhindert doppelte Aktionen.
- `src/ui/design-system.tsx`: optionale Accessibility-Labels/-Zustände für die wiederverwendeten Zeilen.
- `src/features/settings/settings-choice-test-helpers.ts` nach `.tsx` umbenannt; acht bestehende Editor-/Tarif-Komponentensuiten an normale Auswahlseiten und ausdrücklich gewählte Tarifdetails angepasst (`settings-editor-theme`, `settings-pay-group`, `settings-nursing-training`, `settings-tval-pflege`, `settings-tvh-kr`, `settings-tvl-kr`, `settings-tvuk-nursing`, `settings-vka-e`).
- `src/features/settings/work-profile-screen.component.test.tsx`: Übersicht/Zusammenfassungen/Navigation; neue `work-profile-flow.component.test.tsx`: Entwurf, Abbrechen, Fehler, Rückkehr, Suche, Abhängigkeiten, doppelte Speicherung; neue `work-profile-persistence.test.ts`: reale SQLite-Datei schließen und neu öffnen, unveränderte Annahmen/Gehalt und Zurückweisen ungültiger Eingruppierung.

22 Dateipfade einschließlich Umbenennung, Tests und dieser Dokumentation. Die 48 vorher vorhandenen Dateien außerhalb der drei gemeinsamen Bearbeitungsdateien bleiben SHA-256-identisch. Hauptcheckout und ursprünglicher Kalenderbild-Checkout bleiben unberührt.

## Technische Prüfung und Grenzen

- `npm.cmd run verify:fast`: Regelkatalog, TypeScript, Lint ohne Warnungen, Prettier, sämtliche Unit-/Komponentensuiten sowie vorhandene Lieferungs-, Tarifinventar-, Sicherheits-/Runtime- und Buildabhängigkeitsprüfungen und `git diff --check`.
- Abschließende Ausführung erfolgreich (Exit 0): 400 Unit-Suiten mit 7.656 Tests und 104 Komponenten-Suiten mit 739 Tests; alle übrigen Projektgates bestanden. Protokoll: `artifacts/work-profile-verify-fast-final.log`.
- Persistenz: 2 Tests mit einer tatsächlich neu geöffneten SQLite-Datei bestanden. Dies ist keine Abnahme der nativen SQLCipher-Verbindung auf iOS.
- Flow: 11 gezielte Komponentenfälle bestanden. Die Entfernen-Aktion für Zurücknavigation ist im Test simuliert; native Wischgesten werden dadurch nicht abgenommen.
- iOS-JS-/Asset-Export erfolgreich (Exit 0): `dist/ios-work-profile-flow`, Protokoll `artifacts/work-profile-ios-export-final.log`. Kein nativer Build; die separat freigegebene OTA-Veröffentlichung ist unten dokumentiert.
- Graft-Kontextgraph aktualisiert; lokale, ignorierte Cache-Dateien.

## Noch auf iOS abnehmen

1. Bestehendes Profil auf dem Gerät laden, jede Bearbeitungsseite speichern/abbrechen; App vollständig schließen und wieder öffnen, alle Zusammenfassungen und Einstellungen vergleichen.
2. Zurückwischen und Zurücknavigation bei Änderungen: weiter bearbeiten bzw. verwerfen; kein Verlust bei abgelehnter Navigation und Fehlern.
3. Navigation Übersicht → Editor → Auswahl → Editor → Übersicht; keine gestapelten Sheets und kein flackernder Fehler beim Zurückkehren.
4. 320/375-pt-Breite, lange Tarif-/Arbeitgebernamen, große Dynamic-Type-Stufen, VoiceOver inkl. Auswahlhaken und Fehleransagen, Tastatur und Hell/Dunkel.
5. Neue Tarifwahl verlangt Gruppe/Stufe bzw. Ausbildungsjahr; Arbeitsort, persönliche Stunden und Tarifvollzeit bleiben getrennt. Regionale Feiertagsauswahl nur in relevanten Bundesländern.

## Preview-OTA vom 6. Oktober 2026

Separat durch „ota“ freigegeben und am 6. Oktober 2026 um 23:25 Uhr (Europe/Berlin) veröffentlicht. Das bereits geprüfte iOS-Paket aus `dist/ios-work-profile-flow` wurde mit `APP_VARIANT=internal`, Branch/Kanal `preview`, Plattform `ios` und EAS-Umgebung `preview` ohne erneutes Bundling hochgeladen. Die bisherigen Kalenderbild-/Darstellungsänderungen bleiben enthalten.

- Update-Gruppe: `91f60917-2292-4790-8bb8-553e93377e6a`.
- iOS-Update: `01a1131b-63d3-7924-81e3-1988fd0aacbb`.
- [EAS-Veröffentlichung](https://expo.dev/accounts/vladularu/projects/pflegeshift/updates/91f60917-2292-4790-8bb8-553e93377e6a).
- Runtime/Fingerprint: `03d174d668f0ea5f757958dccf853632762c554d`, identisch mit dem live geprüften internen iOS-Build 33 (`8deae8f8-679b-4284-978a-a07f74fa6719`). Kein neuer nativer Build erforderlich.
- Preview-Kanalzuordnung und neueste Update-Gruppe live geprüft. Ausgeliefertes Manifest mit iOS/Runtime/Preview-Headern geprüft; das heruntergeladene App-Paket ist SHA-256-identisch mit dem geprüften Export: `011123d001762c13ea184bbc98ee3c7c832b1dc8cd4c67fbacb1983a5eac1de8` (7.798.057 Byte).
- Nachweis: `artifacts/work-profile-ota-delivery-proof.json`; der Kandidatennachweis bleibt als ursprünglicher Prüfstand erhalten. Keine Änderungen am App-Code seit den bestandenen Prüfungen.

OTA-Auslieferung ist bestätigt; Geräteabnahme bleibt offen. App vollständig schließen, öffnen und etwa 15 Sekunden warten, erneut schließen und öffnen. Anschließend den oben aufgeführten Arbeitsprofil-Flow auf dem iPhone prüfen.
