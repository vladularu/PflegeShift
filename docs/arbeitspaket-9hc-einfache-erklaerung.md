# 9H-C – einfache Erklärung aus eingetragenen Diensten

> Statusabgleich 12.09.2026: Paket abgenommen und über [PR #70](https://github.com/vladularu/PflegeShift/pull/70) integriert. Aktueller Status und verbleibende Prüfpunkte stehen in der [zentralen Roadmap](roadmap.md). Die folgenden Freigaben, offenen Abnahmen und Implementierungsbeschreibungen dokumentieren den damaligen Arbeitsstand; sie sind keine neuen Aufträge und kein Beleg für den heutigen Code. Fachliche Grenzen bleiben maßgeblich, soweit spätere Pakete sie nicht ausdrücklich ersetzen.

## Ziel und Scope

Alltagsbegleiter für Schichtarbeitende, keine exakte Lohnabrechnung. Vorhandene Schichtzulagen-Ansicht um einen geschlossenen Bereich „Einschätzung erklären“ ergänzen. Keine neue Nachweisverwaltung, Pflichtbestätigung oder Eingabemaske. Gespeicherte Arbeitsplatzangaben bleiben erhalten. Gehalt und manuelle Monatswerte bleiben unverändert.

Dateiscope: neuer Kalenderadapter/Erklärungsbaustein, optionale Karte, jeweilige Tests, bestehende Tarifansicht und dieses Dokument. Expo ~57.0.20; SDK-Referenz: https://docs.expo.dev/versions/v57.0.0/sdk/updates/. Zielgerät: iPhone, Hell/Dunkel. Freigegeben ist die lokale Umsetzung und Prüfung; Commit/Push/PR/OTA erst nach ausdrücklicher Freigabe für 9H-C. Keine nativen Änderungen, kein neuer Build geplant.

## Vereinfachungen und Grenzen

- Verwendet eingetragene Dienste als Planungsgrundlage, nicht als Bestätigung tatsächlich geleisteter Arbeit oder eines vollständigen Dienstplans.
- Erkennt Zeiten unabhängig vom Namen/Symbol der Dienstvorlage. Berücksichtigt Pausendauer mittels möglicher Unter-/Obergrenze der Nachtminuten; keine erfundene Pausenlage. Normale lange Nachtdienste sind damit ohne Rückfrage einzuordnen. Nur pausenabhängige Grenzfälle bleiben unsicher.
- Fristberechnung aus dem abgenommenen B1-Kern (`tvoedKNightDeadline`), Quelle: https://www.bundesarbeitsgericht.de/entscheidung/6-azr-191-17/. Ein Beispiel aus Anker und zwei folgenden Nächten wird automatisch angezeigt; dies ist keine Monatszuteilung und kein vollständiger Zulagennachweis.
- B2 wird ausdrücklich nicht mit erfundenen Eröffnungsbeständen, Vollständigkeitsbestätigungen oder Abwesenheitsbelegen gefüttert. Automatische Monatsanspruchsentscheidung bleibt offen. Die vorhandene Gehaltslogik wird nicht ersetzt.
- Urlaub/Krankheit führt in dieser Erklärung nicht zu einer Zulagenstreichung; keine automatische Fortzahlungsentscheidung. Mehrdeutige Sommer-/Winterzeit-Grenzen oder überlappende Dienste bleiben offen.
- Berechnung erst beim Aufklappen, auf einen Zeitraum um den Monat begrenzt. Nur ein Beispiel, keine lange Liste; kein Aufruf aus Kalender/Gehalts-/Jahresberechnung. Aktualisierung bei Eintrags-, Monats- oder Zeitzonenänderung; bei neuem Monat geschlossen durch React-Key.
- Nur BT-K und nur bei verfügbarer bestehender Tarifprüfung. Andere Tarifbereiche und fehlende Tarifstände werden nicht umgedeutet.

## Prüfung und Geräteabnahme

Unit-Tests für übliche Nachtdienste, Pausengrenzen, Monats-/Jahres-/Sommerzeitwechsel, Urlaub/Krankheit, Änderungen/Löschungen, Überschneidungen und unveränderliche Eingaben. Komponententests für geschlossenen Zustand ohne Berechnung, Öffnen/Schließen, aktuelle Daten und lokale Fehlerbehandlung. `npm.cmd run verify:fast` und bestehende Pay-Tests müssen grün bleiben.

Nach freigegebener kompatibler Preview-OTA: Auswertung → Schichtzulage → „Einschätzung erklären“ öffnen; Dienstdaten vergleichen; schließen; Monat/Dienst ändern und erneut öffnen; Hell/Dunkel prüfen; nach Neustart Dienste und Gehalt unverändert. Erst Gerätenachweis bestätigt Darstellung und flüssige Bedienung.

## Lokales Prüfergebnis

Nach ausdrücklicher Freigabe wurde ausschließlich für den Zwölf-Monats-Integrationstest das Zeitlimit auf 20 Sekunden gesetzt und begründet. Alle Interaktionen und Assertions bleiben unverändert; kein App-Code und kein globales Testlimit wurden dafür angepasst. Der Fehler war zuvor auch in einer unveränderten Kopie von Master `2287849` reproduzierbar. `npm.cmd run verify:fast` bestand anschließend vollständig (Exit 0), einschließlich 716 Fachtests und 328 Komponententests. Die temporäre Master-Vergleichskopie wurde aus dem Projekt-Suchbereich verschoben. Der folgende Absatz dokumentiert den vorherigen Diagnosezustand, nicht den aktuellen Gate-Status.

Regelprüfung, Typecheck, Lint, Formatprüfung und 716 Fachtests bestanden. Im regulären Gesamtcheck bestanden 327 von 328 Komponententests. Der unveränderte Kalender-Test „opens every previously unvisited month in a bounded five-month window“ überschritt wiederholt sein 5-Sekunden-Limit. Ein separater diagnostischer Lauf mit `--testTimeout=20000` bestand alle neun Tests dieser Datei; der betroffene Test benötigte 7285 ms. Keine Testlimits oder Kalenderdateien geändert. Der reguläre Gesamtcheck ist damit weiterhin nicht vollständig grün; vor Veröffentlichung klären. Die neuen Fach-, Karten- und Integrationstests bestanden. Keine Geräteabnahme, kein Commit, Push oder OTA erfolgt.
