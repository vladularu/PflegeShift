# 9F-B: Erstberechnung und Aktualisierung der Jahresauswertung

## Task-Vertrag

- Ziel: Rechenarbeit beim kalten Erstaufruf reduzieren; aktuelle Basisdaten vor dem vollständigen Bericht zeigen; nach Änderungen nur unveränderte Teilberechnungen wiederverwenden.
- Nicht-Ziele: neue Fachregeln, Kalender-UI, Datenbankmigration, persistierte Ergebnisstände, native Integration oder größere Jahres-Ergebniscaches.
- Plattform: bestehende iOS-Preview, iPhone 14 Pro Max. Kein neuer nativer Build geplant.
- Scope: Jahresbericht, dessen Hook und Ansicht, Sonntags-/Feiertagsruhe-Rechenpfad, zugehörige Tests, Benchmark und diese Dokumentation (maximal 15 Dateien).
- Durchführung auf dem bestehenden, noch nicht abgenommenen Performance-Branch; keine Vermischung mit der unabhängigen Änderung an `.gitignore`.
- Freigabe: lokale Umsetzung und Prüfung. Commit, Push, Merge und OTA nicht durch die Gesprächsfreigabe abgedeckt.

## Akzeptanz

1. Dienste, Verteilung und sicher berechenbare Zeiten erscheinen vor Abschluss der Jahresprüfung. Offene Gehalts-/Prüfergebnisse erscheinen weder als Nullbetrag noch als erfolgreiche Prüfung.
2. Wechsel oder Änderungen während einer Berechnung dürfen keinen alten Bericht einblenden.
3. Teilberechnungen berücksichtigen vollständige Vor-/Nachlauf- und Jahresfenster; keine pauschale Beschränkung auf den bearbeiteten Monat. Profil, Regelstand und Stichtag werden berücksichtigt.
4. Vollständige Ergebnisse bleiben gegenüber dem vorherigen Stand identisch, einschließlich Sommerzeit und Jahresgrenzen.
5. Getrennte Messung von CPU-Erstberechnung, erster Basisanzeige und Aktualisierung nach einer Änderung. Lokale Messungen ersetzen keine Geräteabnahme.
6. Vor Veröffentlichung: verify:fast, fokussierte Tests, Ergebnisvergleich. Danach Geräteprüfung nach Neustart, neuem Dienst und Jahreswechsel; keine weitere OTA allein wegen eines schnellen Cache-Treffers.

## Lokales Ergebnis

- Gemeinsame Vorbereitung: begrenzter, datenunabhängiger Cache für Tagesgrenzen je Zeitzone; schwach referenzierte Kalendertage je Arbeitsintervall. Monatliche Ruheprüfungen verwenden numerische Zeitpunkte statt wiederholter Temporal-Vergleiche in inneren Schleifen. Temporal bestimmt weiterhin die Tagesgrenzen einschließlich Sommerzeit.
- Teilberechnungen: Stunden, Gehalt und Prüfung getrennt nach vollständigem Inhalt ihrer jeweiligen Eingabefenster. Maximal 36 Monate je Regelresolver, nur im Arbeitsspeicher. Neue Dienste können wegen jährlicher Prüfkriterien weiterhin mehrere oder alle Monatsprüfungen betreffen; keine falsche Zusage einer Ein-Monats-Neuberechnung.
- Anzeige: eigener Zwischenstand für aktuelle Dienste, Verteilung und erfasste Zeiten. Ausstehende Gehalts-/Prüfergebnisse bleiben verborgen und ausdrücklich gekennzeichnet. Die Berechnung gibt nach dem Zwischenstand den Scheduler frei. Veraltete Zwischenstände werden anhand vollständigem Eingabeschlüssel und Regelresolver ausgeschlossen.
- Keine Regel-, Datenbank-, Kalender- oder native Änderung. Kein Commit, Push oder OTA in diesem Paketstand.

### Reproduzierbare CPU-Messung

`node --require tsx/cjs scripts/benchmark-annual-report.cjs --compare b882699`

Jeder der acht Fälle läuft in einem eigenen frischen Node-Prozess. Vergleich mit dem vorherigen Commit; vollständige Ergebnisse einschließlich Map-Inhalten identisch. Rohdaten: `artifacts/9fb-cold-benchmark.json` (lokales Artefakt).

| Synthetische Belegung                                      | Vorher vollständig | Jetzt vollständig | Basisdaten jetzt bereit |
| ---------------------------------------------------------- | -----------------: | ----------------: | ----------------------: |
| 2026, fünf Monate / insgesamt 140 Einträge über zwei Jahre |             888 ms |            554 ms |                   29 ms |
| 2027, zwei Monate / dieselben Einträge                     |             365 ms |            245 ms |                   18 ms |
| 2026, 720 Einträge über drei Jahre                         |            1862 ms |           1055 ms |                   51 ms |
| 2027, 720 Einträge über drei Jahre                         |            1401 ms |            718 ms |                   55 ms |
| 2026, 3285 Einträge über drei Jahre                        |            6316 ms |           3900 ms |                  199 ms |
| 2027, 3285 Einträge über drei Jahre                        |            4403 ms |           2345 ms |                  205 ms |

Keine Geräte-Latenzen: Datenbank, React-Rendering, Scheduler-Wartezeit und iOS/Hermes sind nicht enthalten. Einzelmessungen schwanken. Auch der große Stressfall ist ausdrücklich nicht als ruckelfrei freigegeben: dort bleibt ein einzelner Basisschritt bis etwa 205 ms und die vollständige Berechnung dauert Sekunden.

Nach einem zusätzlichen Dienst im nächsten Monat:

`node --require tsx/cjs scripts/benchmark-annual-report.cjs --case sparse/2026 --edit`

Analog für 2027. Median aus fünf Wiederholungen mit wechselnder Messreihenfolge und wiederhergestelltem Vor-Änderungsstand im Teilcache: 2026 etwa 232 ms statt 262 ms vollständiger warmer Neuberechnung; 2027 etwa 93 ms statt 101 ms. Alle geänderten Ergebnisse stimmen mit einer vollständigen Neuberechnung überein. Der zusätzliche Gewinn der Teilwiederverwendung ist kleiner als der Gewinn der beschleunigten Erstberechnung.

### Tests und nächstes Gate

- `verify:fast` erfolgreich: 611 Unit- und 316 Komponententests sowie Regel-/Release-Werkzeugtests. Anschließend zusätzlicher Sommerzeit-Test erfolgreich (19 Tests in dessen Suite, nun insgesamt 612 Unit-Tests).
- Abgedeckt: gleiche Revision bei geändertem Inhalt, neue Datenbankobjekte, neue/gelöschte Dienste, Vorjahresgrenze, Profil-/Zeitzonen-/Regeländerung, Stichtag, veraltete und abgebrochene Zwischenstände, fehlende Regeln und keine vorzeitigen Gehalts-/Prüfaussagen.
- Geräteabnahme offen: nach vollständigem App-Neustart Jahresauswertung öffnen; anschließend einen Dienst in einem weiteren Monat ergänzen und Jahresauswertung erneut öffnen. Basisanzeige, Bedienbarkeit, finale Summen und Prüfungen kontrollieren. Zusätzlich zwischen 2024–2027 wechseln und zurückkehren.
- Nächster Freigabeschritt: Commit; danach Push/CI und eine ausdrücklich freigegebene gemeinsame Preview-OTA. Noch keine Behauptung einer behobenen iPhone-Ladezeit.
