# Lokale Datenaufbewahrung

LUNA Shift speichert Nutzerdaten ausschließlich lokal. Normale Löschaktionen für
Dienste, Termine und Dienstvorlagen erzeugen zunächst einen Tombstone mit
Revision und Löschzeitpunkt. Damit bleiben konkurrierende Änderungen erkennbar
und eine spätere Synchronisation kann Löschungen eindeutig übertragen.

## Produktentscheidung

„Löschen“ entfernt einen Dienst, Termin oder eine Vorlage sofort aus der
normalen App-Oberfläche und allen Berechnungen. Es gibt derzeit keine sichtbare
Einzelwiederherstellung für gelöschte Einträge. Der vollständige Datensatz bleibt jedoch zunächst
verschlüsselt in der lokalen Datenbank. Diese verzögerte physische Löschung ist
in der App unter **Mehr → Lokale Datenspeicherung** sichtbar beschrieben.

Der Vertrag gilt unabhängig von einer Cloud-Synchronisation. LUNA Shift bietet
aktuell weder Cloud-Sync noch ein automatisches Backup an. Unter **Mehr →
Datensicherung** kann die Person jedoch manuell eine versionierte JSON-Datei mit
Profil, Vorlagen, Diensten, Terminen, Tarifentscheidungen und sichtbaren
Einstellungen erstellen. Die Datei trägt einen SHA-256-Prüfwert, ist nach dem
Export außerhalb der App aber nicht verschlüsselt und muss geschützt abgelegt
werden. Testlabor-Zustand, Systemmitteilungsplanung und Regelwerkscache sind
nicht enthalten. Ein offener Testlabor-Lauf blockiert den Export, damit keine
Testdaten anstelle des gesicherten Originals exportiert werden.

Eine lokal ausgewählte JSON-Sicherung wird vor jeder Änderung vollständig auf
Dateityp, Größe, Formatversion, Datenbankschema, Feldtypen, Verknüpfungen und
SHA-256-Prüfwert geprüft. Die App zeigt anschließend Zeitpunkt, Zeitraum und
Datensatzanzahlen an. Erst nach einer ausdrücklichen Ersetzen-Bestätigung werden
die enthaltenen Nutzerdaten in einer Transaktion wiederhergestellt. Schlägt die
Transaktion fehl, bleiben die bisherigen Daten vollständig erhalten. Registrierte
Eintragserinnerungen werden vor dem Ersetzen abgebrochen und nach dem Reload aus
den wiederhergestellten Daten neu aufgebaut. Ein offener Testlabor-Lauf blockiert
auch die Wiederherstellung.

## Temporäre Backup-Dateien

Auf dem iPhone wird die temporäre Exportdatei erst nach Abschluss oder Abbruch
des Teilen-Dialogs entfernt, auch nach Schreib- oder Übergabefehlern. Jeder Export
erhält einen eigenen Dateinamen; bereits vorhandene Dateien werden nicht überschrieben.
Die vom DocumentPicker erzeugte Cache-Kopie wird nach dem Einlesen und Prüfen
entfernt, auch wenn die Prüfung fehlschlägt. Die Vorschau und Wiederherstellung
verwenden danach ausschließlich die geprüften Daten im Arbeitsspeicher.

Gelöscht wird nur die konkret zugehörige Datei innerhalb des App-Caches.
Originaldateien im Dateianbieter, ausdrücklich gespeicherte Sicherungen und die
Datenbank bleiben unberührt. Es gibt keine pauschale Ordnerbereinigung. Kann die
temporäre Datei nicht entfernt werden, meldet die App dies gesondert; eine
Wiederherstellung wird in diesem Fall nicht angeboten.

Bei einem Prozessabbruch vor der Bereinigung können Cache-Kopien zurückbleiben.
Auch Kopien älterer App-Versionen werden nicht nachträglich anhand ihres Namens
gelöscht. Ihre spätere Entfernung bleibt der Cache-Verwaltung des Betriebssystems
überlassen. Das Entfernen einer Datei ist keine Zusage forensisch sicherer Löschung.

## Aufbewahrungsfrist

- Tombstones gelöschter Dienste und Termine werden 90 Tage aufbewahrt und beim
  nächsten nativen App-Start nach Ablauf der Frist in einer exklusiven
  Transaktion bereinigt.
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
Original wiederherstellt oder die Testdaten übernimmt. Backup-Payload v2 erhält
auch Ganztagsstatus, Erinnerungen, Orte und Terminserien. Payload v1 bleibt
lesbar und erhält für später ergänzte Felder sichere Standardwerte. Alte und
neue Payloads werden vor jedem Ersetzen vollständig auf Monat, IDs,
Zeilenanzahl und Feldtypen geprüft.

Vor Einführung einer Cloud-Synchronisation muss der automatische Purge um ein
Server-Acknowledgement und eine leere lokale Outbox als zusätzliche Bedingungen
erweitert werden. Bis dahin darf kein Sync-Feature auf der aktuellen
zeitbasierten Bedingung allein aufbauen.
