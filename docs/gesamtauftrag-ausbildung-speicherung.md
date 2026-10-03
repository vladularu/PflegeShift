# Speicherung von Ausbildung, Schule und tatsächlichen Pausen

## Ziel und Scope

Datierte Ausbildungsprofile sowie explizite Schul-, Prüfungs-, Wege- und Pausenangaben offline speichern. Plattform: SQLite; spätere iPhone-UI-Anbindung separat. Migration 19, Backup v6 mit Import v1–v5 und Testlabor-Backup v6 gehören zur gemeinsamen Speicherabnahme.

## Abnahme

Unbekannte Angaben bleiben null. Keine automatische Ableitung aus Namen, Alter oder Ausbildungsbeginn. Angaben binden an Dienstrevision, Datum, Änderungszeitpunkt und Zeitzone. Nur ausdrücklich gewünschte Übernahme tatsächlicher Pausen ändert die Dienstsummen gemeinsam und atomar; Widerrufe und Konflikte werden sicher behandelt. Historische Backups erfinden keine Ausbildungsangaben. Kein Provider, UI, Backend oder Tarifrelease in diesem Paket.

## Prüfung

Die vorhandenen Ausbildungs-Speicherfälle sind im erhaltenen Gesamtcheckout grün; vor Lieferung laufen die vollständige Datenbanksuite und verify:fast auf aktuellem master.
