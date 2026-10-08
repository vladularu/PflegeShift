# Schnell einfügen: Wechsel zwischen + und X

## Auftrag

Branch: `codex/schnelleinfuegen-button-motion`. Zielgerät: iOS-Preview-Build 33. Das Plus fährt zuerst nach unten, dann kommt das X vom gleichen unteren Punkt hoch. Beim Schließen kehrt sich dieser Weg um. Beide sichtbaren Endzustände haben denselben Mittelpunkt; die bisherige Plus-Position ist Ausgangspunkt. Eine gemeinsame Mindesthöhe hält beide Kreise auch ohne untere Safe Area mindestens 8 pt oberhalb der Vorlagenauswahl.

Scope: `quick-planner-dock.tsx`, `quick-planner-control-motion.ts`, bestehende Dock-Komponententests und diese Dokumentation. Keine Änderungen an Dienstauswahl, Stempeln, Haptik, Tagespopup, Kalenderdaten, Profilen, Speicherung, Paketen oder nativer Konfiguration. Die zuvor bestätigte Tagesanimation und alle bisherigen Kalenderänderungen werden erhalten. Commit, Push, PR, OTA und Build sind für diese neue Änderung nicht freigegeben.

## Bewegung und Bedienung

- Das bestehende gemeinsame Timing für Dock und Kalender bleibt erhalten. Eine zusätzliche Reanimated-SharedValue steuert ausschließlich den Buttonwechsel mit zwei gleich langen, ruhigen Abschnitten über `withSequence`: erst verschwindet das Plus nach unten, danach kommt das X hoch. Rückwärts entsteht exakt der umgekehrte Weg. Kein Dreh-/Feder-Effekt und keine zusätzliche Verzögerung oder JavaScript-Timer.
- Die ruhigen vorhandenen MOTION-Tokens bleiben erhalten: 320 ms beim Öffnen, 280 ms beim Schließen und 100 ms bei Bewegung reduzieren. Beide Bewegungsabschnitte bekommen jeweils die Hälfte der Gesamtdauer; beim ersten Mount wird kein Wechsel abgespielt, beim Abschluss des Schließens wird er nicht erneut gestartet. Laufende Buttonanimationen werden vor einem Richtungswechsel und bei Unmount abgebrochen. Bei einem frühen Schließen innerhalb des ersten Abschnitts kehrt das Plus direkt zur Ruheposition zurück; der bereits zurückgelegte Weg wird nicht erst fortgesetzt. Der gleiche vertikale Weg beträgt `MOTION.distance.scene` (36 pt).
- Die unterschiedlichen 48-pt- und 44-pt-Touch-Flächen werden über ihren Mittelpunkt ausgerichtet. Die vorhandenen visuellen Größen und Farben bleiben bestehen. Das Dock wird nicht verschoben.
- Inaktive Buttons und die geschlossene Vorlagenauswahl sind für VoiceOver ausgeblendet. Bei Bewegung reduzieren entfallen die Translationen; der Zustand wechselt kurz über die Deckkraft.
- Vorhandener Expo-Stack: SDK 57 (`~57.0.22`), Reanimated 4.5.1. Referenz: [Expo SDK 57 Reanimated](https://docs.expo.dev/versions/v57.0.0/sdk/reanimated/) und [Reanimated 4 Sequenzen](https://docs.swmansion.com/react-native-reanimated/docs/animations/withSequence/).

## Prüfungen und Abnahme

Die gezielten Tests prüfen den gemeinsamen Mittelpunkt bei mehreren Safe-Area-Abständen, ausreichend große Touch-Flächen, VoiceOver-Zustände, die Reihenfolge und den gemeinsamen unteren Punkt, die Rückrichtung sowie unterbrochene Richtungswechsel und Bewegung reduzieren. Gezielter Lauf mit den bestehenden Kalender-/Tagespopup-Tests bestanden: 5 Suiten / 63 Tests. Der vollständige Projektlauf `npm.cmd run verify:fast` und ein lokaler iOS-Export werden zusätzlich ausgeführt; deren endgültiger Nachweis steht in `artifacts/quick-planner-button-motion-proof.json`.

Noch auf iPhone zu prüfen: ruhiges Öffnen/Schließen, sichtbare identische Endposition, wiederholte schnelle Bedienung, kleine Displays, Hell/Dunkel, VoiceOver und Bewegung reduzieren. Diese Änderung benötigt keine Datenmigration. Keine Geräteabnahme oder Veröffentlichung durch lokale Tests behauptet.
