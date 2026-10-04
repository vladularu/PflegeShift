# Ursprüngliche Überstunden- und Abwesenheitsformulare

## Task-Vertrag

Ziel: Die vollständigen ursprünglichen Auswahlseiten, Formulare und Komponentenfälle für bestätigte Überstundentage und bezahlte Abwesenheiten liefern. Scope: sieben Dateien, sechs vollständige Original-Code-/Testdateien und dieser Beleg. Plattform: iPhone zuerst, Expo SDK57, ausschließlich vorhandene lokale Provider/UI ohne native Änderungen. Technische Abnahme: alle ursprünglichen Komponentenfälle, bestehende Regressionen, verify:fast und sieben grüne PR-CI-Prüfungen. Sichtbare Abnahme: zusammenhängende Gehaltsintegration und reale iPhone-Abnahme vor UI-Merge. Noch keine neuen App-Routen montiert.

## Bestätigungs- und Schreibgrenzen

Ungültige/fehlende Monatslinks öffnen keinen Schreibfluss. Laden, Lesefehler, tatsächlich leere Monate und fehlendes Arbeitsprofil sind getrennt. Eingaben bleiben nach Kontextänderung, Restore und Schreibkonflikt erhalten; ein geänderter Dienst, eine Zeitzone oder fremde Bestätigung sperrt den alten Schreibentwurf. Parallele Klicks erzeugen nur einen Schreibauftrag. Ein erfolgreicher Commit mit fehlgeschlagenem Reload bleibt als gespeichert erkennbar. Interne Fehlermeldungen werden nicht angezeigt; verspätete Abschlüsse nach Unmount erzeugen kein Erfolgsfeedback.

Nullbestätigung und Widerruf bleiben verschieden. Die Abwesenheitszeit verändert weder Kalender noch Soll-/Zeitsaldo. Überstunden werden nur auf tatsächliche Tage verteilt; ein positiver Zeitsaldo ist keine Auszahlung. Das Datum eines Nachtdienstes bindet beide Seiten des Monatswechsels. Tastatur schließen und erneutes Laden sind sichtbar; Hell/Dunkel- und größere Schriftfälle gehören zur technischen Prüfung.

Alle sechs ursprünglichen Dateien werden vollständig erhalten. Spätere strengere Regeln für unbekannte eigene Gehaltsbestandteile werden bei notwendigen Fixture-Abgleichen beibehalten. Geräteabnahme, tatsächliche Routenanbindung und gemeinsame Preview-Veröffentlichung bleiben offen. Keine Tarif-DRAFT-Aktivierung.
