# TVöD SuE: Zulagenbestätigung im lokalen Speicher

## Ziel und Scope

Sechs Quelldateien liefern Migration 28, Repository, ursprüngliche Abnahmekriterien und Backup-Prüfungen. Die Integration umfasst maximal 15 Dateien mit lokalem Backup 16 und Testlabor 13. Keine native oder visuelle Änderung.

## Abnahme

Explizite Klassifikation, ganzer Monatsanspruch, S15-Fallgruppe und Umwandlungstage bleiben getrennt; keine Ableitung aus Grundentgelt oder Berufsbezeichnung. Optimistische Revisionen, eine datierte Profilfassung für den ganzen Monat, historische Antworten und ungültige Elternreferenzen werden geprüft. Lokale v15- und Testlabor-v12-Backups erzeugen keine neuen Antworten. Migration und Wiederherstellung müssen bei Fehlern zurückrollen.

Der ursprüngliche positive Snapshot-Abnahmefall bleibt unverändert in tvoed-sue-allowance-confirmation-port.test.ts und wird mit dem vollständigen Provider geliefert.
