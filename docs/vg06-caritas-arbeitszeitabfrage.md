# VG-06: Quellenabfrage der Caritas-Vollzeitwochenzeit

Stand: 25.09.2026. lookupCaritasFullTimeWeeklyMinutes liest aus einem
vollständig validierten Caritas-P-DRAFT-Paket die datierte Vollzeit-Wochenzeit
für eine ausdrücklich gewählte Anlage und Region beziehungsweise ein
Tarifgebiet. Das Ergebnis enthält Paket- und Regelkennung, Minuten und
Quellen-IDs. Ungültige Daten, unbekannte Auswahlen, fehlende Arbeitszeitregeln
und veränderte Pakete liefern einen ausdrücklichen Nicht-verfügbar-Grund.

Gezielte Tests prüfen die fünf West-Regionen in beiden Tabellenzeiträumen,
Anlagen 31/32, die drei Tarifgebiete der RK Ost und den Berliner Wechsel am
01.07.2025. Die Quellen und regionalen Regeln stehen in
vg06-caritas-arbeitszeitvertrag.md,
vg06-caritas-west-arbeitszeit-draft.md und
vg06-caritas-ost-arbeitszeit-draft.md.

Die Abfrage berechnet weder eine persönliche Teilzeitquote noch Gehalt,
Zulagen oder andere Ansprüche. Sie ist nicht mit Profil, Auswertung oder
Katalogaktivierung verbunden. Alle Caritas-Pakete bleiben DRAFT und für die
App-Berechnung gesperrt. Ein persönlicher Tabellenbetrag benötigt einen
separat belegten Teilzeitvertrag und weitere Fachprüfung.
