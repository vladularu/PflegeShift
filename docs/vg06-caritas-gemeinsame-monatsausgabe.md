# VG-06: gemeinsame Caritas DRAFT-Monatsausgabe

Stand: 01.10.2026. Basis: master `3683323`, Branch `codex/vg06-caritas-monthly-composition`.

## Task-Vertrag

- Ziel: Eine gemeinsame quellengebundene Ausgabe aus Monats-Tabelle, bestätigten Pflegezulagen, einer bestätigten monatlichen Schichtzulage, bestätigten Zeitzuschlägen und bestätigten Barüberstunden. Die Monatsbasis wird nur einmal gezählt.
- Nicht-Ziele: Neues Tarif- oder Anspruchsrecht, vollständiges Brutto, Jahreszahlung, automatische Dienst-/Anspruchs-/Abrechnungsmonatszuordnung, Teilstunden, stundenweise Schichtzulagen, Bereitschaft/Rufbereitschaft, Teilmonate oder Stufen-/Regelwechsel im Monat; App-Anbindung und Tarifaktivierung.
- Plattform: Reine TypeScript-Fachlogik; Expo SDK 57 (`~57.0.22`), [versionierte Referenz](https://docs.expo.dev/versions/v57.0.0/). Keine native oder visuelle Änderung; kein Gerätenachweis erforderlich.
- Dateiscope: Diese Dokumentation, `src/engine/caritas-care-draft-monthly-composition.ts` und `.test.ts`. Keine Änderungen an vorhandenen Helfern, Satzdaten oder App-Verbindungen.
- Abnahme: Gemeinsame Auswahl/Monat, genau eine Monatsbasis, getrennte Quellen und Teilbeträge; Referenzen aller sechs Regionalkommissionen, Teilzeit, 38,5/39 h, ausdrückliche Auslassungen und Sperren; fokussierte Tests, `verify:fast`, Whitespace- und Scopeprüfung.
- Git-Lieferung: Commit/Push/PR erst mit ausdrücklicher Paketfreigabe; Merge erst nach erfolgreicher CI und separater Freigabe. Keine Build-/OTA-Freigabe.

## Zusammensetzung und Grenzen

Die bestehenden Monatsfunktionen aus PR #118, #128 und #135 verwenden jeweils die gleiche Basis aus Tabelle und Pflegezulagen. Der neue Composer verwendet `calculateCaritasCareDraftMonthlyComponents` einmal als gemeinsame Basis und ergänzt aus den drei Teilresultaten ausschließlich die jeweiligen Schicht-, Zeit- und Überstundenpositionen. Er addiert keine vollständigen Teilsummen mit wiederholter Basis.

Alle Helfer erhalten denselben äußeren Paket-, Monats-, Varianten-, Regions-, Gruppen-, Stufen- und Wochenzeitkontext. Das verschachtelte Schichtobjekt steuert nur Zulagenart, bestätigten Monatsanspruch und bestätigte gleichbleibende Wochenzeit. Zusätzliche fremde Auswahlfelder darin werden nicht übernommen. Daten und bestehende Ergebnisse bleiben unverändert.

`monthlyCompositionConfirmed` muss exakt `true` sein: Die externe Prüfung bestätigt die gemeinsame Zuordnung der mitgelieferten Barpositionen zum Monat und schließt doppelte Aufnahme derselben Entgeltposition aus. Einzelne Anspruchs-, Stunden-, Überschneidungs- und Monatsbestätigungen bleiben zusätzlich erforderlich. Ein mitgelieferter ungeklärter oder ungültiger Bestandteil sperrt die gesamte gemeinsame Ausgabe; es wird keine scheinbar erfolgreiche Teilsumme zurückgegeben.

`monthlyShift: null` und ausdrücklich leere Zuschlags-/Überstundenlisten bedeuten bewusst ausgelassen. Sie ergeben keine Zusatzpositionen und sind unter `excludedComponents` weiterhin genannt. Die zugehörigen Null-Teilsummen behaupten keinen geprüften Nullanspruch. Fehlende oder falsch geformte Listen sind keine Auslassung und werden gesperrt. Erweiterung vom 01.10.2026: Bestätigte nichtständige Stunden-Schichtzulagen sind über die ausdrückliche Liste `confirmedHourlyShift` integriert, mit eigenem `knownHourlyShiftSubtotalCents`. Der gesonderte [Beleg](vg06-caritas-monat-mit-stunden-schichtzulagen.md) beschreibt Bestätigungen, Quellen und die Einschränkung für gemischte monatliche/stundenweise Formen.

Zeit-IDs werden vor der vorhandenen Duplikatprüfung an den Rändern bereinigt; Überstunden-IDs werden bereits im bestehenden Helfer bereinigt. IDs müssen innerhalb derselben Bestandteilfamilie eindeutig sein. Derselbe Dienst darf nach externer Anspruchsprüfung getrennte Nacht- und Überstundenpositionen tragen. Gleiche Stunden in unterschiedlichen Zuschlagsarten bedeuten daher nicht automatisch doppelte Vergütung derselben Position. Der Composer leitet keine zulässige Kombination aus Datum oder IDs ab.

Fachliche Grundlage bleibt die [AVR, Stand 19.03.2026](https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/AVR_Online-PDF_2026_final.pdf), Anlagen 31/32 insbesondere §§ 4, 6 und 12. Diese trennen die Arbeitsformen und Entgeltbestandteile und enthalten eigene Anspruchs-/Ausgleichsbedingungen. Dieses Paket ergänzt ausschließlich die Zusammensetzung bestehender DRAFT-Helfer.

## Feste Referenzfälle

Oktober 2025, Anlage 32, P6/Stufe 3, 39 h/Woche, bestätigte Pflegezulagen, monatliche Wechselschichtzulage, acht Nachtstunden, vier Sonntagsstunden und drei plus zwei bestätigte Barüberstunden. Die Bestätigungen sind Testvoraussetzungen, keine automatische Ableitung aus dem Kalender.

| RK / Tarifgebiet         | Tabelle + Pflegezulagen | monatliche Wechselschicht | Zeitzuschläge | Barüberstunden | bekannter Teilbetrag |
| ------------------------ | ----------------------: | ------------------------: | ------------: | -------------: | -------------------: |
| BW                       |            3.444,82 EUR |                250,00 EUR |     50,16 EUR |     125,40 EUR |     **3.870,38 EUR** |
| Bayern, Mitte, Nord, NRW |            3.434,82 EUR |                250,00 EUR |     50,16 EUR |     125,40 EUR |     **3.860,38 EUR** |
| Ost / Ost-Tarif          |            3.388,06 EUR |                250,00 EUR |     49,44 EUR |     123,65 EUR |     **3.811,15 EUR** |

Der feste Betrag nach § 12 Abs. 3 beträgt in BW 35,00 EUR und in den anderen Regionen 25,00 EUR; diese regionale Abweichung ist im [Dienstgeberbeleg vom 17.12.2024](https://caritas-dienstgeber.de/detail-news/avr-erklaert-teil-5-zulagen-als-bestandteile-der-entlohnung/), Abschnitt III, ausdrücklich beschrieben. Die Referenzsummen berücksichtigen sie.

Die einzelnen Positionen nutzen die bereits überprüften datierten regionalen DRAFT-Pakete und Quellenkennungen. Für die West-Stundenwerte bleiben die [gedruckten West-Tabellen, Juli 2025](https://s3.eu-central-1.amazonaws.com/coverpubl-lam-01/20251/SP/AVR_Tabellen-Broschur_2025_West_WebPDF.pdf), PDF-Seiten 10/11, eine unabhängige Referenz; Satz- und Rundungsherleitung bleiben in den bestehenden Paketbelegen dokumentiert.

- Gleicher BW-Fall mit 19,5 h/Woche: Monatsbasis 1.722,41 EUR + monatliche Wechselschichtzulage 125,00 EUR + unverändert bestätigte Stundenbeträge 50,16 EUR und 125,40 EUR = **2.022,97 EUR**.
- Bayern, Anlage 31, 38,5 h/Woche: Monatspositionen 3.684,82 EUR + Zeitzuschläge 50,84 EUR + Barüberstunden 127,10 EUR = **3.862,76 EUR**.

Das Ergebnis heißt `draft-known-monthly-composition`, trägt `completeGross: false`, getrennte Teilbeträge und sämtliche Quellen-/Stunden-/Positionsdetails. Weitere Schichtzulagen, Zeitzuschläge, Überstundenfälle, Jahreszahlung und lokale Bedingungen bleiben ausdrücklich ausgeschlossen. Es ist kein freigegebenes Caritas-Gehalt und nicht mit der App verbunden.
