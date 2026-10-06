# Performance nach automatischer Tabellenaktualisierung

## Auftrag und Abnahme

Der Nutzer bestaetigt die Funktion des automatischen Downloads, meldet aber etwa vier Sekunden App-Start und vier bis fuenf Sekunden fuer den Monatswechsel mit TV-H. Die Leistungsabnahme ist deshalb noch offen.

Ziel: TV-H-Monatsberechnung beschleunigen, unnoetige Berechnung in einer verdeckten Auswertung vermeiden und Nutzerdaten gleichzeitig mit dem gespeicherten Katalog laden. Die bisherigen Ansichten, Betraege, Tarifregeln und die vollstaendige Katalogpruefung bleiben erhalten. Plattform: iPhone Preview, Expo ~57.0.22; passende SDK-57-Dokumentation vor dem Eingriff gelesen.

Nicht-Ziele: neue Einstellungen, andere Tarifregeln, neue Tabellenwerte, Datenbankmigration, native Konfiguration oder Production-Lieferung.

Basis: codex/catalog-auto-refresh, PR #285, nach funktionaler iPhone-Bestaetigung. Dieser Folgebranch codex/catalog-tvh-performance wird separat gegen diesen Branch geprueft. Der freigegebene einfache App-Stand auf codex/tariff-table-app-base bleibt das gemeinsame Lieferziel; master ist kein App-Lieferstand.

Dateiscope: dieser Vertrag, TV-H-Berechnung und Profilberechnung, zugehoerige Performance-Tests, AnalysisScreen und sein Komponenten-Nachweis, Runtime-Komposition und ihr Start-Nachweis (acht Dateien).

Read-only-Befund: Die TV-H-Minutenberechnung liest Stunde, Minute und Wochentag wiederholt ueber Temporal-Zeitzonengetter. Die Auswertung berechnet auch ohne Fokus. Die Runtime-Komposition beginnt Nutzerdaten erst nach dem Katalogladen. Remote-TV-H-Tabellen werden pro Dienstabschnitt erneut aufgebaut. Messung auf diesem Rechner: kalter Monat mit 20 Nachtdiensten rund 540 ms lokal bzw. 543 ms mit Generation 6; Tabellenaufbau lokal 0,004 ms gegen remote 0,042 ms. Das sind keine iPhone-Messungen.

Akzeptanz: identische Ergebnisse fuer normale und DST-Dienste, Pausen, Feiertage, Ueberstunden und Teilzeit; neuer Resolver verwendet neue Tabellenwerte; verdeckte Auswertung berechnet nicht; beide lokalen Startvorgaenge laufen parallel, sichtbare Verbraucher warten auf den validierten Katalog. Monatsberechnung im gleichen Messszenario klar schneller. verify:fast, gezielte Regressionstests und PR-CI muessen bestehen. Preview-OTA nur bei passendem Fingerprint. Anschliessend separat App-Start und Monatsnavigation auf dem iPhone abnehmen.

Die bestehenden Freigaben fuer Git-Lieferung und interne Preview-OTA gelten. PR #285 wird nicht als vollstaendig auf dem Geraet abgenommen markiert, solange diese Regression offen ist.

## Messung und gezielte Pruefung

Gleiches Node/tsx-Szenario, jeweils ein Warmup und fuenf kalte Berechnungen mit unterschiedlichen Dienst-IDs, Generation 6, TV-H KR8/Stufe 4, 38,5 Stunden, 20 Nachtdienste von 21:00 bis 07:00 mit 60 Minuten Pause: vor der Aenderung 542,628 ms, danach 22,433 ms pro Monat, rund 96 Prozent weniger Rechenzeit. Kein Cache-Treffer und keine iPhone-Messung.

750 gezielte Unit-Tests und 49 Komponententests sind gruen. Der neue Nachweis begrenzt Temporal-Getterzugriffe im regulaeren 20-Dienste-Monat; vorhandene fachliche Tests pruefen weiterhin Sommerzeit, Winterzeit, Feiertage, Pausen, Teilzeit und Ueberstunden. Der Tabellen-Nachweis prueft Wiederverwendung, Unveraenderlichkeit sowie neue Werte und andere Tabellenperioden. Zwei Start-Nachweise pruefen beide Reihenfolgen der lokalen Ladevorgaenge und die Verbrauchersperre, bis beide Datenquellen bereit sind. Ein Fokus-Nachweis prueft den unsichtbaren Monatswechsel und die aktuelle Auswertung nach Rueckkehr.

Gesamtpruefung: verify:fast vollstaendig bestanden, 7.599 Unit-Tests und 691 Komponententests. iOS-Export erfolgreich; frischer EAS-Preview-Fingerprint und installierter Preview-Build 32 stimmen ueberein: f2f4b99ba254b82ab22b99594d5228bd8c3774f7.
