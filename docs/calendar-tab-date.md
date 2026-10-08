# Aktuelle Tageszahl im Kalender-Tab

## Task-Vertrag

Ziel: Das Kalender-Symbol in der unteren Navigation zeigt die aktuelle Tageszahl von 1 bis 31. iOS ist die Zielplattform; die bestehende JavaScript-Ersatzansicht erhält dasselbe Symbol. Branch: `codex/kalender-tab-datum`, Basis `65bc1a2` mit dem erhaltenen und akzeptierten Preview-Stand. Stack: Expo SDK 57 (`~57.0.22`), vorhandene Expo Router NativeTabs; passende [SDK-57-Dokumentation](https://docs.expo.dev/versions/v57.0.0/sdk/router/native-tabs/) und installierte Typen geprüft.

Dateiscope: die beiden Tab-Shells, lokaler Datumshook, gemeinsamer Symbolbaustein, eine JSON-Datei mit 31 PNG-Masken, reproduzierbarer Entwicklungsgenerator und die zugehörigen Navigations-/Lifecycle-Prüfungen. Der vorherige Kalender-gestalten-Stand bleibt erhalten.

Nicht-Ziele: gewählten Kalendermonat oder Tab-Tap-Verhalten ändern, Kalender-/Tarif-/Profilberechnungen und Speicherung ändern, native Pakete oder Konfiguration ändern. Keine Git-/EAS-/Store-Veröffentlichung durch diese Umsetzung freigegeben.

## Verhalten

- Maßgeblich ist der lokale Kalendertag des Geräts, unabhängig vom betrachteten Monat. Das Label bleibt „Kalender“; VoiceOver nennt zusätzlich das heutige Datum.
- Ein Timer läuft nur bei aktiver App. Der nächste lokale Tageswechsel wird ohne feste 24-Stunden-Annahme ermittelt; höchstens einmal pro Minute wird nach Uhrzeit-/Zeitzonenänderungen geprüft. Beim Zurückkehren wird sofort neu gelesen. Listener und Timer werden beim Verlassen abgebaut.
- Das native iOS-Symbol verwendet `src` mit `renderingMode="template"`; das bisherige statische SF-Symbol entfällt für diesen Tab, weil es `src` auf iOS überschreiben würde. Vorhandene aktive/inaktive Farb-Tokens und die native Touch-Fläche bleiben erhalten.
- Die lokalen 84×84-PNG-Masken entsprechen 28 pt bei 3× Auflösung und liegen gebündelt in einer kleinen JSON-Datei. Es gibt keinen Download oder Speicherschlüssel. Der Entwicklergenerator benötigt Pillow und eine lokale Schriftdatei; die App braucht keine zusätzliche Bibliothek, Schrift oder native Integration.
- Keine Datenmigration. Der vorhandene Sprung zu Heute beim erneuten Antippen bleibt unverändert.

## Prüfungen

Bestanden:

- Gezielte Komponentenprüfung: 2 Jest-Suiten mit 14 Tests. Geprüft sind die native Tab-Quelle und die JavaScript-Ersatzansicht, Mitternacht, Monats-/Jahreswechsel, Schaltjahr, Wiederaufnahme, Uhrzeitkorrektur und Timer-/Listenerabbau.
- Plattform-/Assetprüfung: 1 Vitest-Datei mit 3 Tests, einschließlich aller 31 unterschiedlichen transparenten PNG-Masken.
- `npm.cmd run verify:fast`: Regelprüfung, TypeScript, Lint ohne Warnungen, Formatprüfung und sämtliche vorhandenen Testläufe erfolgreich. Vitest: 401 Dateien / 7.671 Tests; Jest: 106 Suiten / 784 Tests; zusätzliche Operator-, Runtime- und Buildprüfungen ebenfalls erfolgreich.
- Lokaler iOS-Export mit `APP_VARIANT=internal` nach `dist/ios-calendar-tab-date` erfolgreich. Kein neuer nativer Build und keine OTA-Veröffentlichung.
- Die 28 Dateien des vorherigen akzeptierten OTA-Stands bleiben bytegleich erhalten. Der Änderungsnachweis liegt in `artifacts/calendar-tab-date-proof.json`, das lokale Symbolbeispiel in `artifacts/calendar-tab-date-icons-preview.png`.

Keine Datenmigration oder neuen Speicherschlüssel notwendig. Es wurden keine Profile, Fotos, Kalendereinstellungen oder Dienste geändert.

Noch auf iPhone zu prüfen: native Darstellung bei aktivem/inaktivem Tab, ein-/zweistellige Tageszahlen, Hell-/Dunkel-/Systemmodus, kleine Displays und große Schrift, VoiceOver, Mitternacht einschließlich Sommerzeitwechsel sowie Wiederaufnahme nach Uhrzeit-/Zeitzonenänderungen. Die lokale Symbolvorschau ist kein Gerätenachweis.
