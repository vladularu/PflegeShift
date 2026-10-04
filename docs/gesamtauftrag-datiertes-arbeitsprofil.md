# Datierte Vergütung im Arbeitsprofil

Stand: 2026-10-04. Expo SDK 57 (~57.0.22), iPhone zuerst.

## Ziel und Scope

Acht Dateien: bestehende Profilzusammenfassung, neuer Datenhook, Profilkarte, Arbeitsprofilseite, zwei vorhandene Komponententests, gezielte reine Datumsfälle und dieser Beleg. Die Gehaltsbeschriftung beider Einstiege verwendet den tatsächlich für heute gültigen Vergütungsverlauf. Darstellungsfarben, Kartenabstände, persönliche Identität und das Arbeitszeitmodell bleiben erhalten.

## Abnahme

Ein datierter P5-Stand erscheint auch bei altem P9-Profil; ein späterer Stand gilt erst ab seinem Datum. Laden, Fehler, fehlende Historie, unbekannter Beginn und gleiche Revision mit geändertem Inhalt dürfen keinen alten Betrag anzeigen. Gruppen/Stufen und selbst konfigurierte Monats- bzw. Stundenbasis werden angezeigt, keine vollständige Bruttoberechnung behauptet. Die bestehende Tarifprüfungsroute wird nur für die aktuelle tarifliche Auswahl gezeigt. Profiländerungen überschreiben keine Vergütungshistorie.

## Grenzen

Die Anzeige beschreibt die gespeicherte Auswahl und keine fachliche Freigabe. Nicht verfügbare Tarifregeln bleiben als offene Berechnungsgrundlage erkennbar. Kein DRAFT wird aktiviert; keine einzelne OTA. iPhone-Abnahme vor UI-Merge.

## Konkrete Prüfung

Vier neue Komponentenfälle waren vor dem Anschluss rot: beide alten Profilanzeigen ignorierten datierte P5-Inhalte, und die Karte zeigte bei Laden/Fehler weiterhin den alten Geldbetrag. Danach 17 Komponentenfälle und zehn Datumsfälle grün. verify:fast bestanden mit 5270 Unit- und 810 Komponententests. Ein absichtlich ungültiger Restore-Test ist ausdrücklich als unbekannte externe Eingabe typisiert. Kartenstil und persönliche Speicherfelder sind unverändert; erst das tatsächliche Datum bestimmt den Gehaltsstand.
