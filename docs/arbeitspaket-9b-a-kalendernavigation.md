# Arbeitspaket 9B-A – Jahresgrenzen und Heute-Navigation

> Statusabgleich 12.09.2026: Paket abgenommen und über [PR #59](https://github.com/vladularu/PflegeShift/pull/59) integriert. Aktueller Status und verbleibende Prüfpunkte stehen in der [zentralen Roadmap](roadmap.md). Die folgenden Freigaben, offenen Abnahmen und Implementierungsbeschreibungen dokumentieren den damaligen Arbeitsstand; sie sind keine neuen Aufträge und kein Beleg für den heutigen Code. Fachliche Grenzen bleiben maßgeblich, soweit spätere Pakete sie nicht ausdrücklich ersetzen.

Ziel: Der Monatskalender bleibt beim Jahreswechsel bedienbar und der Rücksprung
zum aktuellen Monat beendet sich zuverlässig, auch aus entfernten Jahren.
Zielgerät: iPhone 14 Pro Max, iOS 26.6.1, installierter Preview-Build 31.

## Umsetzung

- Der Provider lädt bei einem Jahreswechsel nur Kalendereinträge nach. Profil,
  Vorlagen, Tarifentscheidungen und Arbeitszeitdaten werden beim Start bzw.
  ausdrücklichen Neuladen weiterhin gemeinsam geladen.
- Das begrenzte Datenfenster bleibt Vorjahr bis Folgejahr. Der Kalender darf
  seinen bestehenden Pager während einer Abfrage behalten, wenn das sichtbare
  Monatsraster einschließlich angrenzender Tage bereits vollständig geladen ist.
  Der Bereitschaftsstatus für Auswertungen wartet weiterhin auf das neue Fenster.
- Veraltete Abfrageergebnisse werden verworfen. Zwischenzeitliche Änderungen,
  neue Einträge und Löschungen werden beim Übernehmen der Abfrage berücksichtigt.
- Manuelles Wischen veröffentlicht den globalen Monat erst am Ende. Ein
  Heute-Auftrag veröffentlicht einmal das Ziel, um dessen Daten zu laden;
  seine maximal vier sichtbaren Zwischenmonate bleiben lokal.
- Der Heute-Auftrag wartet auf einen verfügbaren Pager, ignoriert Zwischenereignisse
  und setzt bei fehlendem Scroll-Ende nach 1,5 Sekunden die Zielposition direkt.
  Timer werden bei Abschluss, Fokusverlust und einem neuen Auftrag aufgeräumt.

Dateiscope: Provider und Ladehilfen in `src/application`, Kalenderscreen und
Heute-Hook in `src/features/calendar`, zugehörige Tests und dieses Dokument.
Keine Änderungen an Datenbankschema, Tarifberechnung, Farben oder nativer Konfiguration.
Jahresanzeige und Crossfade bleiben Arbeitspaket 9B-B.

## Prüfung und Verteilung

Automatisierte Regressionen prüfen beide Jahresrichtungen, das Beibehalten des
Pagers, vollständige Datenabdeckung, konkurrierende Ladevorgänge und Schreibvorgänge,
Fehler mit Wiederholung, weit entfernte Jahre, Fokuswechsel, mehrfaches Tippen und
reduzierte Bewegung. Das erforderliche Gesamtgate ist `npm.cmd run verify:fast`.

Der lokale iOS-Preview-Runtime-Abgleich ergibt
`eac302484061dfb3fa63e2a74b8618ff6000861c`, passend zur für Build 31 dokumentierten
Runtime. Eine Preview-OTA ist vorgesehen; vor Veröffentlichung müssen der
freigegebene Commit und die installierte Build-Runtime erneut abgeglichen werden.
Es wurde weder ein neuer EAS-Build gestartet noch eine OTA veröffentlicht.

## Geräteabnahme nach Preview-OTA

1. Daten vorhanden; Dezember nach Januar und zurück: kein vollständiges Ladebild.
2. Aus einem vergangenen und einem zukünftigen Jahr auf den bereits aktiven
   Kalender-Tab tippen: aktueller Monat und heutiger Tag werden zuverlässig erreicht.
3. Dies aus der Jahresübersicht wiederholen; anschließend schnell zweimal auf
   Kalender tippen und danach normal weiterwischen.
4. Während des Rücksprungs kurz den Tab verlassen und zurückkehren: keine gesperrte
   Bedienung. Mit aktivierter iOS-Einstellung „Bewegung reduzieren“ erneut prüfen.
5. Dienste und Termine an der Jahresgrenze kontrollieren. App neu starten und
   Dienste sowie Gehalt prüfen.

Geräteabnahme und reale Reaktionszeiten stehen noch aus. Lokale Tests ersetzen
keine Messung auf dem iPhone. Commit, Push und OTA benötigen ihre jeweilige Freigabe.
