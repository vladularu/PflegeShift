# DRK-Profil- und Speicheradapter (VG-09)

## Task-Vertrag

- Ziel: datierte persönliche Vergütungs-/Ausbildungsprofile und gespeicherte aktuelle Monatsbestätigungen mit den isolierten DRK-Tabellen-Grundbeträgen verbinden.
- Nicht-Ziele: automatische Tarif-/Anlagenzuordnung, vollständiges Brutto, App-Masken, Fachfreigabe, Tarifaktivierung und OTA.
- Plattform: gemeinsame TypeScript-Fachlogik.
- Scope: exakt neun Dateien (vier Adapter, alle vier ursprünglichen Testdateien und dieser Beleg).
- Abnahme: alle 25 ursprünglichen Adapterfälle; fehlende, doppelte, veraltete oder unbekannte Bestätigungen sperren den Betrag; Monatswechsel von Profilen oder Katalog bleiben gesperrt; verify:fast und sieben grüne CI-Prüfungen.

## Kompatibilität und Grenzen

Die Ausbildungsprofil-Auswahl im aktuellen Master liefert validierte Kopien. Die beiden ursprünglichen Adapter vergleichen deshalb die eindeutige Gültigkeitsgrenze statt Objektidentität. Doppelte Grenzen bleiben ungültig; gespeicherte Bestätigungen bleiben an beide Profilrevisionen und die konkrete Regelversion gebunden. Sämtliche ursprünglichen positiven und negativen Testfälle bleiben erhalten und bestehen auch im erhaltenen Gesamtcheckout.

Nur ein isolierter DRAFT-Grundbetrag kann verfügbar werden. Unbestätigte Anwendbarkeit, falsche Anlagen/Kategorien, Teilmonate und Ausbildungs-Teilzeit bleiben gesperrt. completeGross bleibt false. Die App-Ausgabe und fachliche Tariffreigabe folgen separat.
