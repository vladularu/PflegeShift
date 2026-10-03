# Speicherung tatsächlicher eigener Jahreszahlungen

## Ziel und Scope

Bestätigte Bruttobeträge eigener Sonderzahlungen mit stabiler Zahlungskennung, Anspruchsjahr, Auszahlungsmonat, Revision und explizitem Widerruf offline erhalten. SQLite, Migration 20 und Backup v7 mit Import v1–v6. Tarifliche Jahresansprüche und die Provider-/UI-Anbindung folgen gesondert.

## Abnahme

Null Euro ist ein bestätigter Betrag; Widerruf stellt keine vorherige Schätzung wieder her. Keine Änderung stabiler Kennung/Jahr durch Bearbeitung. Parallelzugriffe, gleiche Revision mit anderem Inhalt und Wiederherstellung müssen Konflikte sicher erkennen. Während eines offenen Testlabor-Backups bleiben Bestätigung, Bearbeitung und Widerruf gesperrt. Die additive Migration besitzt keinen destruktiven Downgrade. Keine App-Aktivierung oder OTA.

## Prüfung

Die gemeinsamen Jahreszahlungsspeicher-Fälle sind im Gesamtcheckout mit 95 Tests grün. Vor Lieferung laufen die vollständige Datenbanksuite und verify:fast auf aktuellem master.
