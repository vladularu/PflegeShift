# Speicherung bestätigter Vergütungskomponenten

## Ziel und Scope

Zulagenbestätigungen nach Monat, Zeitraum und Tarif sowie Überstunden nach Dienstrevision und tatsächlichem Diensttag dauerhaft speichern. Plattform: offline SQLite, iPhone-Anbindung folgt separat. Fünf Quelldateien; im Lieferpaket zusätzlich Migrationen 16/17, Backup v4 mit Import v1–v3 und gemeinsame DB-Fixtures.

## Abnahme

Keine automatische Übernahme undatierter Altbestätigungen oder unbestätigter Stunden. Revisionen bleiben auch bei Widerruf erhalten; parallele Schreiber, Tarifwechsel, Dienständerungen und geänderte Zeitzonen überschreiben keine Bestätigung. Migration/Restore sind atomar. Alte Backups behalten ihre ursprüngliche Prüfsumme und leeren fehlende neuere Datensätze.

## Prüfung

80 gezielte SQLite-Fälle im erhaltenen Gesamtcheckout bestanden. Vor Lieferung werden diese Fälle, die vollständige Datenbanksuite und verify:fast auf aktuellem master geprüft. Kein Provider, UI, Backend oder OTA in diesem Paket.
