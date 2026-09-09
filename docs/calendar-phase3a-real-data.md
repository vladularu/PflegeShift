# Phase 3A – echte Daten im Kalender-Prototyp

## Vertrag und Ausgangslage

Phase 2 wurde vom Nutzer auf dem iPhone abgenommen: Januar, September, Dezember,
Jahreswechsel, Heute, Hell/Dunkel, reduzierte Bewegung und Daten nach Neustart.
Die bestätigte Preview-Gruppe ist 431c76b4-3ea6-46ed-bf6e-7272cff4b5c4.
Das belegt den isolierten Ansatz, noch nicht die produktive Gesamtintegration.

Ziel: dieselbe Animation mit echten Diensten, Terminen, Serienterminen,
Feiertagen und vorhandenen Anzeigeoptionen prüfen. Plattform: iPhone 14 Pro Max,
interne Preview / Build 31, Expo SDK 57 (~57.0.20). Versionierte Referenz:
https://docs.expo.dev/versions/v57.0.0/sdk/reanimated/.

Fortsetzung auf codex/calendar-year-crossfade / PR 60, da der abgenommene
Prototyp noch nicht auf master liegt. Freigabe umfasst Implementierung, Tests,
Commit, Push, CI und kompatible Preview-OTA. Kein Merge oder neuer nativer Build.

Dateiscope: Prototype-Screen/-Canvas und zugehörige Tests, eigener read-only
Ladehook, Eintragsdarstellung mit begrenzter Vorschau sowie diese Dokumentation.
Die Font-Policy benennt die zwei neuen kompakten Kalendertexte ausdrücklich;
vollständige Titel bleiben als Tagesbeschriftung für Screenreader verfügbar.
Nicht-Ziele: Hauptkalender, Scrollintegration, Tagesauswahl, Schreiboperationen,
Gehalts-/Tariflogik, Datenmigrationen und neue native Abhängigkeiten.

## Umsetzung und Grenzen

- Der Prototyp fragt ausschließlich listCalendarEntries für das sichtbare Jahr
  ab. Der aktive Monat des Hauptkalenders wird nicht verändert.
- Drei Jahre maximal im lokalen Cache; alle Monate eines geladenen Jahres
  verwenden denselben Datenbestand. Verlassen/Hintergrund invalidiert ihn.
  Verspätete Ergebnisse früherer Jahresanfragen werden verworfen.
- Wiederholungen werden einmal je geladener Jahresantwort mit der vorhandenen
  Engine expandiert. Filter beeinflussen nur den abgeleiteten Anzeigeindex.
- Ein noch nicht geladenes Jahr zeigt einen festen Ladehinweis, Fehler eine
  Wiederholungsmöglichkeit. Navigation bleibt bedienbar. Kalte Daten können
  asynchron eintreffen; dies wird nicht als leeres Jahr ausgegeben.
- Vorhandene Farben, Symbole und Zeit-/Daueroptionen werden gelesen. Termintitel
  bleiben von der Dienst-Kürzel-/Symboloption unabhängig. Feiertage verwenden
  Profilregion und vorhandenen Regelresolver, fehlende Regeln einen Hinweis.
- Eintragsflächen animieren mit dem vorhandenen Fortschrittswert, ohne eigene
  Ein-/Ausgangsanimation. Dichte Tage zeigen eine begrenzte Vorschau mit +N;
  die zugängliche Tagesbeschriftung enthält alle sichtbaren Eintragstitel.
- Keine Tagesbearbeitung und keine Details im Prototyp; diese folgen in 3B.

## Prüf- und Abnahmekriterien

Automatisiert: Cache-Wiederverwendung und Begrenzung, alte Serienwurzeln,
veraltete Antworten, Fehler/Retry, Hintergrund, Filter, ungekürzte Termine,
Feiertage, dichte Tagesvorschau sowie bestehende Bewegungs-/Produktionssperrtests.
Zusätzlich verify:fast, PR-CI und unveränderter iOS-Fingerprint vor OTA.

Gerät nach OTA:

1. Mehr → Kalender-Prototyp öffnen: „Echte Daten · nur Ansicht“ sichtbar.
2. Bekannten belegten Monat mit Hauptkalender vergleichen: Dienste, Zeiten,
   Termine, Serientermine (falls vorhanden), Feiertage und Anzeigeoptionen.
3. Januar, September, Dezember mit echten Daten mehrfach öffnen/zurück:
   kein Endsprung, Flackern oder Nachladen in bereits geladenen Jahren.
4. Dichten Monat sowie schnelle Jahreswechsel/Heute prüfen. Ein erstmaliger
   Jahresabruf darf einen klaren Ladehinweis haben, die Navigation nicht blockieren.
5. Hell/Dunkel, reduzierte Bewegung; nach Neustart Dienste und Gehalt unverändert.

OTA-Metadaten und Tests sind kein Beweis für Geräteperformance. Hauptkalender
erst nach dieser Abnahme in Phase 3B integrieren; keine weiteren Timing-Patches
auf Verdacht. Ein nativer Build bleibt bei geänderter Runtime separat freizugeben.
