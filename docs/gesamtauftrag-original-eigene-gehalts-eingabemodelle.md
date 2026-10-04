# Vollständige ursprüngliche eigene Gehalts-Eingabemodelle

## Task-Vertrag

Ziel: Die vollständigen ursprünglichen Eingabemodelle und Tests für eigene tatsächliche Jahreszahlungen, bezahlte Abwesenheiten und tagesgenaue Überstundenaufteilung liefern. Scope: sieben Dateien, sechs vollständige Originaldateien plus dieser Beleg. Plattform: plattformunabhängige Expo-SDK57-TypeScript-Logik. Abnahme: sämtliche ursprünglichen Modelldatenfälle, verify:fast und sieben grüne CI-Prüfungen. Keine neuen sichtbaren Eingabemasken, Tarifaktivierung oder Veröffentlichung.

## Bestätigungsgrenzen

Jahreszahlung: bestätigtes Anspruchsjahr, stabile Position, tatsächlicher Centbetrag und tatsächlicher Auszahlungsmonat; auch jahresübergreifende Auszahlung und explizite Null. Ein undatiertes Profil erzeugt keine historische Konfiguration. Aufgehobene Bestätigungen bleiben ausdrücklich bearbeitbar.

Abwesenheiten: bestätigte bezahlte Minuten je aktivem Eintrag, ohne geratene acht Stunden. Dienstrevision, Datum, Zeitstempel und Zeitzone bleiben gebunden. Null und Widerruf sind verschieden.

Überstunden: nur bestätigte auszahlbare Minuten, eindeutige Kalendertage, exakte Summe und tatsächlich verfügbare Nettozeit. Ein Dienst über Mitternacht erhält keine angenommene Aufteilung; Zeitumstellung nutzt die verstrichene Dauer. Beide Revisionsverträge bleiben erhalten.

Alle sechs Code-/Testdateien werden vollständig gegen den erhaltenen Originalcheckout abgeglichen. Die anschließenden sichtbaren Formulare und Routen benötigen eine zusammenhängende Integration und echte iPhone-Abnahme.
