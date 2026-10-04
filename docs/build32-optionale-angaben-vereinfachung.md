# Build 32: Optionale Angaben übersichtlicher anbieten

## Task-Vertrag

Ziel: den normalen Gehalts- und Einstellungsfluss übersichtlich halten. Ausbildungsangaben bleiben unter Mehr → Zusätzliche Angaben erreichbar. Die Schul- und Pausenliste nutzt neutrale zweizeilige Dienstkarten mit Datum und Titel sowie Uhrzeit und Status.

Plattform: iOS Preview, iPhone. Dateiscope: Einstellungsseite und Test, Schul-/Pausenliste und Test, ein aktualisierter Hilfe-Menüweg in der Arbeitszeitprüfung und dieser Beleg (sechs Dateien).

Keine Rechenregeln, Speicherung, native Konfiguration oder Kalenderdiagnose geändert. Datumsangaben für tatsächliche Nachtpausen und die Wahl bei Zeitumstellungen bleiben erhalten. Aus einem Titel wie Schule wird keine bestätigte Berufsschule abgeleitet.

Abnahme: Ausbildungsangaben zunächst eingeklappt und weiterhin erreichbar; normale Dienste ohne zusätzliche Angaben erscheinen als optional; Datum/Titel und Uhrzeit/Status getrennt lesbar; bestehende gespeicherte Pausen, Revisionen und Zeitumstellungsprüfungen bleiben erhalten. Kein UI-Merge ohne iPhone-Abnahme.

## Prüfung

30 gezielte Komponententests grün. verify:fast vollständig grün: 5750 Unit- und 837 Komponententests sowie alle enthaltenen Skriptprüfungen. Bestehende Prüfungen für Pausenspeicherung, Revisionen und Zeitumstellungen bleiben grün. Geräteevidenz der Korrektur offen.
