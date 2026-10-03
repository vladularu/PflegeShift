# Datierte Vergütungsprofile und Backup v2

## Auftrag

- Ziel: datierte Vergütungsprofile revisionssicher speichern und verlustfrei exportieren/wiederherstellen.
- Plattform: bestehende Expo-SQLite-/SQLCipher-Verbindung, gemeinsame TypeScript-Datenlogik.
- Scope: Profilrepository, atomare Migrationen 14/15, Backup-Snapshot/Serializer/Validator/Restore, zugehörige Fixtures und Migrationszahlprüfungen, integrierte Repository-/Kompatibilitätstests, dieser Beleg. Provider und UI folgen separat.
- Abnahme: Konflikte überschreiben keine neuere Revision; unbekannter historischer Beginn bleibt null; fehlerhafte Migration/Restore rollt vollständig zurück. Backup v1 bleibt lesbar, v2 erhält JSON-Bytes im Prüfwert und verwirft doppelte/ungültige Profile. Vollständige DB-Suite, verify:fast und sieben PR-Prüfungen.

## Kompatibilität

Die eingefrorene Datenmigration 15 erstellt aus dem bestehenden Arbeitsprofil einen historischen Datensatz ohne erfundenes Gültigkeitsdatum. Backup v1 enthält keine datierten Profile: Nach dessen Wiederherstellung wird nur dieses Legacy-Profil aufgebaut. Backup v2 enthält ausdrücklich datierte Profile und benötigt mindestens Schema 14. Weitere Bestätigungs- und Ausbildungsdaten folgen mit eigenen Backup-Versionen, wie im erhaltenen Gesamtcheckout vorbereitet.
