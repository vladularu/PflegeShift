# Ursprüngliche Monatsabfrage, Teilbetragsdarstellung und Jahresnachweise

## Task-Vertrag

Ziel: Die erhaltene gemeinsame Monatsabfrage sowie die Erklärung und Darstellung von Geldpositionen liefern und die vollständigen ursprünglichen Jahres-/Hook-Nachweise erhalten.
Dateiscope: Sieben vollständige ursprüngliche neue Dateien, die gezielt ergänzte bestehende Jahresabfrage und ihr bestehender Regressionstest sowie dieser Beleg (zehn Dateien).
Plattform: Gemeinsame Expo-SDK57-App-Abfrage und iPhone-Darstellung; keine native Änderung.
Abnahme: Originalidentität, vollständige Hook-/Jahres-/Darstellungstests, verify:fast und sieben grüne PR-CI-Prüfungen. Die sichtbare Anbindung der Gehaltsansicht folgt als eigenes begrenztes UI-Paket mit echter Geräteabnahme.
Nicht-Ziele: Neue UI-Richtung, Tarifaktivierung, Fachfreigabe, Build und OTA.

## Nachgewiesene Datenstrecke

Die Monatsabfrage übernimmt die vorhandenen versionierten Vergütungsdaten, gespeicherten Anlage-A-/SuE-Bestätigungen, Überstunden, Jahreszahlungen und bestätigten Pausen. Laden, Fehler, fehlende Tarifhistorie oder fehlendes Profil werden nicht als fertige Berechnung ausgegeben. Dienst-Lookback und in andere Monate zugeordnete Zahlungen bleiben erhalten.
Die vollständigen ursprünglichen Jahresfälle prüfen positive Anlage-A-Zeitzuschläge, identische Snapshot-Revision bei geänderten Angaben, monatsübergreifende Überstundenzuordnung, Löschung, Tarif-/Profilwechsel, Teilabdeckung sowie Cache-Invalidierung. Positive Geldfälle werden nicht durch schwächere Verfügbarkeitsprüfungen ersetzt.
Die Hook-Tests prüfen Monats- und Jahresreaktionen auf TV-L-/TVA-L-Fakten, Wiederherstellung, Widerruf und Laden/Fehler. Der vorhandene lokal begrenzte Original-Timeout bleibt unverändert.

## Darstellung und Grenzen

Ganzzahlige Centbeträge, exakte Null und fehlende Werte bleiben verschieden. Bekannte Teilbeträge werden als Zwischensumme erklärt; ein vollständiges Brutto erscheint nur bei vollständigem Ergebnis. Aufklappbare Positionen zeigen Bemessung, Zeiträume, tatsächliche oder geschätzte Pausen, Regelstände und Quellen.
Die vorhandenen Provider-, Domänen- und Datumshilfen sind bereits originalidentisch; sie werden nicht erneut kopiert. Gemeinsame aktuelle Engine-/Annual-Dateien und unabhängige Checkout-Arbeit bleiben erhalten.
DRAFT-Tarife bleiben außerhalb des ausführbaren Katalogs. Dieses Paket montiert noch keine neue Route und bestätigt keine Geräteabnahme.

## Anpassung an den aktuellen stärkeren Regelstand

Die allgemeine TVöD-P-Testreferenz verwendet inzwischen 2026-05-r3 statt des entfernten r2. Die ursprüngliche Jahresreferenz hatte acht vollständig unterstützte Monate erwartet. r3 erkennt im November zusätzlich die fehlende Jahressonderzahlungsbestätigung und lässt diesen Monat bewusst unvollständig. Der Test bleibt vollständig erhalten; genau dieser Fall wird verstärkt: acht vollständige Grundbetragsmonate, sieben vollständig berechnete Gesamtmonate und im November ausdrücklich ANNUAL_INPUT_MISSING mit null statt 0 Euro. Die Produktionsregel und die aktuelle gemeinsame Fixture werden nicht abgeschwächt.

## Jahres-Hook-Anbindung

Die vorhandene Jahresabfrage hatte die gespeicherten Vergütungsdaten noch nicht an die bereits vorhandene Jahresengine übergeben. Ergänzt werden die vollständige ursprüngliche Vergütungsübergabe und ihr inhaltlicher Cache-Schlüssel. Bestehende Scheduling-, Abbruch-, Kernbericht- und Jahrwechselregressionen bleiben erhalten; der bestehende Test erhält ausschließlich die ursprünglichen Provider-Mocks. Die sieben neuen Code-/Testdateien bleiben bis auf den ausdrücklich verstärkten r3-Jahresfall originalidentisch. Die separate Ausbildungs-Compliance wird in ihrem Fachpaket ergänzt.
