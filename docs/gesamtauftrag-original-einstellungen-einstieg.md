# Originalauftrag: Einstieg in datierte Vergütung und Ausbildung

Stand: 2026-10-04. Expo SDK 57 (~57.0.22), iPhone zuerst.

## Scope und Ziel

Sieben Dateien: Einstellungsdelegation, Ausbildungseinstieg, Vergütungsübersicht mit bestehendem Zurück-Footer, zwei ursprüngliche Einstellungsabnahmen, der bestehende Navigationstest und dieser Beleg. Der Gehaltsbereich öffnet die datierten Vergütungsstände. Änderungen am Arbeitszeitmodell bewahren den bestehenden alten Tarif und das eigene Monatsbrutto; neue Vergütungsangaben werden ausschließlich mit bestätigtem Gültigkeitsdatum gespeichert.

## Abnahmekriterien

Die ursprünglichen P5/P6-Stufe-1-Fälle, unzulässige Stufenkombination, gültige Stufe beim Gruppenwechsel, Themenwechsel ohne Speichern, ungespeicherte Felder und Erhalt aller Arbeitsnachweise bleiben erhalten. Der Ausbildungseinstieg öffnet den bereits eingebundenen ursprünglichen Bildschirm. Der aktuelle SheetBackFooter bleibt im Arbeitsmodell und wird in der datierten Übersicht fortgeführt; der bestehende Editor behält Abbrechen und Zur Übersicht.

## Grenzen und Prüfung

Keine automatische Tarif-/Stufen- oder Anspruchswahl. Keine Änderung nativer Abhängigkeiten, keine einzelne OTA. Profilzusammenfassung folgt getrennt. Gezielt alle ursprünglichen Fälle und der gesamte verify:fast auf der gemeinsamen Integrationsbasis; iPhone-Abnahme vor dem Merge dieses UI-Pakets.

## Prüfnachweis

57 gezielte Einstellungsfälle grün; verify:fast bestanden mit 5260 Unit- und 806 Komponententests. Die beiden ursprünglichen Einstellungstests sind bytegleich übernommen. Der vorhandene More-Navigationstest ergänzt den Ausbildungseinstieg auch bei deaktiviertem Testlabor. Die Original-Einstellungsseiten und -tests bleiben unverändert separat erhalten.
