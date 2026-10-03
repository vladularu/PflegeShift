# Speicherung tariflicher Jahresansprüche

## Ziel und Scope
SQLite-Migration 21, revisionsgebundene tarifliche Jahresansprüche und bestätigte Istzahlungen; vollständige Backup-Wiederherstellung und Schutz vor offenen Testlaborläufen. UI und Familienberechnung folgen separat.

## Lieferreihenfolge
Backup v8 enthält V1-/V2-Ansprüche. Caritas-V3-Ansprüche benötigen ausdrücklich Backup v12 mit den Caritas-Ergänzungen; sie werden vor diesem Paket weder gespeichert noch unter einer älteren Formatnummer exportiert. Die zugehörigen vollständigen V3-/v11-/v12-Referenzfälle bleiben im Gesamtcheckout erhalten und werden beim Caritas-Backup-Paket integriert. Die TV-L-Quellenberechnung folgt mit dem TV-L-Fachpaket.

## Abnahme
Null, bestätigte 0 Euro, Widerruf und Auszahlung im Folgejahr bleiben unterscheidbar. Alte Backups, Prüfsummen, Konflikte bei gleichem Revisionswert und abweichendem Inhalt, Rollback sowie dauerhafte Wiederöffnung sind geprüft. Keine Tarif- oder Preview-Aktivierung durch dieses Speicherpaket.