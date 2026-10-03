# Speicherung bezahlter Abwesenheiten

## Auftrag

Explizite bezahlte Minuten an Dienstrevision, Datum, Änderungszeitpunkt und Zeitzone binden. Offline SQLite; iPhone-UI folgt separat. Migration 18, Backup v5 mit Import v1–v4 sowie Testlabor-Backup v5 sichern die neuen Daten gemeinsam. Die Testlabor-Sicherung erhält dabei auch die bereits gespeicherten Zulagen- und Überstundenbestätigungen.

## Abnahme

Null, null Minuten und bestätigte Minuten bleiben unterscheidbar. Geänderte oder gelöschte Dienste machen Bestätigungen wirkungslos. Migration, Schreiben, Backupimport und Testlabor-Wiederherstellung erfolgen atomar. Altbackups erfinden keine Bestätigungen; zusätzliche oder verwaiste Datensätze werden vor Ersatz verworfen. Keine Provider-/UI-Anbindung oder Tarifaktivierung in diesem Paket.

## Prüfung

Die vorhandenen Speicher- und Backupfälle sind im erhaltenen Gesamtcheckout grün. Vor Lieferung laufen die vollständige Datenbanksuite und verify:fast auf aktuellem master.
