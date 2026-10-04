# Caritas: Dienstbestätigungen speichern

## Aufgabe und Scope

Ausdrücklich bestätigte Tagesantworten revisionsgebunden und atomar speichern. Scope: Repository, additive Migration 23, Repository-/Backup-/Testlaborprüfungen und dieser Beleg. Die Einbindung in den Lieferstand umfasst zusätzlich die bestehenden Migration-, Snapshot-, Backup-, Validator-, Restore- und Testlaborpfade, insgesamt höchstens 15 Dateien.

Zielplattform: gemeinsamer Speicherpfad der iPhone-App. Keine neue native Abhängigkeit oder UI.

## Abnahme

- Feiertagszeitausgleich und Schichtarbeit behalten true, false oder null.
- Diensttag, Zeitzone und Änderungsrevision werden vor dem Speichern geprüft.
- Optimistische Konflikte erfordern eine neue Bestätigung; alte Daten bleiben erhalten.
- Migration 23 ist additiv und einmalig; Registrierung und Wiederherstellung rollen bei Fehlern zurück.
- Lokales Backup v10 und Testlabor v8 erhalten die neue Sammlung; ältere Formate erfinden keine Antworten.
- Fehlende Eltern, zukünftige Revisionen, doppelte Schlüssel und manipulierte Daten werden vor der Wiederherstellung abgewiesen.
- Die gesamte Datenbanksuite und verify:fast müssen bestehen.

## Fortgang

Caritas bleibt DRAFT. Diese Speicherung liefert keine eigenständige Anspruchsprüfung oder App-Aktivierung. Monatsbestätigungen und Überstunden folgen als getrennte Speicherpakete. Umsetzung und Git-Lieferung sind fortlaufend freigegeben.
