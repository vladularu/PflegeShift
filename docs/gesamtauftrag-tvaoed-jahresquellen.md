# TVAöD-Jahresregelrevisionen und ursprüngliche VKA-Referenzen

Stand: 2026-10-04. Sechs-Dateien-Teilpaket des erhaltenen Gesamtauftrags.

## Ziel und Scope

Zwei unveränderte ursprüngliche TVAöD-DRAFT-Revisionen mit datierten §-14-Jahresregeln, der vollständige ursprüngliche VKA-Jahresreferenztest, zwei unveränderte historische Testdatensätze und dieser Beleg. Reine Daten und plattformunabhängige Referenzen; bestehender Vertrag 11 und der gelieferte Ausbildungs-Monatskern werden verwendet.

Die beiden TVöD-Vergleichsdatensätze sind bytegleiche Kopien des erhaltenen r2-/r3-DRAFT-Arbeitsstands ausschließlich unter src/testing/fixtures. Nur die beiden Testimportpfade werden angepasst. Die bereits REVIEWED veröffentlichte r3-Katalogdatei bleibt unverändert; der historische Vertrag 8 wird nicht als verteilbarer Kandidat aufgenommen oder ausführbar gemacht.

## Primärquelle und unabhängige Abnahme

[Offizieller VKA TVAöD-Pflege, Stand 01.07.2025](https://vka.de/wp-content/uploads/2026/04/TVAOED_BT-Pflege_AETV_18_Lesefassung_Stand_01_07_2025.pdf), Seiten 7–8, § 14 Abs. 1–4 und Niederschriftserklärung. Aktuell abgerufen und SHA-256 477a4a2127a848de4d973b45fb893520a113e170d054440d4fcee5555146a48b bestätigt. VKA-Ausbildung verwendet 90 Prozent des bestätigten Durchschnitts August bis Oktober; späterer Beginn, Zwölftelkürzung samt ausdrücklichen Ausnahmen, Novemberauszahlung und unmittelbare Übernahme benötigen bestätigte persönliche Angaben. Historische Jahresraten werden nicht auf spätere Jahre verlängert.

Die ursprünglichen Referenzen prüfen bestätigte Durchschnittsbeträge, Bereiche, Regionen, Kategorien, Teilzeit ohne doppelte Kürzung, Jahresgrenzen, Tabellenwechsel mit beiden Quellen, späten Eintritt, Übernahme, unbekannte Angaben und einmalige tatsächliche Auszahlung. Pflichtcheck verify:fast und sieben grüne CI-Prüfungen vor Merge.

## Grenzen

Beide neuen Revisionen bleiben DRAFT ohne Fachprüferangabe. Kein veröffentlichter Katalog, keine App-Aktivierung oder OTA. Die Eingabemasken und echte Geräteabnahme bleiben eigene offene Schritte; VG/AZ werden durch dieses Paket nicht insgesamt abgeschlossen.
