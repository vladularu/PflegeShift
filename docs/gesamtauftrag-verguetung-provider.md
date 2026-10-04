# Gemeinsamer Vergütungsdatenstand und Provider

## Ziel und Scope

Alle Profildaten und Bestätigungen aus einer abgeschlossenen SQLite-Transaktion laden. Provider-Schreibvorgänge und Wiederherstellung invalidieren den berechnungsfähigen Zustand bis zum vollständigen Neuladen. Diagnosemeldungen enthalten keine persönlichen JSON-Daten oder Beträge.

## Lieferreihenfolge

Das erste Paket umfasst die bereits gelieferten Profile, Zulagen, Überstunden, bezahlten Abwesenheiten und Jahreszahlungen sowie die Ausbildungs-Speicherports. Familienbestätigungen für TV-L, Caritas, Anlage A, SuE und DRK folgen nach ihren eigenen Speicherpaketen. Ihre vollständigen Quell- und Testfälle bleiben im Gesamtcheckout erhalten. Die globale Runtime-Anbindung und die sichtbaren Einstellungs-/Auswertungsflächen werden gesondert integriert.

## Abnahme

Verspätete Antworten eines ersetzten Datenbankkontexts dürfen nie übernommen werden. Überlappende Schreiber lösen erst nach dem letzten Abschluss ein gemeinsames Neuladen aus. Ein bereits gespeicherter Schreibvorgang bleibt erfolgreich, auch wenn dessen anschließendes Neuladen fehlschlägt; die Berechnung bleibt dann gesperrt. Ein erfolgreich leerer Datenstand wird vom Ladefehler unterschieden.

## Prüfung

Im erhaltenen Gesamtcheckout sind 20 SQLite-Snapshotfälle und 36 Provider-Komponententests grün. Auf dem integrierten Branch folgen gezielte Tests und der vollständige Pflichtcheck. Keine Preview- oder Tarifaktivierung durch dieses Paket.
