# Tagesanzeige aus dem Kalendertag

## Auftrag und Scope

Ziel: Die vorhandene Schnellauswahl öffnet ruhig aus dem ausgewählten Tag und kehrt beim Schließen dorthin zurück. Beim Öffnen der Tagesanzeige und des schnellen Einfügens gibt es keine Haptik. Die vorhandene Dienstauswahl und das Setzen/Entfernen eines Diensteintrags behalten ihre Rückmeldungen.

Branch: `codex/kalender-tagesanimation`. Ziel: vorhandener iOS-Preview-Build 33. Stack geprüft: Expo SDK 57 (`~57.0.22`), Reanimated 4.5.1, vorhandene Palette/MOTION-Tokens und FullWindowOverlay. Referenzen: [Expo SDK 57 Reanimated](https://docs.expo.dev/versions/v57.0.0/sdk/reanimated/), [Expo SDK 57 Haptics](https://docs.expo.dev/versions/v57.0.0/sdk/haptics/) und [Reanimated 4 Timing](https://docs.swmansion.com/react-native-reanimated/docs/animations/withTiming/).

Scope: Tagespopup, dessen Bewegungshook und Geometrie, gemeinsame Dauer mit QuickPlannerDock, Kalender-Aufruf/Haptik sowie zugehörige Prüfungen. Kalender-, Tarif-, Dienst- und Persistenzlogik, Pakete und native Konfiguration bleiben erhalten. Die bisherige Kalendergestaltung und das aktuelle Tageszahl-Symbol bleiben enthalten. Keine Veröffentlichung durch diese Umsetzung freigegeben.

## Umsetzung

- Der gemessene Bildschirmbereich des Tages liefert den Ursprung. Die Bewegung beginnt im oberen Bereich der Zelle bei der Tageszahl; Dienste-Chips vergrößern den Ursprung nicht. Horizontale und vertikale Abstände zur Popup-Mitte werden berücksichtigt, auch bei einer Position oberhalb des Tages.
- Popup und Schnellplanung verwenden dieselbe bestehende ruhige Kurve mit 320 ms beim Öffnen und 280 ms beim Schließen, ohne Federn/Überschwingen. Eine Reanimated-SharedValue steuert Position, Größe und Hintergrund gemeinsam auf dem UI-Thread.
- Beim Schließen bleibt die Ansicht bis zum Animationsende montiert. Der Touch-Layer wird sofort freigegeben. Mehrfaches Schließen löst höchstens einen Callback aus; abgebrochene Animationen und alte Instanzen nach Unmount können eine neue Anzeige nicht schließen.
- Auf iOS nutzt das Popup wie die bestehende Schnellplanung FullWindowOverlay, damit gemessene Bildschirmkoordinaten inklusive Safe Area übereinstimmen. Bei einer darüberliegenden Bearbeitungsseite wird es unsichtbar und für Touch/VoiceOver deaktiviert, bleibt für die bestehende Rückkehr aus der Dienstauswahl aber montiert.
- Bei „Bewegung reduzieren“ entfällt jede räumliche Transformation. Das bestehende kurze Motion-Timing bleibt als barrierearme Alternative.
- Öffnen des Tages, Öffnen der Schnellplanung und Tag ohne gewählte Vorlage sind haptisch still. Vorlagenauswahl und vorhandene Stempel-Rückmeldungen sind unverändert. Der allgemeine Haptik-Baustein wurde nicht geändert.
- Keine Datenmigration oder neuen Speicherschlüssel. Der vorher veröffentlichte Stand wird außerhalb des freigegebenen Kalenderscreen-/Testscopes per Hash erhalten.

## Prüfung

Bestanden:

- Gezielter Kalenderlauf: 5 Suiten / 52 Tests. Abgedeckt sind der geometrische Tagesursprung, gemeinsame Motion-Timings, Animationsabschluss, Mehrfachtipps einschließlich erneuter Auswahl desselben Tages, Unterbrechung/Unmount, Reduced Motion, Rückkehr ohne neue Eintrittsanimation, unsichtbares/deaktiviertes Popup unter einer Bearbeitungsseite sowie die Haptik bei Öffnen, Vorlage und tatsächlichem Stempel-Aufruf. Die gleichen Suiten bestehen auch im abschließenden Gesamtlauf.
- `npm.cmd run verify:fast`: Regelverträge, TypeScript, Lint ohne Warnungen, Formatprüfung und sämtliche Projektprüfungen erfolgreich. Vitest: 401 Dateien / 7.671 Tests. Jest: 108 Suiten / 797 Tests. Zusätzliche Operator-, Runtime- und Buildprüfungen ebenfalls erfolgreich.
- Lokaler iOS-Export mit `APP_VARIANT=internal` nach `dist/ios-day-popup-motion-final` erfolgreich. Keine EAS-Build-/OTA-Veröffentlichung für diese Revision.
- `git diff --check` und Dateiscope erfolgreich. 10 Dateien im neuen Scope; 35 vorherige Dateien außerhalb der beiden freigegebenen Kalender-Screen-/Testdateien bleiben bytegleich. Darunter sind alle Dateien für Kalendergestaltung und das Tageszahl-Symbol. Der Graft-Graph wurde aktualisiert.
- Nachweis: `artifacts/calendar-day-popup-motion-proof.json`. Keine Migration oder Änderungen an gespeicherten Daten.

Noch auf iPhone zu prüfen: erste/letzte Kalenderzeile und seitliche Tage, ruhige Bildfolge bei normalem und schnellem Öffnen/Schließen, erneuter Tap während des Schließens, die weiterhin nutzbare Tab-Leiste, Dienstauswahl-Unterseite und Rückkehr, Hell-/Dunkelmodus, große Schrift, VoiceOver und „Bewegung reduzieren“. Keine Haptik beim ersten Öffnen; vorhandene Haptik bei Dienstauswahl und Setzen/Entfernen des Dienstes. Ein Export oder Komponententest bestätigt keine echte iPhone-Animation.
