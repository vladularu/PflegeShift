# Caritas-Jahresnachweise: koordinierte Backupstufe 12

## Auftrag

Die erhaltenen Caritas-v3-Jahresbestätigungen aus dem Gesamtauftrag nach der Monats-Speicherstufe verlustfrei lokal speichern und wiederherstellen.

## Scope

Sechs Dateien: Tarif-Jahresrepository, lokaler Serializer, Validator, bestehender Jahresbackup-Test, ergänzende kritische Caritas-Backupfälle und dieser Beleg. SQLite-Schema 24 bleibt ausreichend; Testlabor erzeugt keine Jahresbestätigungen und dessen globale Schreibsperre bleibt bestehen. Keine native oder visuelle Änderung.

## Abnahme

- Bestätigter Caritas-v3-Nachweis bleibt nach Export, Änderung und Restore unverändert.
- Echte v11-Backups mit v1-Ansprüchen bleiben importierbar.
- Checksum-gültige v3-Daten mit Format v8, v9, v10 oder v11 werden abgelehnt.
- Unbekannte Angaben, Nichtbestätigung, Widerruf, Nullzahlung und Auszahlung im Folgejahr bleiben unverändert.
- Ungültige Septemberbestätigung und falsche Tarif-Familie führen zu keinem Schreibvorgang.
- Ein fehlgeschlagener Restore rollt vollständig zurück.
- Vollständige Datenbanksuite und verify:fast.

## Grenze

Dies liefert den Speichervertrag. Die vorhandenen Caritas-DRAFT-Regeln, persönliche Monatsausgabe, Fachfreigabe, App-Anbindung und Preview-Abnahme bleiben eigenständige weitere Schritte.
