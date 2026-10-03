# Testlabor-Version und vollständige Migration-Teststände

## Scope und Ziel

Sieben-Dateien-Vorbereitung für die verbleibenden Speicherpakete auf Expo SDK 57. Die bestehende Testlabor-Version 6 wird als DEV_BACKUP_VERSION exportiert und für Typ, Parsergrenze, Normalisierung, Erzeugung und Repository-Abnahme verwendet. Das Format bleibt identisch.

Ein ausschließlich testseitiger Helfer entfernt in isolierten Datenbankfixtures alle bekannten Vergütungstabellen ab der gewählten Migration und ihre Registry-Einträge. Die Altstands-/Rollback-Tests für Migration 14, 20 und 21 verwenden ihn. Das verhindert widersprüchliche Rückstände, bei denen spätere Tabellen vorhanden sind, ihre Migration aber erneut laufen soll. Die feste Liste umfasst den bereits erhaltenen Gesamtauftrag bis Migration 31; unbekannte Startversionen werden abgewiesen.

## Abnahme

Die bestehenden echten SQLite-Fälle prüfen Revisionshistorie, 10000 Dienste, Fehler-Rollback, Idempotenz und Wiederherstellung weiter unverändert. Vollständige Datenbanksuite und verify:fast auf aktuellem master. Historische Backup-Importfälle behalten ihre festen Versionen.

## Grenzen

Keine produktive Datenmigration oder produktiver Aufruf des Rewind-Helfers, keine UI-Änderung oder Veröffentlichung. Die nächsten Speicherpakete erhöhen die Formatversion erst zusammen mit ihren Datenvalidierungen.
