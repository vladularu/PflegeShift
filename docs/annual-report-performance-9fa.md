# 9F-A – Jahresauswertung

## Reparatur nach fehlgeschlagener Geräteabnahme

9F-A ist noch nicht abgenommen. Die erste OTA beschleunigt den wiederholten Jahreswechsel auf dem Gerät nicht ausreichend. Reproduziert: Daten-Neuladen erzeugt inhaltsgleiche, aber referenzverschiedene Einträge; der bisherige Cache-Test erfasste diesen Pfad nicht.

Lokaler Reparatur-Scope: Report-Cache mit kanonischem Inhaltsvergleich, Wiederverwendung der Nachtzeit-Vorbereitung zwischen Monatsprüfungen, echte Auswahl-/Ladeabgleichsregressionen und Vergleichsmessung. Keine Provider-Änderung, keine neuen Fachregeln, kein Überspringen leerer Monate und keine native Änderung. Commit/Push/OTA erfolgen nicht in diesem lokalen Prüfschritt. Abnahme: keine erneute Fachberechnung bei unverändertem 2026→2027→2026 nach Daten-Neuladen; Änderungen einschließlich Vorlagenwerte und Restore-Inhalte verwerfen alte Ergebnisse.

### Lokaler Reparaturnachweis

- Regression zuerst rot: Nach Auswahl und `reconcileCalendarRange` mit inhaltsgleichen neuen Objekten lieferte die Rückkehr nach 2026 keinen Cache-Treffer. Nach Reparatur gleicher Report und kein neuer Idle-/Rechendurchlauf.
- Vollständige kanonische JSON-Eingaben statt Objektidentität; Schlüssel nur im Speicher, maximal drei Jahresberichte. Geänderte Feldreihenfolge ist unschädlich; Vorlagenwerte und Restore-Zeiten bei gleicher ID/Revision invalidieren. Regeln bleiben zusätzlich über den Resolver getrennt; Tageswechsel invalidiert. Keine Schlüsselerzeugung bei deaktivierter Jahresberechnung.
- Nachtzeit-Anteile werden je schwach referenziertem Intervall wiederverwendet. Andere Zeitpunkte/Zeitzonen oder Nachtfenster verwerfen die Vorbereitung; Qualifikationsschwellen werden weiterhin neu ausgewertet. Tests für beide Zeitumstellungen 2026.
- Vergleich: `node --require tsx/cjs scripts/benchmark-annual-report.cjs --compare f0d2055`. Beide geänderten Engine-Module werden gegen ihren Git-Stand geprüft; der Reportvergleich umfasst jetzt auch Map-Inhalte. Acht Ergebnisvergleiche identisch.

| Synthetische Dienste / Jahr                | Erste OTA CPU | Reparatur CPU |
| ------------------------------------------ | ------------- | ------------- |
| 140 (fünf bzw. zwei belegte Monate) / 2026 | 1450 ms       | 930 ms        |
| 140 (fünf bzw. zwei belegte Monate) / 2027 | 507 ms        | 298 ms        |
| 720 / 2026                                 | 2651 ms       | 1792 ms       |
| 720 / 2027                                 | 2384 ms       | 1396 ms       |
| 3285 / 2026                                | 7739 ms       | 6284 ms       |
| 3285 / 2027                                | 6200 ms       | 4188 ms       |

Einzelmessungen Windows/Node, nicht iPhone. Datenbank-Wartezeit und Rendering sind nicht enthalten. Lange Einzelschritte im Stressfall bleiben bis etwa 247 ms: keine Zusage, dass jeder Erstaufruf bereits flüssig ist. Der automatische Rücksprungtest prüft die realen Auswahl-/Abgleichsfunktionen mit simuliertem Datenbankergebnis, nicht SQLite auf dem Gerät. Provider-Ladezeit bleibt für 9F-B separat zu messen.

Lokale Reparatur-Gates: `verify:fast` grün (609 Unit-/314 Komponententests plus Werkzeugtests). Anschließend erweiterter Rücksprungtest mit wechselndem Vor-/Folgejahresbereich und Restore erneut grün, Typecheck erneut grün. Keine Veröffentlichung; Geräteabnahme offen.

## Vertrag

- Ziel: gemessene CPU-Kosten der Jahresauswertung reduzieren, Rechenarbeit zeitlich bündeln und abgeschlossene Jahresberichte begrenzt wiederverwenden.
- Nicht-Ziele: neue Fachregeln, Änderungen an Gehalt/Prüfergebnissen, Datenmigrationen, gemeinsamer Provider-Umbau (9F-B), Kalenderlayout oder native Integration.
- Plattform: iOS Preview, vorhandener Build 31; Geräteabnahme auf iPhone 14 Pro Max.
- Scope: Jahresreport-Hook und dessen Tests, Jahres-Ladezustand/Header, rechnerisch äquivalente Vorbereitung der Ersatzruhetagsprüfung, Benchmark und Dokumentation; maximal 15 Dateien.
- Akzeptanz: identische vollständige Reports vor/nach Optimierung; bestehende Fachtests grün; veraltete Anfragen werden verworfen; Cache bei geänderten Eingaben ungültig und begrenzt; Jahresnavigation bleibt beim Laden erreichbar.
- Freigabe: Umsetzung, lokale Prüfung, Commit, Push, PR, CI und Preview-OTA. Merge erst nach Geräteabnahme.

## Ausgangsmessung

Windows / Node 24, synthetische 720 Dienste über drei Jahre (je 20 pro Monat), Jahresbericht 2026. Reine Generator-CPU ohne Datenbank, React, Idle-Wartezeiten oder iPhone-Rendering: 6.48 s kalt / 6.13 s warm; 1,136 Schritte. Arbeitszeitprüfungen: 5.97 / 6.03 s. Profiling lokal unter `artifacts/annual-before.cpuprofile`.

Diese Zeiten sind keine iPhone-Messung. 9F-B wird erst anhand der verbleibenden Kosten und Geräteabnahme abgegrenzt.

## Vergleich mit unveränderter Engine aus master

Reproduzierbar: `node --require tsx/cjs scripts/benchmark-annual-report.cjs --compare 59ccf1d`

Das Skript lädt die alte Ersatzruhetags-Implementierung ausschließlich im separaten Benchmark-Prozess aus Git, ohne Checkout-Dateien zu überschreiben. SHA-256-Vergleich der vollständigen serialisierten Reports: **alle sechs Ergebnisse identisch**. Die Eingaben sind synthetisch, keine Nutzerdaten.

| Dienste über drei Jahre / Berichtsjahr | Vorher CPU | Nachher CPU | Längster Schritt vorher / nachher |
| -------------------------------------- | ---------- | ----------- | --------------------------------- |
| 0 / 2026                               | 83 ms      | 81 ms       | 15 / 13 ms                        |
| 0 / 2027                               | 53 ms      | 59 ms       | 6 / 7 ms                          |
| 720 / 2026                             | 5684 ms    | 2713 ms     | 119 / 59 ms                       |
| 720 / 2027                             | 4503 ms    | 2427 ms     | 76 / 56 ms                        |
| 3285 / 2026                            | 8210 ms    | 8348 ms     | 252 / 250 ms                      |
| 3285 / 2027                            | 7717 ms    | 6066 ms     | 255 / 248 ms                      |

Einzelmessungen mit Laufzeitstreuung, keine harten Timing-Assertions in CI. Der dichte Stressplan ist nicht pauschal gelöst. Die 4-ms-Zeitscheiben des Hooks begrenzen das Bündeln, unterbrechen aber keinen einzelnen synchronen Generator-Schritt.

## Umsetzung und Grenzen

- Ersatzruhetagsprüfung: Zeitpunkte einmal vorbereiten; Auswahl unverändert nach Qualität, kalendarischem Abstand und Datum. Tagesgrenzen weiterhin mit Temporal/Zeitumstellung.
- Jahres-Hook: höchstens 32 Schritte beziehungsweise 4 ms pro Idle-Durchlauf; Abbruch bei Eingabewechsel/Verlassen.
- Ursprungsstand f0d2055: höchstens drei abgeschlossene Jahre pro eingebautem Hook, aber Vergleich über Eingabeobjekte. Diese unzureichende Invalidierung wird durch die oben dokumentierte Reparatur ersetzt. Keine persistente Speicherung.
- Während Provider-Ladevorgängen keine neue Jahresberechnung. Navigation bleibt im Jahres-Ladezustand erreichbar.
- 9F-B: verbleibende lange Einzelschritte und gemeinsame Daten-Neuladungen zuerst gezielt messen; keine Behauptung, dass 9F-A den gesamten Dezember/Januar-Wechsel löst.

## Geräteabnahme nach OTA

1. Auswertung → Jahr: 2026 laden; Stunden, Gehalt und Prüfung mit bisherigem Stand vergleichen.
2. 2027 öffnen, zurück zu 2026; Navigation auch während der Berechnung benutzen.
3. Einen Dienst ändern, Jahresauswertung erneut öffnen: aktualisierte Stunden; danach Änderung bei Bedarf zurücknehmen.
4. App neu starten: Dienste und Gehalt vorhanden und korrekt.

Erst nach dieser Abnahme Merge. Keine neue native Build-Anforderung; OTA-Runtime vor Veröffentlichung prüfen.

## Lokale Gates des Ursprungsstands

- `npm.cmd run verify:fast`: grün, 606 Unit- und 313 Komponententests sowie Regel-/Release-Werkzeugtests.
- Interner iOS-Fingerprint: `eac302484061dfb3fa63e2a74b8618ff6000861c`, unverändert gegenüber Build 31.
- Unabhängige `.gitignore`-Änderung bleibt unverändert und wird nicht committed.
