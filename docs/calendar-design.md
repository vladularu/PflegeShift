# Kalender gestalten

## Task-Vertrag

Ziel: Anzeigeoptionen und Darstellung in einer gemeinsamen, automatisch gespeicherten iOS-Seite nach der Referenz vom 8. Oktober 2026 zusammenführen. Basis: aktueller Master `65bc1a2`, Branch `codex/kalender-gestalten`. Vorheriger sauberer, zu diesem Chat gehörender Worktree wird wiederverwendet; der unabhängige Hauptcheckout bleibt unberührt. Stack: Expo SDK 57 (`~57.0.22`), React Native 0.86.3, Expo Router, bestehende Context-Provider und SQLite/SQLCipher. Die versionierte SDK-57-Dokumentation wurde geprüft.

Nicht-Ziele: Kalender-, Tarif-, Zuschlags-, Feiertags- oder Dienstplanberechnung ändern; Profile/Dienste/Farben zurücksetzen; native Pakete oder Berechtigungen ändern; Beispiele in den Dienstplan schreiben. Commit, Push, PR, Merge, EAS Build/OTA und Store-Schritte sind für diesen neuen Umbau nicht freigegeben. Ein lokaler iOS-Bundle-Export dient der Buildprüfung.

## Arbeitspakete und Dateiscope

1. Navigation/UI: kanonische Route und gemeinsame Einstellungsseite; kompatible alte Routen; Kalenderzugang und ein allgemeiner Einstellungszugang; bestehende Gruppen, Zeilen, Outline-Icons, Segmente und erreichbare Zurücknavigation. Betroffen sind die drei Routen, `app/_layout.tsx`, Kalenderheader/-screen, allgemeine Einstellungen, bisherige Einstellungsseiten und bestehende Foto-/Segmentkomponenten.
2. Vorschau/Zustand: vorhandenen echten Monatsrenderer zu einem gemeinsamen Zwei-Wochen-Baustein zusammenführen; reine Beispielobjekte für Dienste, Abwesenheiten, Termine und Feiertage mit vorhandenen Dienstfarben; geladene Anzeigepräferenzen schützen und nur deren Anzeigeanteil zurücksetzen. Bestehende Appearance-, Kalenderpräferenz- und Foto-Provider, SQLite-Schlüssel und Fotoablage weiterverwenden.
3. Nachweise: fokussierte Komponenten-/Provider-/Persistenzprüfungen, Navigationsnachweise, `verify:fast`, lokaler iOS-Export und Abschlussbericht. Angepasste Bestandstests behalten ihre fachlichen Assertions; entfernte Legacy-UI wird über die neue gemeinsame Implementierung geprüft.

## Abnahmekriterien

- Beide Einstiege öffnen dieselbe Route/Implementierung und kehren zum jeweiligen Einstieg zurück; alte Routen bleiben kompatibel.
- Vorschau scrollt mit und nutzt echte Kalender-Chips sowie alle Modus-, Foto- und Anzeigeoptionen sofort. Beispiele sind ausschließlich im Speicher der Vorschau.
- Gespeicherte Auswahl/Fotos bleiben erhalten, ohne neue Schlüssel oder Schema-Migration. Fehler werden sichtbar, fehlgeschlagene Writes melden keinen Erfolg.
- Dienste ausblenden deaktiviert Bezeichnung/Startzeit/Gesamtdauer, ohne deren Werte zu verändern.
- Foto wählen/ersetzen/entfernen und Rückgängig verwenden die bestehende lokale Ablage. Das entfernte Foto bleibt bis zum Ende der bestehenden Rückgängig-Möglichkeit verfügbar, auch nach Neustart.
- Bestätigter Reset nennt Hintergrund/Bildsichtbarkeit und die sechs Anzeigeoptionen. Appmodus, Monats-/Jahreswahl, Schichtfarben, Profile und Einträge bleiben erhalten.
- Touchflächen mindestens 44 pt; vorhandene Tokens, adaptive Layouts und VoiceOver-Beschriftung; keine bunten Icon-Kacheln.

## Prüfungen und Geräteabnahme

Prüfungsergebnisse werden nach der Umsetzung ergänzt. Auf Windows ist kein iOS-Simulator verfügbar. iPhone-Screenshot/Simulatornachweise für beide Einstiege, Zurückwischen, kleine Displays, Dynamic Type, VoiceOver, Foto-Picker, Systemwechsel und Neustart bleiben separat zu dokumentieren. Ein Bundle-Export ersetzt keine visuelle/native Geräteabnahme.

## Speicherung und Kompatibilität

Keine Datenmigration und keine Schemaänderung. Die Zusammenführung erzeugt keinen neuen Datensatz. Appearance-Provider und Modus-/Theme-Werte bleiben unverändert; der bestehende appweite Systemmodus bleibt appweit. Die beiden alten Routen ersetzen sich per Redirect durch `/calendar-design`, ohne einen zusätzlichen Rücksprung in die alte Seite. Beide neuen Einstiege geben ihren Ursprung weiter; reguläres Zurück nutzt den bestehenden Navigationsstack. Direkte Links ohne Historie führen zum Kalender bzw. Mehr.

| Bestehende Schlüssel                                                           | Verhalten nach dem Umbau                                                                                 |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `calendar_view_mode`                                                           | Monats-/Jahreswahl unverändert, auch beim Reset                                                          |
| `calendar_show_shifts`, `calendar_show_appointments`, `calendar_show_holidays` | Gleiche boolesche Werte und bisherige SQLite-Transaktion; Vorschau und Kalender lesen denselben Provider |
| `calendar_label_mode`                                                          | `FULL` / `SHORT` / `SYMBOL` bleiben erhalten; UI nennt sie Name / Kürzel / Symbol                        |
| `calendar_show_shift_times`, `calendar_show_shift_duration`                    | Gleiche Werte, Bedeutung und vorhandene Zeitformatierung; beim Ausblenden der Dienste nicht verändert    |
| `calendar_background_image`, `calendar_background_removed_image`               | Gleiche lokale Bildreferenzen und private Fotoablage; Entfernen hält die Datei für Rückgängig verfügbar  |
| `calendar_background_strength`                                                 | `subtle` / `medium` / `strong` bleiben erhalten, angezeigt als Dezent / Mittel / Kräftig                 |

Rückgängig bleibt wie bisher auch nach Neustart verfügbar. Ein erfolgreich gespeichertes neues Foto oder ein ausdrücklich bestätigter Reset beendet diese Möglichkeit und räumt die nicht mehr referenzierte Datei auf. Eine fehlgeschlagene Auswahl, Entfernung oder Wiederherstellung behält die bisherige Datei/Referenz. Ohne aktives Foto sind Bildsichtbarkeit und Entfernen ausgeblendet.

Der Reset verwendet die vorhandenen Standardwerte: Standardhintergrund/Mittel, alle drei Inhalte sichtbar, Name, Startzeit und Gesamtdauer aus. Kein Mockup-Wert wird als neuer Standard übernommen. Er setzt zunächst den Hintergrund zurück und danach die Anzeigepräferenzen; beide verwenden ihre vorhandenen Transaktionen. Bei einem Fehler wird der betroffene Teil gemeldet und zurückgerollt, kein Gesamterfolg behauptet. Ein bereits erfolgreicher Hintergrund-Reset wird bei einem nachfolgenden Anzeige-Speicherfehler nicht zurückgedreht; die Anzeige kann über die vorhandene Wiederholung erneut gespeichert werden.

Die Vorschau enthält ausschließlich kurzlebige Beispielobjekte, nutzt aber die echten Kalender-Chips, den Kalenderindex, Datumsknoten und dieselbe Zeitformatierung. Dienstfarben und Symbole kommen vorrangig aus vorhandenen Schichtvorlagen, ersatzweise vorhandenen Diensten und schließlich aus den bestehenden Farb-Tokens. Feiertag und Termin sind ausdrücklich als Beispiele bezeichnet; sie werden weder als echte Regeln ausgewertet noch im Dienstplan gespeichert. Die Vorschau verwendet die ersten zwei Wochen des aktuellen Monats.

## Automatisierte Nachweise

Gezielte Prüfungen bestehen für beide Einstiege, Rücksprung/Deep-Link-Fallback, alte Routen, alle Bezeichnungen und Zeitvarianten, drei Inhaltsfilter, Modus/Fotostärke, kleine Displays/große Schrift, 48-pt-Schalter, Kalender-Reset mit Abbruch/Fehler, Laden von Bestandswerten ohne Schreibvorgang und Provider-Neustart. Bestehende Foto-Tests prüfen Auswahl/Abbruch, Ersetzen, Entfernen, Rückgängig nach Neustart, Bildstärke und Speicherfehler. Der Beispielinhalt wird für alle zwölf Monate gegen die tatsächlichen Kalenderwochen geprüft.

Vollständige Prüfung am 8. Oktober 2026:

- `npm.cmd run verify:fast`: bestanden, einschließlich Regelverträgen, TypeScript, Lint ohne Warnungen, Prettier, vollständiger Testsuite, Operator-/Runtime-/Build-Abhängigkeitstests und `git diff --check`.
- Vitest: 401 Testdateien / 7.670 Tests bestanden.
- Jest: 105 Suites / 773 Komponententests bestanden.
- `APP_VARIANT=internal npm.cmd run export:ios`: bestanden, Hermes-iOS-Bundle nach `dist/ios` exportiert. Dies ist ein lokaler Bundle-Buildnachweis, kein neuer installierbarer EAS-Build und keine OTA-Veröffentlichung.
- Gezielte neue/bestehende Prüfungen sind Teil der vollständigen Suite, darunter zwei Einstiegspfade, bekannte Hinweisparameter, Zurück-Footer, Deep-Link-Fallback, kompatible Redirects, Auto-Speicherfehler, Reset/Abbruch/Fehler und Einstellungen nach Provider-Neustart.

Offene iOS-Geräte-/Simulatorprüfungen:

1. Aus Kalendermenü und Mehr öffnen, Header-Zurück, Zurückwischen und unteren Zurück-Footer prüfen; nach tiefem Scrollen bleibt die Navigation erreichbar.
2. Kleine iPhones und große Schrift: keine überlappenden Titel, sinnvolle Segmentumbrüche, erreichbare Schalter und vollständige VoiceOver-Zustände; die dichte Kalendervorschau nutzt die bestehenden barrierefreien Tageslabels.
3. Alle Optionen im Beispielkalender und nach Zurück im tatsächlichen Dienstplan vergleichen; Dienste aus/ein bewahrt Bezeichnung und Zeitwerte.
4. Native Fotoauswahl, Abbrechen, Ersetzen, Entfernen und Rückgängig einschließlich App-Neustart mit einer vorhandenen Installation prüfen.
5. Systemmodus beim Wechsel der iOS-Darstellung, Neustart-Persistenz und bestätigten/abgebrochenen Kalender-Reset prüfen. Appmodus, eigene Dienstfarben, Arbeitsprofile und Dienste müssen erhalten bleiben.
6. Reale Speicher-/Dateisystemfehler auf einem Testgerät ergänzen; automatisierte Tests decken Fehler und Wiederholung bereits ab.

Logs und Hashnachweis liegen lokal unter `artifacts/calendar-design-*` und werden nicht versioniert.

## Geänderte Dateien

- `app/_layout.tsx`
- `app/appearance.tsx`
- `app/calendar-design.tsx`
- `app/calendar-view.tsx`
- `docs/calendar-design.md`
- `src/features/calendar/calendar-header.component.test.tsx`
- `src/features/calendar/calendar-header.tsx`
- `src/features/calendar/calendar-preferences.component.test.tsx`
- `src/features/calendar/calendar-preferences.tsx`
- `src/features/calendar/calendar-screen.component.test.tsx`
- `src/features/calendar/calendar-screen.tsx`
- `src/features/calendar/calendar-view-route.component.test.tsx`
- `src/features/calendar/calendar-view-screen.component.test.tsx`
- `src/features/calendar/calendar-view-screen.tsx`
- `src/features/settings/appearance-calendar-preview.tsx`
- `src/features/settings/appearance-mode-control.tsx`
- `src/features/settings/appearance-screen.component.test.tsx`
- `src/features/settings/appearance-screen.tsx`
- `src/features/settings/calendar-background-control.tsx`
- `src/features/settings/calendar-design-preview-data.test.ts`
- `src/features/settings/calendar-design-preview-data.ts`
- `src/features/settings/calendar-design-screen.tsx`
- `src/features/settings/calendar-display-controls.tsx`
- `src/features/settings/settings-screen.component.test.tsx`
- `src/features/settings/settings-screen.tsx`
- `src/navigation/calendar-design-route.ts`
- `src/theme/design-token-usage.test.ts`
- `src/ui/design-system.tsx`

## Kompakte Folgekorrektur – 8. Oktober 2026

Nach der akzeptierten Preview-OTA wird dieselbe Seite auf Wunsch kompakter. Umsetzung weiterhin auf `codex/kalender-gestalten`; Dateiscope dieser Folgekorrektur: gemeinsame Seite, Foto-Steuerung, Anzeige-Steuerung, Vorschau, die zwei betroffenen bestehenden Komponententests und dieses Dokument.

Modus und Hintergrund bilden eine gemeinsame Gruppe, Inhalte und Dienstanzeige eine zweite. Doppelte Abschnittstitel, der zusätzliche Hintergrund-Status und die allgemeinen Hinweise unter Vorschau und Foto entfallen. Die Monatsüberschrift erhält eine VoiceOver-Beschriftung als Beispielvorschau. Die gewählte Hintergrund-Option bleibt am Segment eindeutig erkennbar; der lokale Fotohinweis bleibt als VoiceOver-Hinweis am Foto-Picker erreichbar. Die Vorschau nutzt weiterhin zwei echte Kalenderwochen und dieselben Schicht-Chips. Gruppenabstände und Innenabstände sind kleiner; bestehende Touch-Flächen von 48 bzw. 56 pt und die Umbrüche bei großer Schrift bleiben erhalten.

Ein gemeinsamer Footertext nennt automatische Speicherung, laufende Speicherung oder Fehler. Foto-Rückgängig, konkrete Fehlermeldungen, deaktivierte Dienstanzeige und der bestätigte Reset bleiben erhalten. Speicherung, Werte, Fotos, Navigation, Berechnungen und native Konfiguration ändern sich nicht; keine Datenmigration erforderlich. Die neue Änderung ist lokal vorbereitet, ohne weitere OTA-, Git- oder Build-Veröffentlichung. Der separate Nachweis der vorherigen OTA bleibt unverändert unter `artifacts/calendar-design-ota-delivery-proof.json`.

Prüfungen der kompakten Folgekorrektur:

- Gezielte bestehende Tests für Darstellung, Anzeige, Fotoablage und Appearance-Persistenz: 4 Suites / 59 Tests bestanden.
- `npm.cmd run verify:fast`: bestanden, inklusive TypeScript, Lint ohne Warnungen, Formatierung, 401 Vitest-Dateien / 7.670 Tests, 105 Jest-Suites / 773 Tests sowie Operator-, Runtime- und Build-Abhängigkeitsprüfungen.
- Lokaler iOS-Export mit `APP_VARIANT=internal`: bestanden. Ausgabe in `dist/ios-compact` hält das bereits veröffentlichte Bundle unter `dist/ios` unverändert verfügbar.
- `git diff --check`: bestanden. Genau die sieben genannten Dateien unterscheiden sich zusätzlich vom zuvor geprüften OTA-Stand; dessen 21 übrige Implementierungsdateien sind unverändert.

Visuelle Abnahme des neuen Stands auf kleinem iPhone, mit großer Schrift und VoiceOver bleibt offen. Diese Folgekorrektur wurde noch nicht als OTA veröffentlicht; die vorherige Veröffentlichung und ihr Nachweis bleiben erhalten. Der aktuelle lokale Hash-/Prüfnachweis liegt unter `artifacts/calendar-design-compact-proof.json`.
