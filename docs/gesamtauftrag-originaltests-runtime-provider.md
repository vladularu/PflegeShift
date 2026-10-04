# Originalabgleich: Laufzeit, Ports und TV-L-Provider

## Auftrag und Abnahme

Fünf Dateien auf aktuellem master: ursprüngliche Portverdrahtungstests, TV-L-Providerfälle und P5/P6-Laufzeitupgrade, aktualisierte bestehende Pay-Testfixture und dieser Beleg. Plattform: gemeinsame JS/TypeScript-Anwendung, Expo SDK 57. Abnahme: ursprüngliche zwölf P5/P6-Stufenwerte mit Voll-/Teilzeit, unveränderte Feiertags-/Rechtsregeln und P8-Beträge, Fehler-/Überlappungsschutz, Provider-Speicher-/Reload-/Parallelitätsverhalten und Portbindung. Gezielte Prüfungen, verify:fast, sieben CI-Prüfungen.

## Originaltreue

Portdatei und TV-L-Providerdatei werden bytegleich übernommen; die drei bestehenden Portfälle bleiben erhalten. P5/P6-Fälle behalten den historischen r2-Inhalt bytegleich als isolierte Testfixture und bestätigen DRAFT mit leerem Review. Dieser alte Vertrag 8 wird heute durch das Schema ausgeschlossen. Die tatsächlichen synthetischen Laufzeitupgrades verwenden deshalb das aktuelle, gültige r3-Paket mit Vertrag 11; dessen realer REVIEWED-Status wird korrekt geprüft. Alle Tabellenbeträge und Vergleichsfälle bleiben erhalten. Der bestehende Pay-Test erhält dieselbe aktuelle r3-Fixture statt der älteren unvollständigen Tabelle.

Die Katalog-Snapshots verwenden ausschließlich synthetische Testreviews. Kein Backend, keine echten Signaturen oder App-Aktivierung. Kein Produktionscode, keine UI oder native Änderung. Die unveränderten Originale werden separat lokal gesichert.

## Prüfung

Ausstehend: gezielte und vollständige Prüfungen sowie PR-CI.
