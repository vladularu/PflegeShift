# Build 32: einfachen Gehaltseinstieg wiederherstellen

## Task-Vertrag

- Ziel: Gehaltsangaben direkt öffnen, vorhandene Werte erhalten und ohne Pflicht-Datumseingabe für den sichtbar bezeichneten aktuellen Monat bestätigen können.
- Plattform: iOS Preview, iPhone des Nutzers; Farben, Karten und native Sheet-Höhe bleiben am gelieferten Build orientiert.
- Dateiscope: Gehaltseinstieg, Gehaltsformular, Tarif-Felder, deren zwei Komponententestdateien und dieser Beleg (sechs Dateien).
- Abnahme: übernommenen TVöD-Stand mit Gruppe/Stufe/Wochenstunden ohne erneute Tarifwahl speichern; keine automatische Speicherung, keine erfundene frühere Historie; bestehenden Monatsstand mit dessen Revision korrigieren; andere Anfänge und frühere Stände bleiben ausdrücklich erreichbar.
- Git-Lieferung: bestehende Gesamtfreigabe des Nutzers. Der PR wird klein gegen den geprüften integrierten Kandidaten erstellt; Geräteabnahme vor UI-Merge.

## Geräteevidenz und Nutzerkorrektur

Build 32 wurde am 04.10.2026 auf dem iPhone installiert. Die gelieferten Fotos zeigen einen übernommenen Stand mit unbekanntem Beginn, die dadurch gesperrte Monatsauswertung und rohe Tarifkennungen nach einem nicht auflösbaren Datum. Der Nutzer beschreibt viele Untermenüs und Pflicht-Datumsfelder als unnötige Reibung und fordert wieder einen verständlichen Gehaltsfluss.

## Umsetzung

Ein direktes Formular verwendet die tatsächlichen vorhandenen Angaben. Ein neuer Stand wird erst mit Speichern für den sichtbar genannten aktuellen Monat bestätigt. Existiert bereits ein passender aktueller Monatsstand, bleibt seine Revision erhalten. Ein bestätigter späterer Anfang innerhalb des Monats wird nicht auf den Monatsersten vorgezogen. Das andere Startdatum und die Historie sind optionale Vertiefungen. Bei ungültigem Datum wird die Datumsangabe erklärt, statt gültige Tarifwerte als nicht verfügbar erscheinen zu lassen. Tarifbezeichnungen sind im einfachen Einstieg kurz; Detailangaben bleiben zugänglich.

Tarifregeln, Datenbankschema, Katalogfreigaben und DRAFT-Grenzen werden in diesem Paket nicht geändert. Die Zusammenstellung der Monatsauswertung und die Schul-/Pausenseiten folgen in eigenen kleinen Paketen.

## Prüfung

Die fünf neuen Regressionen wurden zuerst reproduziert. Danach bestanden alle 47 gezielten Komponententests einschließlich P5/P6. `verify:fast` ist grün: 5.750 Unit-Tests, 834 Komponententests und alle Script-Gates. Echte iPhone-Abnahme der Korrektur: offen. Eine erfolgreiche CI oder ein Export ersetzt diese Abnahme nicht.
