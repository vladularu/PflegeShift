# Caritas: gespeicherte Bestätigungsverträge

## Aufgabe

Ziel: vorhandene Verträge für ausdrückliche Tages-, Monats- und Überstundenbestätigungen in den aktuellen Lieferstand aufnehmen.
Plattform: gemeinsamer TypeScript-Kern für die iPhone-App; keine UI oder native Änderung.
Scope: drei Domain-Dateien, ein gezielter Grenztest und dieser Beleg.

## Abnahme

- Unbekannte, verneinte und bestätigte Antworten bleiben verschieden.
- Bestätigungen sind an konkrete Dienst-, Profil-, Allokations- und Regelrevisionen gebunden.
- Geänderte oder gelöschte Dienste und widerrufene Überstundenallokationen dürfen keine gültige Bestätigung liefern.
- Geld und Zeitausgleich für Grundentgelt und Zuschlag bleiben separat; unbekannter Zahlungsmonat bleibt null.
- Unbekannte Formate, fehlerhafte Zeitpunkte, Kalenderdaten und Zeitzonen werden abgewiesen.
- Gezielte Tests und verify:fast müssen vollständig bestehen.

## Grenzen und Fortgang

Diese Verträge erfassen externe Bestätigungen. Sie ermitteln keinen tariflichen Anspruch und aktivieren keine Caritas-Berechnung. Die Speicher-/Backup-Pakete für Migrationen 23–25 folgen separat. Fachfreigabe, vollständige App-Anbindung und Geräteabnahme bleiben Teil des Gesamtauftrags.

Umsetzung und Git-Lieferung sind durch die fortgeltende Nutzerfreigabe gedeckt.
