# Caritas: Monatsbestätigungen speichern

## Aufgabe und Scope

Explizite Caritas-Monatsantworten an ein durchgehend gültiges Vergütungsprofil und dessen Revision binden. Scope: Repository, additive Migration 24, Repository-/Backup-/Testlaborfälle und dieser Beleg. Einbindung im Lieferstand: höchstens 15 Dateien einschließlich Backup v11, Testlabor v9 und aller gemeinsamen Pfade.

Zielplattform: gemeinsamer iPhone-Speicherpfad; keine neue native Abhängigkeit oder UI.

## Abnahme

- Unbekannte, verneinte und bestätigte Beschäftigungs-/Anspruchsantworten bleiben getrennt.
- Lokale Vereinbarungen, Anlage, Region und Regelversion bleiben nachvollziehbar.
- Ein Profilwechsel innerhalb des Monats oder ein Schreibkonflikt erfordert eine neue Bestätigung.
- Historische Antworten bleiben erhalten; zukünftige oder fehlende Profilreferenzen werden abgewiesen.
- Altformate erfinden keine Antworten; manipulierte Backups werden vor dem Restore abgewiesen.
- Fehlgeschlagene Migrationen und Wiederherstellungen rollen atomar zurück.
- Gesamte Datenbanksuite und verify:fast müssen bestehen.

## Vollständiger Provider

Der ursprüngliche positive Port-/Snapshot-Test ist in caritas-month-facts-port.test.ts erhalten und wird gemeinsam mit dem vollständigen Provider geliefert. Die ursprünglichen Repository-, Backup- und Testlaborfälle bleiben erhalten und werden separat geprüft.

Caritas bleibt DRAFT. Diese Speicherung ermittelt keinen Anspruch und aktiviert kein Gehalt. Die fortgeltende Nutzerfreigabe umfasst Umsetzung und Git-Lieferung.
