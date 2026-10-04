# Gehalt: tatsächliche Originalansichten wiederherstellen

## Task-Vertrag

Ziel: die Darstellung und normalen Bedienwege der drei früheren Build-/TestFlight-Referenzen exakt aus den vorhandenen Originalkomponenten übernehmen. Der Nutzer hat die erste Korrektur anhand neuer iPhone-Screenshots ausdrücklich abgelehnt. Diese Bilder belegen, dass die Preview-OTA angekommen ist, aber die Zielansichten nicht erfüllt hat.

Zielplattform: internes iOS Preview, reales iPhone, Build 32 mit kompatibler Runtime. Erlaubter Scope: ein zusammenhängender Gehaltsfluss, höchstens 15 UI-, Präsentations-, Test- und Belegdateien. Nicht-Ziele: neue Theme-Entscheidungen, Tarif-/Rechtsänderungen, Datenmigration, native Integration oder DRAFT-Aktivierung. Die bestehende dauerhafte Freigabe umfasst die geprüften Git- und Preview-Lieferschritte.

## Konkrete Abnahme

1. Gehaltsformular: Gehaltsgrundlage und die bisherigen Tarif-Felder, Speichern und derselbe Zurück-Footer wie früher. Keine zusätzlichen Wochenstunden-, Historien- oder Abbrechen-Buttons, keine leere Karte. Der normale Weg verlangt kein getipptes Datum. Gespeicherte Stände und ihre Gültigkeit bleiben erhalten; gezielte historische Bearbeitung bleibt als gesonderter Expertenmodus erhalten.
2. Monatsübersicht: ursprünglicher CardHeader, ursprüngliche ValueRow-Abstände und Typografie, ursprüngliche Reihenfolge und TVöD-Zeilenbezeichnungen. Kein Aufklappen einzelner Zeilen in der Zusammensetzung. TVöD-Zulage/Pflegezulage führen zu ihren bisherigen Infoansichten, die Schichtzulage zu ihrer bisherigen Prüfung. Keine Zusatzangaben im Standardbild.
3. Zuschlagskarte: ursprüngliche kompakte Aufteilung mit Zuschlagsart, Betrag, HH:MM h, Prozent und Stundenbasis. Keine eingeblendeten IDs, Revisionen, Gültigkeitszeiträume oder Quellenlinks in diesem normalen Schritt. Reale Centbeträge, Teilbeträge und Zuordnungen werden unverändert übernommen; technische Quellen bleiben gezielt aufrufbar.
4. Hell-/Dunkel-Palette bleibt die gewählte App-Palette. Referenzbeträge werden nicht festgeschrieben. Jahressonderzahlung ergänzt die bestehende Zusammensetzung im passenden Monat.
5. Vor Auslieferung: gezielte Regressionen, verify:fast, Release-/Runtime-Prüfung und vollständige PR-CI. Nach Auslieferung: erneute Geräteabnahme; bis dahin kein UI-Merge.

## Quellbeleg

Die ursprüngliche Gehaltsdarstellung aus dem Elterncommit von b6c9d6e wird direkt für ValueRow, CardHeader/CardFooterLine und Reihenfolge verwendet. Die bestehende PremiumBreakdownList liefert die ursprüngliche kurze Zuschlagszeile. Aktuelle datierte Rechner und Quellendaten bleiben erhalten.

## Status

Umsetzung abgeschlossen. Die fünf zuerst roten Abweichungsprüfungen sind behoben. Die ursprüngliche ValueRow stammt aus e21c4c53a787c5c80886f989413efcb4eb1439c2 (Elterncommit von b6c9d6e). CardHeader, CardFooterLine und SheetBackFooter werden wieder direkt verwendet. Die tatsächliche Berufsbereich-Auswahl wird erst mit Speichern übernommen; unveränderte Angaben lösen keinen zusätzlichen Profil-Schreibvorgang aus.

116 gezielte Regressionen in fünf UI-Suiten sind grün. Der vollständige verify:fast-Lauf ist mit 5.750 Vitest-Tests, 846 Komponententests und sämtlichen Script-Prüfungen erfolgreich. Typen, Lint, Format und git diff --check sind grün. Release-Konfiguration konsistent. Der Graft-Kontext wurde nach der Codeänderung aktualisiert.

iOS Preview bleibt mit der installierten Build-32-Runtime f2f4b99ba254b82ab22b99594d5228bd8c3774f7 kompatibel. Die Korrektur enthält genau 15 Dateien und wird auf codex/salary-original-views als Folge-PR zu #260 geliefert.

Offen sind PR-CI, die danach freigegebene Preview-OTA und die erneute reale iPhone-Abnahme. Die bisherigen iPhone-Bilder lehnen die erste Korrektur ab; sie sind kein Abnahmenachweis für diese Fassung. Bis zur bestätigten Abnahme bleibt der UI-Merge zurückgestellt.

Datierte Detailquellen bleiben mit Gedrückthalten einer Gehalts-/Zuschlagszeile separat erreichbar. Die normalen TVöD-Infoaktionen führen weiterhin zu den bisherigen Erklärungen beziehungsweise der Schichtzulagenprüfung. Gleichnamige Zulagen anderer Tarife öffnen ihre eigenen Daten. Aktuelle Ergebnisse werden nicht auf die Referenzbeträge umgeschrieben.
