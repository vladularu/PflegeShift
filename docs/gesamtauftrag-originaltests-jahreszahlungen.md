# Originaltests: Sonderzahlungen und Jahresansprüche

Stand: 2026-10-04, Expo SDK 57 (~57.0.22).

## Ziel, Scope und Abnahme

Acht Dateien: sieben vollständig gelesene Originaltests und dieser Beleg. Alle alten Fälle werden auf aktuellem master erhalten: eigenes Weihnachtsgeld, echte Auszahlung ersetzt Schätzung, Jahreswechsel, bestätigte Null gegenüber Widerruf/Unbekannt, tarifliche Anspruchsdeckung und rationale Mehrfachverteilung, Quellen-/Versionskonflikte sowie eigenständige TV-L-/TVA-L-Regeln. Kein Produktionscode und keine UI-Änderung.

TV-L-§20-Gruppenbänder, Referenz-/Späteintritts-/Elternteilzeit-/Altfall-Austrittsgrenzen und TVA-L-§16-Novemberbasis/Übernahme bleiben eigenständig geprüft; Caritas-DRAFT-Schätzungen bleiben aus tatsächlichen Auszahlungsmonaten ausgeschlossen.

## Quellen und Grenzen

Die bereits geprüften Primärquellen und bestehenden Originalbelege zu VG-04/VG-05 gelten weiter. Unveränderte Originaldateien separat gesichert. Aus der Übernahme folgt keine fachliche DRAFT-Aktivierung. Keine native Änderung, OTA, Production oder TestFlight.

## Pflichtcheck

Sieben ursprüngliche Testdateien gezielt; verify:fast auf aktuellem master-Elternstand. Genaue sieben PR-CI-Prüfungen vor Merge.

## Ergebnis und Fixture-Abgleich

Alle 134 ursprünglichen Fälle bestehen. Fünf Testdateien sind bytegleich mit dem Original; zwei erhalten ausdrücklich aktuelle und historische Pakete: Der TVöD-Referenztest nutzt die freigegebene r3 statt der überholten r2. Die Prüfung eines Katalogs ohne Jahreszahlung verwendet weiter ein explizites älteres Paket. Die Ausbildungsfixture behält reale Monatsbeträge und beide Ausbildungsgruppen, ergänzt ausschließlich testweise Jahresregeln mit passenden Quellen und vollständiger Gruppendeckung. Sie bleibt DRAFT und ist im gebündelten Katalog nicht auswählbar. Kein Originalfall entfällt.

Auf dem mit PR #249 abgeglichenen master: verify:fast vollständig grün mit 5.479 Unit- und 542 Komponententests, alle weiteren Skriptprüfungen ohne Fehler. Die Originaldateien bleiben unverändert separat versioniert.
