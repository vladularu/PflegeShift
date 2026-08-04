# Lokale Datenaufbewahrung

MediShift speichert Nutzerdaten ausschließlich lokal. Normale Löschaktionen für
Dienste, Termine und Dienstvorlagen erzeugen zunächst einen Tombstone mit
Revision und Löschzeitpunkt. Damit bleiben konkurrierende Änderungen erkennbar
und eine spätere Synchronisation kann Löschungen eindeutig übertragen.

## Aufbewahrungsfrist

- Tombstones werden 90 Tage aufbewahrt.
- Abgelaufene Dienste und Termine werden beim nativen App-Start in einer
  exklusiven Transaktion bereinigt.
- Benutzerdefinierte Dienstvorlagen werden nur bereinigt, wenn weder ein Dienst
  noch ein offenes Testlabor-Backup auf sie verweist.
- Gelöschte mitgelieferte Standardvorlagen bleiben als Tombstone erhalten,
  damit sie beim App-Start nicht versehentlich wieder aktiviert werden.
- Kann ein offenes Testlabor-Backup nicht validiert werden, werden
  vorsorglich keine Vorlagen-Tombstones entfernt.
- Monate mit einem offenen Testlabor-Backup sind von der Bereinigung
  ausgenommen.
- SQLite `secure_delete` ist aktiv. Nach der Bereinigung wird der WAL-Checkpoint
  abgeschlossen, damit gelöschte Inhalte nicht unnötig in WAL-Seiten verbleiben.

Testlabor-Backups bleiben erhalten, bis die Person ausdrücklich entweder das
Original wiederherstellt oder die Testdaten übernimmt. Neue Backup-Payloads
sind versioniert; alte und neue Payloads werden vor jedem Ersetzen vollständig
auf Monat, IDs, Zeilenanzahl und Feldtypen geprüft.

Vor Einführung einer Cloud-Synchronisation muss der automatische Purge um ein
Server-Acknowledgement und eine leere lokale Outbox als zusätzliche Bedingungen
erweitert werden. Bis dahin darf kein Sync-Feature auf der aktuellen
zeitbasierten Bedingung allein aufbauen.
