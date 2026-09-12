# 9H-D – gemeinsame automatische BT-K-Schätzung

> Statusabgleich 12.09.2026: Paket abgenommen und über [PR #71](https://github.com/vladularu/PflegeShift/pull/71) integriert. Aktueller Status und verbleibende Prüfpunkte stehen in der [zentralen Roadmap](roadmap.md). Die folgenden Freigaben, offenen Abnahmen und Implementierungsbeschreibungen dokumentieren den damaligen Arbeitsstand; sie sind keine neuen Aufträge und kein Beleg für den heutigen Code. Fachliche Grenzen bleiben maßgeblich, soweit spätere Pakete sie nicht ausdrücklich ersetzen.

## Vertrag

Ziel: Eine gemeinsame Monatsgrundlage für Nachtdienst-Erklärung und automatische Zulagenschätzung, ohne neue Pflichtangaben. Lokal umsetzen und prüfen ist freigegeben; kein Commit, Push, PR, Build oder OTA. Expo ~57.0.20; https://docs.expo.dev/versions/v57.0.0/. Zielgerät iPhone, später gemeinsame kompatible Preview-OTA und Geräteabnahme.

Scope: Kalender-Nachtadapter und Monatsassessment im Engine-Layer, bestehendes pay/pattern, optionale Ergebnisnotiz, Erklärung/Tarifansicht/Gehaltskarte und zugehörige Tests. Keine Änderungen an Kalendergestaltung, Datenbank, nativen Funktionen, Tarifbeträgen oder B1/B2-Nachweiskernen. Maximal 15 Dateien.

## Schätzmodell und Grenzen

- B1-Zeitmonatsfrist wiederverwenden (kein pauschaler 28-Tage-Abstand). BAG 6 AZR 191/17, Rn. 16–25: https://www.bundesarbeitsgericht.de/entscheidung/6-azr-191-17/.
- Automatisches Monatsbeispiel: Anker aus Vormonat oder aktuellem Monat und zwei zeitlich folgende, sicher qualifizierte Nächte mit Beginn im aktuellen Monat. Nur Folgenächte dieses Monats verwenden; dadurch keine Doppelvergabe derselben Folgenacht über mehrere Monate. Anker darf wiederverwendet werden. Dies ist eine vorsichtige Schätzkonvention, keine vollständige rechtliche Monatszuordnung. Monatsübergreifende Sonderzuordnungen werden nicht erfunden.
- Gleiche reale Zeiten und Pausengrenzen in Erklärung und Schätzung. Mehrdeutige Zeiten, fehlende Belege oder Abwesenheiten werden als vorläufig erklärt, nicht als Anspruchsablehnung. Bei fehlendem eindeutigen Monatsbeispiel bleibt die bisherige Muster-Schätzung als gekennzeichnete Näherung erhalten, sofern im Monat gearbeitet wurde.
- Bei reinen Urlaubs-/Krankmonaten darf die bisherige dauerhafte Monatszulage anhand des eingetragenen Dienstmusters im bestehenden Rückblick vorläufig fortgeschätzt werden; keine erfundenen Nachtdienste und keine automatische rechtliche Fortzahlungsbestätigung. Voraussetzung: gespeicherte dauerhafte Zuordnung und erkennbares vorheriges Muster. Kein Übertrag bei ganz leeren Monaten, fehlender dauerhafter Zuordnung oder stundenweiser Zulage. Grundlage/Grenze: BAG 10 AZR 58/09, Rn. 13–23, https://www.bundesarbeitsgericht.de/entscheidung/10-azr-58-09/.
- Manuelle Monatsfestlegung bleibt vorrangig, einschließlich NONE. Andere Tarifbereiche und manuelle Gesamtgehälter unverändert. B2 wird nicht mit behaupteter Vollständigkeit oder erfundenen Nachweisen aufgerufen.
- Keine persistente Ergebnisübernahme: aus Einträgen und Einstellungen neu ableiten. Begrenzter Cache einzelner Zeitberechnungen darf Änderungen nicht verdecken; Jahresauswertung muss dieselbe Monatsberechnung verwenden und bei Eintragsänderungen aktualisieren.

## Abnahme

Unit-/Integrationstests: Monats-/Jahresgrenzen, Fristtag, zwei Folgenächte statt beliebiger Altbelege, keine Doppelvergabe, Grenzpausen/DST, Änderungen/Löschungen, Abwesenheit, leere Monate, manuelle Werte und andere Tarifbereiche. Monats-/Jahresparität und Cache-Invalidierung prüfen. CPU-Vergleich mit Master als Regressionstest; keine Aussage zur iPhone-Flüssigkeit aus CPU-Messung allein. `verify:fast` muss bestehen.

Nach später freigegebener OTA: Erklärung und Schätzung stimmen überein; vorläufige Werte erkennbar; manuelle Festlegung bleibt; Dienständerung und Neustart aktualisieren korrekt; Hell/Dunkel lesbar; Monats-/Jahreswechsel ohne neue Verzögerung.

## Lokales Ergebnis

- Branch `codex/tariff-shared-estimate`, Basis `b0c20637ac126e799c092ad6bc9db8cda85c526d`. 15 aufgabenbezogene Dateien; unabhängige `.gitignore` unverändert.
- `npm.cmd run verify:fast`: erfolgreich. 729 Unit-/Strukturtests und 330 Komponententests; zusätzliche Regel-, Runtime- und Sicherheitsschutztests ebenfalls erfolgreich. React-Testing-Skill: neue Fachfälle zuerst rot, danach grün; Anzeige und manuelle Priorität durch Komponententests abgesichert.
- Monats-/Jahresparität einschließlich geändertem Dienst und bestehendem Jahrescache geprüft. Leere Monate, Abwesenheit ohne vorheriges Muster und temporäre Zuordnung erzeugen keine automatische Fortzahlung.
- CPU-Diagnose `artifacts/9hd-pay-benchmark.cjs --case sparse/2026`: drei abwechselnde frische Prozesse pro Stand, ohne parallelen Testlauf. Baseline ersetzt ausschließlich pay/pattern durch den geprüften Basiscommit; keine Checkoutänderung. Ergebnis-Digest im Benchmark identisch. Gesamtmedian vorher 1240,8 ms, danach 1301,3 ms (rund +4,9 %); Median des längsten Berechnungsschritts 85,5 ms gegenüber 107,5 ms. Zusätzliche Monatsbelege sind somit nicht kostenlos; daraus wird ausdrücklich keine bestätigte iPhone-Flüssigkeit abgeleitet. Geräteabnahme bleibt erforderlich.
- Keine Veröffentlichung, kein Commit, Push, PR, Build oder OTA in diesem lokalen Schritt.
