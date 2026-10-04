# Build 32: Gehaltsübersicht vereinfachen

## Task-Vertrag

Ziel: den gewohnten Gehaltsüberblick mit Betrag und Zusammensetzung erhalten und zusätzliche Eingaben gesammelt einklappbar anbieten. Ein übernommener Stand ohne bestätigten Beginn erhält einen direkten Bestätigungseinstieg statt wiederholter Nullbeträge und unverständlicher Fehlermeldungen.

Plattform: iOS Preview, iPhone. Dateiscope: Monatskarte, Gehaltsseite, ihre beiden Komponententestdateien, die bestehende Regelabdeckungsprüfung und dieser Beleg (sechs Dateien). Keine Änderung der Rechenregeln, gespeicherten Beträge oder Tarif-Freigaben.

Abnahme: kein Nullgehalt aus fehlenden Angaben; gültige Teilbeträge weiterhin korrekt sichtbar; genau ein klarer Bestätigungseinstieg; Zusatzangaben nur nach gezieltem Öffnen; Route behält den angezeigten Monat; noch kein UI-Merge ohne iPhone-Abnahme.

## Prüfung

Drei neue Regressionstests zunächst rot (3 fehlgeschlagen, 39 bestehende grün). Nach der Korrektur: 76 gezielte Komponententests grün. verify:fast vollständig grün: 5750 Unit- und 837 Komponententests sowie alle enthaltenen Skriptprüfungen. Die bestehenden Regelabdeckungstests behalten die Prüfung, dass bekannte Teilbeträge kein Gesamtbrutto darstellen. Geräteevidenz der Korrektur: offen.
