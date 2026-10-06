# Darstellung – Variante 3

## Auftrag und Grundlage

Ziel: iOS-Darstellungsseite nach dem vom Nutzer freigegebenen Entwurf Variante 3. Kalendervorschau oben, Einstellungen darunter; echte Kalenderchips und vorhandene Farben, sofortige Modus-/Sichtbarkeitsvorschau, klare Hintergrundwahl, Fotozeile, Entfernen mit Rückgängig und bestätigtes Zurücksetzen.

Basis: abgenommener Preview-Build 33 mit OTA 01a1105d-7e4a-755c-b316-1b2526e0cc02; lokaler kombinierter Checkout auf df6dc528df172c62e1d6999a60617665cd35b6fa. Separater Branch codex/appearance-variant-3. Die 44 bereits vorhandenen Paketdateien wurden vor dem Umbau in artifacts/appearance-variant-3-baseline.json per SHA256 erfasst. Der andere Kalenderbild-Checkout und das unabhängige Desktop-Arbeitsverzeichnis bleiben unverändert.

Nicht-Ziele: Kalenderberechnung, Tarif-/Schichtlogik, globale Design-Tokens, native Pakete, Bildimport-Grenzen, Backupformat und Veröffentlichung. Die Veröffentlichung war zunächst ausgenommen; am 06.10.2026 wurde EAS Update separat ausdrücklich freigegeben (siehe OTA-Nachweis unten). Commit, Push, EAS Build und Store bleiben ohne Freigabe.

## Umsetzung und Dateiscope

- appearance-screen.tsx und appearance-calendar-preview.tsx: Vorschau vor der gemeinsamen Einstellungskarte, Modus über die ganze Kartenbreite unter eigener Beschriftung, dezenter Reset und Speicherhinweis.
- Die Vorschau nutzt PrototypeMonthContent, PrototypeDates und CalendarBackground aus dem echten Monatskalender, den gemeinsamen Monatszustand, die gespeicherten Kalenderfilter, Termine/Dienste, Wiederholungsauflösung und Feiertagsanzeige. Keine erfundenen Beispielschichten und keine neue Kalenderberechnung.
- calendar-background-control.tsx: Hintergrundauswahl LUNA Standard/Eigenes Foto, drei feste Stufen ohne Slider, normale Fotozeile, rote Entfernen-Zeile und Rückgängig. Die Einstellungen passen sich kleiner Breite und Dynamic Type an. Kontrollflächen mindestens 48 pt, vorhandene RowButton-Zeilen 56 pt. Kalendergrafik behält die dichte Darstellung des bestehenden Renderers und vollständige VoiceOver-Tagesbeschriftungen.
- calendar-background-context.ts, calendar-background-preferences.tsx und calendar-background-storage.ts: sofortige Sichtbarkeitsvorschau mit Rücknahme bei Speicherfehlern; atomare aktive/entfernte Fotoreferenzen, gleiche Schreibsperre für Foto, Stufe und Rückgängig.
- Passende Tests: appearance-screen.component.test.tsx, calendar-background-preferences.component.test.tsx, calendar-background-storage.test.ts, calendar-shared-scene.component.test.tsx. Letztere ergänzt ausschließlich die neuen Context-Fixturefelder.

## Bestandsdaten und Zuordnung

Keine Schema- oder Datenmigration. Bestehende Schlüssel und Werte bleiben bestehen:

| Schlüssel                         | Werte / Zweck                                                                                                  |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| appearance_mode                   | light / dark / system, unverändert                                                                             |
| appearance_theme                  | bestehende Zuordnung zur LUNA-Standardpalette unverändert                                                      |
| calendar_background_image         | validierter relativer JPEG-Dateiname, unverändert                                                              |
| calendar_background_strength      | subtle / medium / strong = Dezent / Mittel / Kräftig, unverändert; fehlend/ungültig weiterhin Mittel           |
| calendar_background_removed_image | neuer optionaler relativer Dateiname für genau ein rückgängig machbares Foto; fehlt bei Bestandsinstallationen |

Normales Entfernen löscht nur den aktiven Hintergrundverweis und hält die Datei samt Stufe für Rückgängig bereit. Modus und andere Einstellungen ändern sich nicht. Der zusätzliche Verweis überlebt Navigation, App-Neustart und iOS-Sandbox-Umzug. Rückgängig stellt die ursprüngliche Datei wieder her. Erfolgreiche neue Fotoauswahl oder ausdrücklich bestätigtes Zurücksetzen beendet die vorige Rückgängig-Option; erst dann werden nicht mehr benötigte lokale Kopien aufgeräumt. Abgebrochene Auswahl, abgebrochener Reset und fehlgeschlagene Speicherung löschen keine bisher verwendeten Dateien. Keine zeitlich ablaufende Rückgängig-Frist.

Zurücksetzen verlangt die bestehende native Bestätigung und benennt System, LUNA Standard, Mittel und Fotoentfernung. Hintergrund/Undo/Stufe werden atomar gespeichert; erst bei Erfolg wird der bestehende Appearance-Reset aufgerufen. Fehler bleiben sichtbar. Das Entfernen von Fotos erfolgt nur nach der jeweiligen expliziten Nutzeraktion.

Expo: installierte Version ~57.0.22, Referenz SDK 57: https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/ . Keine neuen nativen Abhängigkeiten oder Berechtigungen.

## Abnahme

Lokale Kriterien: gespeicherte Daten unverändert laden, echter Monatsrenderer mit Schichtfarben/Chips, Vorschau reagiert ohne Remount der Datumsmarker, drei Stufen nur bei aktivem Foto, Modus unverändert bei Fotoentfernung, Rückgängig nach Neustart, atomare Speicherung mit SQLite-Fehler-Rollback, Bestätigung/Abbruch, kleine iPhones und große Schrift. verify:fast und gezielte Tests müssen bestehen.

Reale iPhone-Abnahme dieser neuen Variante steht aus. Nach separat freigegebener Verteilung: Hell/Dunkel/System, alle Stufen, Fotoänderung, Entfernen/Rückgängig nach Navigation und Neustart, Reset-Abbruch/Bestätigung, VoiceOver und Dynamic Type auf kleinem Display prüfen. Lokale Tests oder ein Export ersetzen diesen Nachweis nicht.

## Lokales Prüfergebnis (06.10.2026)

- 23 Speicher-Tests einschließlich echter SQLite-Transaktionen bestanden.
- 39 fokussierte Komponententests für Darstellung, Foto-Provider und vorhandenen gemeinsamen Kalender bestanden.
- npm.cmd run verify:fast vollständig bestanden: 7654 Unit-Tests, 723 Komponententests, TypeScript, Lint, Formatierung, Regel-/Sicherheits-/Runtime-/Build-Abhängigkeitsprüfungen und git diff --check.
- Beim ersten Lauf überschritt ein unveränderter Caritas-Test während des parallel laufenden iOS-Exports 5 Sekunden. Ohne Exportlast bestanden alle 72 Tests dieses Moduls und danach das komplette unveränderte Gate. Keine Änderung an Tarifcode oder Test-Zeitlimits.
- Lokaler iOS-Export dist/ios-appearance-variant-3 erfolgreich; Bundle 7.774.982 Bytes, SHA256 9a9abb7893e1156af2f0237e4a54bcb92091e0f06a8aea81c59d95b82a9482f7.
- Alle 35 vorbestehenden Paketdateien außerhalb des neuen elf Dateien umfassenden Scopes unverändert per SHA256 geprüft. Native Eingaben app.json, package.json und package-lock.json bleiben identisch zum abgenommenen Paket. Der lokale Graft-Graph wurde aktualisiert.
- Kandidatennachweis: artifacts/appearance-variant-3-candidate-proof.json. Prüfstand vor OTA-Veröffentlichung; kein neuer EAS-Build, Commit, Push oder PR. Neue visuelle iPhone-Abnahme offen.

## Freigegebene Preview-OTA (06.10.2026, 21:55 Uhr Berlin)

- Ausdrückliche Nutzerfreigabe: „freigabe erteilt“. Veröffentlichung des geprüften iOS-Exports ohne erneutes Bundling, Umgebung preview, APP_VARIANT=internal, Branch/Kanal preview.
- Ziel: Preview-Build 33; Runtime 03d174d668f0ea5f757958dccf853632762c554d, identisch zum nativen Build.
- Update 01a112c9-87eb-7675-8393-4f0bb0f1dd72; Gruppe 28485698-38df-4e54-b6c4-bad343bcf803; veröffentlicht 2026-10-06T19:55:59.851Z. [EAS-Update](https://expo.dev/accounts/vladularu/projects/pflegeshift/updates/28485698-38df-4e54-b6c4-bad343bcf803).
- Der Preview-Kanal liefert für diese Runtime die neue Gruppe. Öffentliches Update-Manifest und tatsächlich autorisiert heruntergeladenes Startbundle geprüft: 7774982 Bytes, SHA256 9a9abb7893e1156af2f0237e4a54bcb92091e0f06a8aea81c59d95b82a9482f7, exakt identisch zum freigegebenen lokalen Export. Keine Zugangsdaten oder Werte von Asset-Request-Headern in den Nachweis geschrieben.
- Alle 46 Kandidaten-Dateien und 43 Export-Assets vor und nach Veröffentlichung per SHA256 identisch geprüft. Anschließend wurde ausschließlich diese Übergabedokumentation ergänzt; der Kandidatennachweis behält ihre ursprüngliche Export-Prüfsumme und erfasst die neue Dokument-Prüfsumme separat.
- Nachweis: artifacts/appearance-variant-3-candidate-proof.json, appearance-variant-3-published-update.json und appearance-variant-3-response-summary.json. Kein neuer Build und keine Git-Veröffentlichung.
- Geräteprüfung bleibt offen: App vollständig schließen, öffnen und den Download abwarten; anschließend nochmals schließen/öffnen. Unter Darstellung Vorschau, Modus, drei Stufen, Foto entfernen/Rückgängig, Reset und Barrierefreiheit auf dem iPhone prüfen.

## Korrekturumfang nach iPhone-Screenshots (06.10.2026)

Der Nutzer bestätigt die Ankunft der OTA durch drei Screenshots und beauftragt folgende Korrekturen: Das Foto füllt die gesamte Kalenderansicht einschließlich Monatsüberschrift und oberem sicheren Bereich. Die Darstellungsvorschau umfasst zwei echte Kalenderwochen statt des ganzen Monats. Hintergrund zeigt nur LUNA Standard/Eigenes Foto; die zusätzliche Auswahlansicht entfällt zugunsten der direkten Fotozeile.

Scope: elf Dateien (sieben bestehende UI-Dateien, drei zugehörige Komponententests und diese Dokumentation), erfasst in artifacts/appearance-refinement-baseline.json. Keine Kalender-, Tarif- oder Schichtberechnung, Speicher- oder native Änderungen. Bestehender separater Branch codex/appearance-variant-3. Alte Paketdateien außerhalb dieses Scopes bleiben bytegleich. Abnahme: genau ein Kalenderfoto über der ganzen Seite ohne doppeltes Overlay; 14 Tage und echte Chips in der Vorschau ohne unsichtbare weitere VoiceOver-Tage; direkter Fotopicker, alle Stufen und Rückgängig erhalten; gezielte Tests und verify:fast; anschließend eigener iPhone-Nachweis. Die bisherige OTA-Freigabe galt dem vorherigen Kandidaten; diese Korrektur wird vor einer erneuten Veröffentlichung geprüft und separat freigegeben.

### Prüfergebnis der Korrektur

- 79 gezielte Komponententests in sechs Suiten bestanden: echte Darstellungsvorschau, direkter Picker, Foto-Provider, Kalenderseite, geteilte Szene, Kopfzeile und vorhandenes Screen-Layout. Die Vorschau rendert genau 14 Tage einschließlich Nachbarmonats-Tagen, ohne weitere ausgeblendete VoiceOver-Tage; Kurz- und Zeitansicht geprüft.
- npm.cmd run verify:fast vollständig bestanden: 7654 Unit-Tests, 728 Komponententests, TypeScript, Lint, Formatierung und alle enthaltenen Regel-, Sicherheits-, Runtime- und Build-Prüfungen.
- Lokaler iOS-Export dist/ios-appearance-refinement erfolgreich. Bundle 7774863 Bytes, SHA256 bc9e97757da067a05070bdd14804d04320dfc902ef83b00959d93c1f35324133. Preview-Umgebung überprüft (APP_VARIANT=internal, keine EXPO_PUBLIC-Variablen). Neu berechneter iOS-Fingerprint 03d174d668f0ea5f757958dccf853632762c554d ist unverändert und passt zu Build 33. Kein neuer nativer Build erforderlich.
- Die Kalenderseite nutzt genau einen bildschirmgroßen Fotolayer vor der Monats-/Jahresanimation; der gemeinsame Monatsinhalt rendert dort keinen zweiten Fotolayer. Die Kopfzeile bleibt bei vorhandenem Foto einschließlich Safe Area transparent. Andere Screen-Header behalten ihre bestehende Fläche.
- Die zusätzliche Hintergrund-Auswahlansicht ist entfernt. Hintergrund zeigt nur den gespeicherten Zustand; Foto auswählen/ändern öffnet direkt den vorhandenen Picker. Entfernen, Rückgängig, drei Bildstufen, Bestätigung des Resets und sämtliche gespeicherten Werte bleiben erhalten. Keine neue Datenmigration oder Speicheränderung.
- Alle 40 vorbestehenden Dateien außerhalb des Korrekturscopes und die nativen Eingaben unverändert per SHA256. Nachweis artifacts/appearance-refinement-candidate-proof.json. Der lokale Graft-Graph wurde aktualisiert. Prüfstand vor der Korrektur-OTA; kein Commit, Push oder neuer EAS-Build. Die anschließend separat freigegebene Veröffentlichung ist unten dokumentiert; iPhone-Abnahme offen.

### Freigegebene Korrektur-OTA (06.10.2026, 22:21 Uhr Berlin)

- Ausdrückliche Nutzerfreigabe: „ja“ auf die Frage nach Veröffentlichung der neuen Preview-OTA. Der geprüfte Export wurde mit --skip-bundler für iOS, Kanal/Branch preview, Umgebung preview und APP_VARIANT=internal veröffentlicht.
- Update 01a112e0-b5a8-7354-a48c-baf2db5a3378; Gruppe a90ff636-f427-491c-932a-2b02e9d9b14a; veröffentlicht 2026-10-06T20:21:18.888Z. [EAS-Update](https://expo.dev/accounts/vladularu/projects/pflegeshift/updates/a90ff636-f427-491c-932a-2b02e9d9b14a). Runtime 03d174d668f0ea5f757958dccf853632762c554d; der Fingerprint des aktuellen fertigen Preview-Builds 33 passt dazu.
- Der Preview-Kanal liefert diese neue Gruppe für Build 33. Update-Manifest und tatsächlich heruntergeladenes Startbundle stimmen mit dem freigegebenen lokalen Export überein: 7774863 Bytes, SHA256 bc9e97757da067a05070bdd14804d04320dfc902ef83b00959d93c1f35324133. Die 51 Kandidaten-Dateien und 43 Export-Assets wurden vor und nach Veröffentlichung unverändert geprüft.
- Anschließend wurde nur diese Übergabedokumentation ergänzt; die ursprüngliche Kandidaten-Prüfsumme bleibt im Nachweis erhalten, die neue Dokument-Prüfsumme wird separat erfasst. Nachweis: artifacts/appearance-refinement-candidate-proof.json und appearance-refinement-response-summary.json. Keine Zugangsdaten oder Asset-Header-Werte gespeichert.
- Die Korrektur ist verteilt; erneute iPhone-Abnahme steht aus. App schließen/öffnen, Download abwarten, danach erneut schließen/öffnen. Vollflächiges Foto einschließlich Monatsüberschrift, Vorschau mit zwei Wochen und direkte Fotoauswahl prüfen.
