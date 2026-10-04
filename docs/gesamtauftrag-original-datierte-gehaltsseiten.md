# Originalauftrag: datierte Gehalts- und Zuschlagsseiten

Stand: 2026-10-04. Expo SDK 57 (~57.0.22), iPhone zuerst.

## Ziel und Dateiscope

Fünf Dateien: ursprüngliche Gehalts-/Zuschlagsseite, ursprünglicher Gehaltsabnahmetest, gezielter Abgleich des bestehenden Regelabdeckungstests und dieser Beleg. Die Seiten verwenden den datierten Vergütungsverlauf samt tatsächlichen Bestätigungen und Dienstbindungen. Bereits gelieferte Positions- und Berechnungsgrundlagen-Komponenten sind bytegleich zum Original.

## Abnahmekriterien

Alle Originalfälle bleiben erhalten. Ein gespeichertes P5-/P6-Profil ist gegenüber einem abweichenden alten Profil maßgeblich. Fehlende Bestandteile werden getrennt erklärt und nur als bekannter Teilbetrag gezeigt; ein vollständiges Brutto setzt vollständige Grundlage voraus. Monatswechsel, Tarifwechsel, Laden, Restore und Schreibkonflikte dürfen keine alten Beträge oder Bestätigungen übernehmen. Gehaltsseite und Monatslinks bleiben synchron. Schätzung, Anspruchsangaben und tatsächliche Jahreszahlung bleiben getrennt.

## Erhaltene Darstellung und Klarstellungen

Die aktuelle Hero-Karte mit Wallet-Symbol, Abständen, Textskalierung und Zahlenstil bleibt erhalten. Die vorhandenen Detailkarten erklären die datierte Zusammensetzung. Der ursprüngliche Quellenbeleg r2 wird ausschließlich im Liefer-Test auf die aktuelle r3-Version angepasst. Die Zuschlagsfußnote beschreibt fehlende oder geschätzte Pausenlagen je Berechnungsgrundlage; sie behauptet keine pauschale Schätzung für Tarife mit gesperrter unbekannter Pausenlage.

## Liefergrenze

Dieser PR folgt auf die gemeinsam geprüften Formularrouten. Die Tarif-/Ausbildungslinks werden über diese Seiten erreichbar. Einstellungen, Profilzusammenfassung und weitere Ausbildungsanzeigen folgen getrennt. DRAFT-Teilergebnisse bleiben DRAFT; Merge erst nach abschließender kohärenter iPhone-Abnahme. Keine einzelne OTA oder Production-/TestFlight-Veröffentlichung.

## Prüfung

Alle Original-Gehaltsfälle, bestehende Regelabdeckung, Monatsnavigation sowie verify:fast werden vor Lieferung ausgeführt und im Lieferabgleich dokumentiert.

## Tatsächliche Ergebnisse

57 gezielte Fälle sind grün; verify:fast bestanden mit 5260 Unit- und 804 Komponententests. Der Originaltest behält alle Fälle; nur ein r2-Quellenliteral wurde mit konkret nachgewiesener r3-Ausgabe abgeglichen. Der bestehende Regelabdeckungstest behält seine 34 Fälle und prüft die konkreten datierten Fehlermeldungen sowie den berechneten manuellen Grundbetrag als Teilbetrag. Ein direkter Link ohne eigene Zuschlagspositionen zeigt keine scheinbar berechneten Null-Euro-Zuschläge. Die Originalseiten bleiben im ursprünglichen Checkout vollständig erhalten.
