# Schnellere Gehaltsauswertung

## Auftrag

Ziel: Auswertung, Gehaltsseite und Zeitzuschlagsdetails verwenden dieselbe bereits berechnete Monatsausgabe. iOS/iPhone ist das Zielgerät.

Dateiscope: `src/engine/simple-pay.ts`, `src/engine/simple-monthly-pay-cache.ts`, `src/engine/simple-monthly-pay-cache.test.ts`, dieser Beleg. Basis ist der auf dem iPhone funktional bestätigte TV-H-App-Stand `17bd289` (PR #273); deshalb bleibt die Lieferung auf dieser gestapelten App-Basis.

Nicht-Ziele: neue Tarife, geänderte Gehaltsformeln, neue Einstellungen, native Abhängigkeiten, Production-Veröffentlichung. Expo `~57.0.22`; Referenz: https://docs.expo.dev/versions/v57.0.0/.

Abnahme: Unveränderte Berechnungswerte; Wiederverwendung zwischen neuen Arrays/geladenen Objekten gleichen Inhalts. Dienste, Pausen, Überstunden, Monat, Profil/Tarif, Zulagenentscheidungen, Schichtmuster und neuer Regelkatalog dürfen keine veraltete Ausgabe liefern. Fehler und nicht verfügbare Berechnungen bleiben sofort wiederholbar. Begrenzter Speicher. Gezielt diese Fälle und die Tariftests, danach `verify:fast`, PR-CI und kompatible interne Preview. Vorhandene ausdrückliche Git-/Preview-Freigaben gelten.

## Ursache und Lösung

TVöD-P nutzt bereits einen Dienstcache. Die neuen Tarifpfade liefern vorher direkt und umgehen diesen; die Gehaltsseite berechnet beim Mounten erneut. Ein repräsentativer lokaler Monat mit 22 Diensten benötigte warm: TVöD-P 0,6 ms, TV-UK 286,4 ms, TV-H 529,0 ms (Windows/Node; kein iPhone-Zeitnachweis).

Die zentrale Monatsfunktion bekommt einen gemeinsamen inhaltlichen Cache für alle vorhandenen Gehaltsarten. Die schreibgeschützte Resolver-Instanz trennt Katalogversionen. Vollständige fachliche Eingaben bilden den Schlüssel; neue Objektidentitäten gleichen Inhalts sind wiederverwendbar. Maximal 24 zuletzt verwendete Monatsausgaben pro Resolver, im Arbeitsspeicher. Ausgabe wird tief eingefroren, um Änderungen durch einen Aufrufer nicht an andere Seiten weiterzugeben. Fehler oder fehlende Regeln werden nicht gespeichert.

Kaltberechnung bleibt erforderlich nach Neustart oder geänderten Eingaben; die normale Auswertung bereitet dieselben Gehaltswerte bereits vor dem Öffnen der Detailseite vor.

## Gezielt geprüft

79 Tests in fünf Dateien grün. Davon 22 Cachefälle: alle sieben vorhandenen Gehaltsarten, der echte Übergang Auswertung -> Gehaltsberechnung für TV-L/TV-UK/TV-H, Eingabeänderungen mit unveränderter Revision, neuer Katalogresolver, Fehlerversuche, tief eingefrorene Ausgaben und die Begrenzung auf 24 zuletzt verwendete Ergebnisse.

Gleicher repräsentativer Monat mit 22 Diensten nach Fix (Windows/Node):

| Tarif  | Erste Berechnung | Wiederholt, Median |
| ------ | ---------------: | -----------------: |
| TVöD-P |          63,4 ms |            0,04 ms |
| TV-L   |         378,7 ms |            0,04 ms |
| TV-UK  |         285,9 ms |            0,05 ms |
| TV-H   |         537,0 ms |            0,04 ms |

Die Messung erzwingt die Wiederverwendung desselben Ergebnisses. Es sind PC-Messungen, kein iPhone-Zeitnachweis. Erste Berechnung und Aktualisierungen bleiben erforderlich.

## Pflichtcheck und Preview-Voraussetzung

`npm.cmd run verify:fast` vollständig grün am 05.10.2026: 7.401 Unit-Tests, 623 Komponententests und alle Skriptprüfungen. Interne iOS-Runtime `f2f4b99ba254b82ab22b99594d5228bd8c3774f7`, kompatibel mit der installierten Preview Build 32. Reale iPhone-Performance-Abnahme bleibt nach dem autorisierten Update offen.
