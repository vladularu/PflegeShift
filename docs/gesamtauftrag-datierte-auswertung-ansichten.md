# Datierte Vergütung in Monats- und Jahresauswertung

## Task-Vertrag

Ziel: Die vollständigen ursprünglichen Monats-/Jahreskarten an die geprüfte gemeinsame Abfrage anbinden; bekannte Teilbeträge und offene Geldbestandteile nachvollziehbar zeigen.
Dateiscope: Dreizehn Code-/Testdateien und dieser Beleg (14 Dateien).
Plattform: Expo-SDK57-App, iPhone zuerst. Native Konfiguration bleibt unverändert.
Abnahme: Vollständige ursprüngliche Karten-/Jahres-/Unabhängigkeitsfälle, bestehende Auswertungsregressionen, verify:fast, sieben grüne PR-CI-Prüfungen und separate echte iPhone-Abnahme vor dem UI-Merge.
Nicht-Ziele: Neue visuelle Richtung, Tarif-Fachfreigabe oder DRAFT-Aktivierung. Das vollständige Gehaltsdetail und seine neuen Eingaberouten folgen als eigene Pakete; die gesamte App-Auslieferung erfolgt erst nach kohärenter Integration und Geräteabnahme.

## Ergebnisgrenzen

Monats- und Jahreskarten lesen ausschließlich datierte Vergütung, behalten exakte Null und fehlende Beträge getrennt und zeigen unvollständige Summen als bekannte Teilbeträge. Keine alte manuelle oder Tarif-Gesamtsumme dient als Ersatz für fehlende bestätigte Angaben.
Die Monats-Arbeitszeitstrecke führt keine alte Gehaltsberechnung mehr aus. Alle tatsächlichen Aufrufer werden angepasst; Tarifausfälle können Arbeitszeit und Ist-Stunden weiterhin unabhängig lassen. Verborgene Gehaltskarten berechnen nicht.
Die Jahreskarten und bestehenden Detailrouten verwenden dieselben Centpositionen und Monatslinks. Die vollständigen ursprünglichen Nachweise für Wiederherstellung, Änderung, Widerruf, Zahlungsjahr, ausgeblendete Karten, Schriftgröße und Theme bleiben erhalten.
Aktuelle Kartenstile, Arbeitszeit-/Prüfungsansichten, Scheduling und die bestehende separate Ausbildungsstrecke werden nicht durch ältere gemeinsame Dateien ersetzt.

## Anpassung an r3

Die Monatskarten-Referenz prüft im November ohne Jahressonderzahlungsangaben ausdrücklich null und ANNUAL_INPUT_MISSING; eine bestätigte echte Nullzahlung bleibt exakt null Cent. Die Jahresdarstellungsfixture bestätigt eine Nullzahlung ausdrücklich, wenn ein vollständiges Jahresbeispiel gewünscht ist. Dies sind ausschließlich datierte Testangaben; Produktionslogik und aktuelle r3-Vollständigkeitsguards bleiben erhalten. Alle übrigen ursprünglichen Fälle bleiben vollständig erhalten.

Eine bestätigte tatsächliche Zahlung, deren Auszahlungsmonat ausdrücklich ins Folgejahr verschoben ist, liefert im ursprünglichen Monat korrekt 0 Cent und im bestätigten neuen Monat den Betrag. Nach Widerruf bleiben im ursprünglichen November wieder fehlende Angaben (null). Auch diese ursprüngliche Fallunterscheidung bleibt erhalten.

Im Januar 2027 steht die tatsächliche Zahlung für Anspruchsjahr2026 genau einmal mit 54321 Cent im bekannten Teilbetrag. Die aktuelle r3-Engine erkennt zusätzlich die für Anspruchsjahr2027 noch fehlende Tarifgrundlage. Die Jahreskomponente bleibt deshalb insgesamt null statt eines fälschlich vollständigen Betrags. Der ursprüngliche positive 54321-Cent-Nachweis bleibt als separate Position und Zwischensumme erhalten; ANNUAL_RULE_MISSING wird zusätzlich geprüft.
