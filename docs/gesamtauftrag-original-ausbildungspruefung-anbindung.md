# Originalauftrag: Ausbildungszeit und unvollständige Prüfungen sichtbar anbinden

Stand: 2026-10-04. Expo SDK 57 (~57.0.22), iPhone zuerst.

## Ziel und Dateiscope

14 Dateien schließen einen Nutzerfluss: ursprüngliche Ausbildungszeit in Monats-/Jahresprüfung und ausdrücklich optionale Dienstplan-Empfehlungen. Die Tagesgutschriften erscheinen getrennt von Ist-Zeit, Stundensaldo und Gehalt. Jahresprüfung behält bekannte Meldungen und öffnet konkret unvollständige Monate; sie behauptet bei fehlenden Regeln oder Angaben keine Nullmeldungen.

## Abnahme

Alle ursprünglichen Prüfdetails- und Einstellungsfälle, Ausbildungszeit mit unbekannter Pflegegutschrift, Jahresmonatslink mit bekannten und unbekannten Tagen, gemischte vollständige/unvollständige Monate, Sichtbarkeit gesetzlicher Hinweise bei ausgeblendeten Empfehlungen und gespeicherte gemeinsame Auswahl bleiben erhalten. Ausbildungsdaten-Fixtures bilden den vollständigen Snapshot ab. Aktuelle Ellipsensymbole, Pressed-Stil, Kartenabstände und Abschlusslinien bleiben erhalten.

## DRAFT und Liefergrenzen

Jugendregeln bleiben bis zur eigenständigen fachlichen Freigabe ungebündelt und gesperrt; fehlende Grundlage wird weiterhin erklärt. Optionale Empfehlungen sind keine eigenständigen gesetzlichen Verstöße. Es gibt keine neue Nacht-Erholungsfunktion, keine einzelne OTA und keine native Änderung. Der ursprüngliche vollständige Prüfstand bleibt separat erhalten; iPhone-Abnahme vor UI-Merge.

## Pflichtprüfung

Gezielte ursprüngliche Monats-, Jahres-, Detail- und Einstellungstests sowie verify:fast auf der gemeinsamen Formular-/Gehaltsbasis.

Ergebnis: 62 gezielte Komponententests grün; vollständiger Pflichtcheck grün mit 5270 Unit- und 813 Komponententests sowie allen Operator-, Liefer-, Audit- und Runtime-Prüfungen. Der Gerätecheck bleibt Teil der abschließenden gemeinsamen Preview-Abnahme.
