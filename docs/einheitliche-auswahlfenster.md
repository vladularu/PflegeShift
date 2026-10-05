# Einheitliche Auswahlfenster

## Auftrag

- Ziel: Alle Dropdown-Auswahlfelder in den Einstellungen verwenden das gleiche kompakte Fenster. Es kommt von unten, zeigt eine Griffleiste und kann nach unten geschlossen werden.
- Plattform: iPhone Preview zuerst; derselbe Auswahlbaustein bleibt auf Android und Web bedienbar.
- Basis: `codex/grouped-salary-choice` bei `c368897a7afa14a0061508e80f911151c5cc148e`. Der Nutzer hat die Tarifauswahl auf dem iPhone funktional bestätigt und anschließend die einheitliche Darstellung und Ziehgeste beauftragt.
- Nicht-Ziele: Tarifregeln, Berechnung, Profildaten, Datenbank, Datumseingaben, neue Menüpunkte, native Abhängigkeiten oder Production-Veröffentlichung.
- Scope: gemeinsamer Dropdown- und SelectionSheet-Baustein, zugehörige Interaktions- und sieben Tarifformular-Tests sowie dieser Beleg und die fehlende native Initialisierung im Jest-Mock. Maximal 15 Dateien in diesem Paket.
- Freigabe: Bestehende ausdrückliche Freigabe für Implementierung, Git-Lieferung und interne iOS-Preview-OTA. Merge erst nach grüner CI und erneuter iPhone-Abnahme der Ziehgeste.

## Abnahme

1. Gehaltsgrundlage, Berufsbereich, Tarifgebiet, Tarifbereich, Entgeltgruppe, Stufe und Ausbildungsjahr verwenden dieselben Zeilen, Haken, Schrift, Abstände und Abbrechen-Aktion.
2. Fenster gleitet von unten ein und zum Schließen nach unten aus. Griff und Titelbereich lassen sich nach unten ziehen.
3. Die Liste bleibt scrollbar. Am Listenanfang schließt bewusstes Herunterziehen das Fenster; bereits gescrollte Listen bleiben beim Zurückscrollen offen.
4. Kurze, seitliche, abgebrochene und aufwärts gerichtete Gesten wählen keinen Eintrag und schließen nicht versehentlich.
5. Abbrechen, Hintergrund, Zurück und VoiceOver-Escape ändern keine Auswahl. Auswahl wird einmal übernommen; der Dialog schließt und der Fokus kehrt zum Feld zurück.
6. Lange Tarif- und Bundeslandlisten bleiben mit großer Schrift und Safe Area bedienbar. Reduzierte Bewegung wird berücksichtigt.
7. `verify:fast`, gezielte Komponentenprüfungen, kompatible iOS-OTA und realer iPhone-Nachweis sind separate Gates.

## Technische Referenz

Vor Codeänderung gelesen: Expo `~57.0.22`, React Native `0.86.3`, Gesture Handler `~2.32.0`, Reanimated `4.5.1`.

- https://docs.expo.dev/versions/v57.0.0/
- https://docs.expo.dev/versions/v57.0.0/sdk/gesture-handler/
- https://docs.expo.dev/versions/v57.0.0/sdk/reanimated/
- https://reactnative.dev/docs/0.86/modal

Vorhandene App-Bewegungstokens und Gesture-Handler-Bausteine werden wiederverwendet.

## Nachweise

- 101 gezielte Komponententests in zehn Suites bestanden.
- `verify:fast` vollständig bestanden: 7.512 Unit-Tests und 661 Komponententests in 100 Suites; Typen, Lint, Format, Architektur- und Skriptprüfungen grün.
- Alle sechs Design-Token-Prüfungen bestanden; keine neue Ausnahmeliste oder Gate-Absenkung.
- Abgebrochene Gesten werden anhand des Gesture-Handler-Erfolgssignals abgewiesen. Animationen verwenden compiler-kompatible SharedValue-Methoden.
- Native Jest-Mocks werden aus dem installierten Gesture-Handler-Paket geladen. Die produktiven Gesten bleiben Bestandteil der Interaktionstests.
- Neuer iPhone-Nachweis für die einheitliche Darstellung und Ziehgeste ist nach der OTA offen.

## Korrektur: gleichmäßiges Schließen

- Geräterückmeldung: Darstellung und Bedienung funktionieren; Abbrechen und Auswahl schließen zu abrupt.
- Scope: genau dieser Beleg, `selection-sheet.tsx` und dessen Komponententests im bestehenden Branch/PR #278. iPhone Preview zuerst. Berechnung, Daten und andere Fenster bleiben außerhalb dieses Korrekturpakets.
- Ursache: Der bisherige Schließweg entspricht der Bildschirmhöhe; besonders kleine Fenster verlassen mit der einbremsenden Öffnungskurve früh den sichtbaren Bereich. Der Hintergrund verschwindet zusätzlich schneller.
- Korrektur: tatsächliche Fensterhöhe plus kleiner Schattenabstand für beide Wege, gespiegelte Öffnungskurve für das Schließen. Fenster und Hintergrund verwenden jeweils 240 ms. Das Modal bleibt bis zum Animationsende geöffnet.
- Abnahme: Abbrechen, Optionswahl, Hintergrund, Zurück, VoiceOver-Escape und Herunterziehen gleiten flüssig aus; kleine und große Listen verhalten sich gleich. Reduzierte Bewegung und abgebrochene Gesten bleiben berücksichtigt. Erneute iPhone-Abnahme nach Preview-OTA offen.
- Referenz: https://docs.swmansion.com/react-native-reanimated/docs/guides/testing/ und https://reactnative.dev/docs/0.86/easing

- Nachweise der Korrektur: 22 gezielte Komponententests und `verify:fast` bestanden (7.512 Unit-Tests, 670 Komponententests / 100 Suites sowie Skript-, Typen-, Lint-, Format- und Architekturprüfungen). iOS-Export erfolgreich; Runtime identisch mit Preview Build 32.

## Regression: unsichtbarer Dialog

- Geräterückmeldung zur Bewegungs-OTA: Tippen auf eine Auswahl blockiert die Seite, das Fenster erscheint nicht. Die Bewegungskorrektur ist damit auf dem iPhone nicht abgenommen.
- Sofortmaßnahme: zuletzt funktional bestätigte interne Preview-OTA (`9aef8b6`, Gruppe `2d9f485b-1fdc-4d65-9fd4-0b8ae4989517`) wieder bereitgestellt. Keine Datenmigration.
- Ziel: Fenster zuverlässig sichtbar und bedienbar öffnen, auch ohne native Höhenmessung; gleichmäßiges Schließen beibehalten. Plattform: iPhone Preview. Scope: genau SelectionSheet, seine Tests und dieser Beleg, auf bestehendem UI-Branch ab `121cdc5`.
- Nachgewiesene Code-Lücke: Ohne `onLayout` oder bei Höhe null startet die Animation bisher nicht; ein transparentes Modal blockiert die Seite. Drei neue Tests schlagen auf dem fehlerhaften Stand fehl. Der bisherige Test hat immer eine Höhenmessung erzeugt und dieses Verhalten nicht erfasst.
- Korrektur: Öffnen beginnt wieder direkt bei `Modal.onShow`, mit sicherem Weg aus maximaler Fensterhöhe, falls keine Messung vorhanden ist. `onLayout` verbessert lediglich den Schließweg; ein spätes Ereignis startet keine neue Öffnung.
- Abnahme: Fenster ohne/leere/späte Messung sichtbar; Abbrechen löst die Sperre, Auswahl und erneutes Öffnen funktionieren. Volle Projektprüfung und erneuter realer iPhone-Test bleiben erforderlich.

- Native Steuerung: `onShow` startet die Bewegung ohne SharedValue-Bedingung direkt. Das vermeidet auch die unmittelbare Abfrage nach asynchronen SharedValue-Schreibzugriffen auf dem JS-Thread; Referenz: https://docs.swmansion.com/react-native-reanimated/docs/core/useSharedValue/ .
- Nachweise der dauerhaften Korrektur: 26 gezielte Tests und `verify:fast` grün (7.512 Unit-Tests, 674 Komponententests / 100 Suites plus Typen, Lint, Format, Architektur und Skripte). Neuer iOS-Export erfolgreich, Runtime weiterhin mit Preview Build 32 identisch. Erneute iPhone-Abnahme offen.
