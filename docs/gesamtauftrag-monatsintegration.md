# Datierte Monatsintegration

## Auftrag

- Ziel: Grundbetrag, Zeitzuschläge, Zulagen, bestätigte Überstunden und Jahreszahlungen zu einem datierten Monatsergebnis zusammenführen.
- Plattform: gemeinsame TypeScript-Fachlogik, noch ohne Datenbank- oder UI-Anbindung.
- Scope: datierte Zulagenbewertung samt Referenztests, Monatsorchestrierung, optionales Regeldatum der bestehenden BT-K-Bewertung, gespeicherte Überstundenintegration und dieser Beleg. Ein zusätzlicher kleiner Integrationstest prüft eigene Monats-/Stundenkonfiguration und unbekannte Komponenten.
- Abnahme: identische datierte Tarifbasis für Bewertung und Geld; Bestätigungen sind an Tarif und Zeitraum gebunden; unbekannte Komponenten verhindern ein Gesamtbrutto, bekannte Teilbeträge bleiben sichtbar. Jahreszahlung erscheint im tatsächlichen Zahlungsmonat. Vollständiger Pflichtcheck und sieben PR-Prüfungen.

## Integration

Der erhaltene Gesamtcheckout enthält bereits spätere Tarifverfahren. Im Lieferbranch werden nur die auf aktuellem master vorhandenen Verfahren angebunden. Die übrigen Verfahren folgen mit ihren Katalog-, Daten- und Anspruchsverträgen. Das bestehende BT-K-Verfahren behält sein Standarddatum; ein explizites Datum muss im Prüfmonat liegen.
