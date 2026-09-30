# VG-06: Bestätigter Caritas-Überstundenbetrag (DRAFT)

Stand: 30.09.2026.

## Task-Vertrag

- Ziel: einen persönlichen Barbetrag aus den bereits belegten
  [Überstunden-Stundenwerten](vg06-caritas-ueberstunden-stundenwerte.md) und
  extern bestätigten vollen Stunden eines Arbeitstags berechnen.
- Plattform: reine TypeScript-Fachlogik im Expo-SDK-57-Projekt; keine native
  oder visuelle Änderung, daher kein Gerätenachweis für dieses Paket.
- Scope: neuer Rechner, Referenz-/Sperrtests und dieser Quellenbeleg.
- Abnahme: feste Referenzbeträge, getrennte Positionen, strikte Bestätigungen,
  datierte Regionalquellen, gezielte Tests und `verify:fast`.
- Nicht-Ziele: automatische Anspruchsprüfung, Kalenderstunden, Teilstunden,
  Freizeitausgleich, Zeitkonto, Bereitschaft/Rufbereitschaft, Monatsintegration,
  vollständiges Brutto, App-Anbindung oder OTA. Git-Lieferung separat freigeben.

## Anspruch und Quellen

Die [AVR, Stand 19.03.2026](https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/AVR_Online-PDF_2026_final.pdf),
Anlagen 31/32 § 4 Abs. 6–8 und § 6 Abs. 1 (gedruckte Seiten 244–246 bzw.
280–282), unterscheiden Mehrarbeit und Überstunden. Dienstgeberanordnung,
Ausgleich und Besonderheiten des Arbeitszeitmodells beeinflussen die Einordnung;
Überstunden und Zuschläge können unter Voraussetzungen in Zeit umgewandelt werden.
Dieser Rechner entscheidet diese Fragen nicht.

Er verlangt eine externe Überstundenbestätigung sowie **getrennte bestätigte
Baransprüche für Grundentgelt und Zuschlag**. Die bestätigte Stundenzahl muss
für beide Positionen gelten. Unbekannter oder verneinter Anspruch sperrt den
Gesamtbetrag. Fälle mit nur einer auszuzahlenden Position sind nicht abgedeckt.
Ein Aufrufer darf zusätzliche Kalenderstunden nicht selbst als Bestätigung behandeln.

Für 1–24 volle Stunden desselben Arbeitstags werden die bereits centgerundeten
Stundenpositionen jeweils multipliziert und anschließend addiert. Die Grenze
begrenzt den Eingabebereich dieses Tagesrechners; sie ist keine arbeitsrechtliche
Zulässigkeitsprüfung. Fehlende Regionaldaten, ungültige Tage/Stufen und veröffentlichte
Pakete bleiben gesperrt. Quellensätze und Bestätigungen bleiben im Ergebnis sichtbar.

Die [offizielle West-Tabellenbroschüre ab Juli 2025](https://s3.eu-central-1.amazonaws.com/coverpubl-lam-01/20251/SP/AVR_Tabellen-Broschur_2025_West_WebPDF.pdf)
liefert die Referenzstundenwerte: P6 Stufe 3 ergibt bei 39 Wochenstunden für
drei bestätigte Stunden 57,87 € Grundentgelt plus 17,37 € Zuschlag, zusammen
75,24 €. Bei 38,5 Wochenstunden ergeben zwei Stunden 50,84 €. Die Tests
prüfen außerdem Stufenkappung, P12, RK Ost/Berlin und fehlende Bestätigungen.

Das Ergebnis trägt `completeGross: false`. Es enthält ausschließlich den
bestätigten Überstundenbetrag, keine anderen Zeitzuschläge oder Gesamtvergütung.
Caritas bleibt `DRAFT` und in der App `UNSUPPORTED`.
