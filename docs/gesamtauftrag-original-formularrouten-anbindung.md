# Originalauftrag: Formularrouten und Root-Stack

Stand: 2026-10-04. Expo SDK 57 (~57.0.22), iPhone 14 Pro Max / Preview zuerst.

## Ziel und Dateiscope

Elf Dateien: neun bytegleiche ursprüngliche Eingangsseiten, neun additive Stack-Einträge in app/_layout.tsx und dieser Beleg. Ausbildung/Alter, Schulzeiten/Pausen, Jahreszahlung, Überstundenaufteilung, bezahlte Abwesenheit, TV-L-/SuE-/Anlage-A-Angaben erhalten eindeutige Seiten und Monatslinks.

## Voraussetzungen

Die separat geprüften Eingabe- und Formularpakete werden in einem gemeinsamen Kandidaten integriert. Die bestehenden Provider bleiben erhalten. Bei Tarif-/Ausbildungs-Auswahl und Auswertung werden die tatsächlichen Eingangslinks in getrennten Fach-/UX-Paketen angeschlossen.

## Abnahmekriterien

Die neun ursprünglichen Wrapper bleiben bytegleich. Der Root-Stack erhält ausschließlich ihre neuen Einträge. Ein Dateibaumvergleich beweist, dass die sonstigen Unterschiede zum alten Original lediglich historische Sheet-Höhen sind; die aktuellen Sheet-Höhen bleiben bestehen. Alle Formular- und Datenbindungstests sowie verify:fast müssen im gemeinsamen Stand bestehen. Die endgültige gemeinsame Preview-Abnahme prüft Öffnen, Zurück, Monatswechsel, Tastatur und große Texte.

## Liefergrenze

Merge erst nach echtem Gerätenachweis auf dem endgültigen kohärenten Preview-Kandidaten. Keine einzelne OTA, Production-, TestFlight- oder native Build-Veröffentlichung. DRAFT-Regeln bleiben bis zur erforderlichen Fachprüfung unaktiviert.
