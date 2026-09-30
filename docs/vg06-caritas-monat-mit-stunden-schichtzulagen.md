# VG-06: bestätigte stundenweise Schichtzulagen in der Monatsausgabe

Stand: 01.10.2026. Basis: master `5c14d1e`, Branch `codex/vg06-caritas-monthly-hourly-shift`.

## Task-Vertrag

- Ziel: Quellengebundene Monatspositionen für extern bestätigte nichtständige Schicht-/Wechselschichtstunden und ihre Aufnahme in die gemeinsame DRAFT-Monatsausgabe. Monatsbasis genau einmal, eigener Stunden-Teilbetrag.
- Nicht-Ziele: Neue Anspruchsregeln, automatische Kalendereinstufung, Teilstunden, Mischfälle mit zugleich voller monatlicher Schichtzulage, Teilmonate, Jahreszahlung, Bereitschaft/Rufbereitschaft oder vollständiges Brutto; Tarif-/App-Aktivierung.
- Plattform: Reine TypeScript-Fachlogik; Expo SDK 57 (`~57.0.22`), [versionierte Dokumentation](https://docs.expo.dev/versions/v57.0.0/). Keine native oder visuelle Änderung; kein Gerätenachweis erforderlich.
- Dateiscope: Neuer Monatshelfer und Test, bestehender Composer und Test, dieser Beleg und der ergänzte Beleg zur gemeinsamen Monatsausgabe: genau sechs Dateien. Keine Satzdaten oder App-Verbindungen.
- Abnahme: Feste Referenzen aller sechs Regionalkommissionen für Anlage 31 und 32, Quelle je Position, Teilzeit ohne erneute Stundenproration, gemeinsame Basis einmal; ungültige/ungeklärte Positionen ohne Teilerfolg. Fokussierte Tests, `verify:fast`, Scope-/Whitespaceprüfung und vollständige PR-CI.
- Git-Lieferung: Dauerhafte Nutzerfreigabe vom 01.10.2026 für Commit, Push, PR und Merge nach grüner CI im laufenden Gesamtauftrag. Keine Build-/OTA-Freigabe.

## Quelle und Bestätigungsgrenzen

Die [AVR, Stand 19.03.2026](https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/AVR_Online-PDF_2026_final.pdf), Anlage 31 § 6 Abs. 5/6 (PDF-Seite 247) und Anlage 32 § 6 Abs. 5/6 (PDF-Seite 283), unterscheiden monatliche und stundenweise Zulagen anhand der bestätigten Arbeitsform. Für nichtständige Wechselschicht enthält Anlage 31 1,49 EUR/h, Anlage 32 1,47 EUR/h; nichtständige Schichtarbeit 0,59 EUR/h. Die vorhandenen datierten regionalen DRAFT-Pakete berücksichtigen diese Unterschiede und bestimmen weiterhin jeden Satz und dessen Gültigkeit.

`calculateCaritasCareDraftMonthlyWithHourlyShift` übernimmt die vorhandene Monatsbasis und den bestehenden persönlichen Stundenhelfer aus PR #119. Jede Zeile braucht eine nach Randbereinigung eindeutige `lineId` über beide stundenweisen Zulagenarten, ein gültiges Leistungsdatum im ausgewählten Monat und einen dazu gültigen regionalen Satz. Nichtständiger Anspruch und volle zahlbare Stunden müssen extern bestätigt sein.

`monthlyAllocationConfirmed: true` bestätigt die externe Monatszuordnung ohne vorherige Aufnahme. `categoryAndOverlapConfirmed: true` bestätigt die gewählte Zulagenart und nicht überschneidende Zulagenstunden. Unterschiedliche IDs beweisen keine getrennten Stunden. Zusätzlich dürfen die Schichtzulagenzeilen zusammen je zugeordnetem Datum höchstens 24 Stunden darstellen; das ist eine Plausibilitätsgrenze, keine Prüfung zulässiger Arbeitszeit.

Die Funktion ermittelt weder Arbeitsform noch Anspruch, Überlappung oder Auszahlung aus einem Dienstplan. Teilstunden und automatische Rundung werden nicht ergänzt. Jede Position behält Datum, Stunden, Zulagenart, Cent-Stundensatz, Satzkennung und Quellenkennungen. Stundenbeträge werden nicht nochmals mit der persönlichen Teilzeitquote gekürzt; die Monatsbasis bleibt wie bisher anteilig.

## Integration und eingeschränkter Vertrag

Der Composer erwartet zusätzlich die ausdrückliche Liste `confirmedHourlyShift`. `[]` bedeutet ausgelassen, keinen geprüften Nullanspruch. Fehlende/falsch geformte Listen oder ungeklärte Zeilen sperren die gesamte Ausgabe. Stundenpositionen werden aus dem Teilresultat angehängt; dessen wiederholte Monatsbasis wird verworfen.

`knownHourlyShiftSubtotalCents` hält Stundenbeträge getrennt von `knownMonthlyShiftSubtotalCents`. Die äußere Auswahl bestimmt Paket, Monat, Anlage und Region; zusätzliche Auswahlfelder in Zeilen können sie nicht ersetzen. Eingaben bleiben unverändert.

Der DRAFT-Composer unterstützt entweder eine bestätigte volle monatliche Schichtzulage oder bestätigte stundenweise Schichtzulagen. Werden beide Formen geliefert, lautet das Ergebnis `MIXED_SHIFT_FORMS_UNSUPPORTED`. Das ist eine Grenze dieses Datenvertrags, keine Aussage über sämtliche tarifrechtlichen Mischfälle oder ein zusätzliches gesetzliches Kombinationsverbot. Mischfälle benötigen einen gesonderten quellengeprüften Vertrag.

IDs sind innerhalb der Schichtzulagenfamilie eindeutig. Derselbe extern geprüfte Dienst kann getrennte Schichtzulagen-, Nacht-/Sonntags- und Überstundenpositionen tragen; einzelne Bestätigungen und `monthlyCompositionConfirmed` bleiben zwingend. Aus gleichen IDs folgt weder Anspruch noch ein automatisches Kombinationsverbot.

## Feste Referenzen

Oktober 2025, Anlage 32, P6/Stufe 3, 39 h/Woche, bestätigte Pflegezulagen. Acht bestätigte nichtständige Wechselschichtstunden am 02.10. und vier Schichtstunden am 05.10.: 8 × 1,47 EUR + 4 × 0,59 EUR = **14,12 EUR**. Für den Composer zusätzlich acht Nachtstunden, vier Sonntagsstunden und drei plus zwei bestätigte Barüberstunden, wie im Beleg zu PR #136.

| RK / Tarifgebiet         | Tabelle + Pflegezulagen | Stunden-Schichtzulagen | mit Zeitzuschlägen und Barüberstunden |
| ------------------------ | ----------------------: | ---------------------: | ------------------------------------: |
| BW                       |            3.444,82 EUR |              14,12 EUR |                      **3.634,50 EUR** |
| Bayern, Mitte, Nord, NRW |            3.434,82 EUR |              14,12 EUR |                      **3.624,50 EUR** |
| Ost / Ost-Tarif          |            3.388,06 EUR |              14,12 EUR |                      **3.575,27 EUR** |

- Alle sechs Regionalkommissionen zusätzlich mit Anlage 31: gleiche Stunden ergeben **14,28 EUR** (8 × 1,49 EUR + 4 × 0,59 EUR). Im Ost-Tarif unterscheidet sich auch die Tabellenbasis: P6/Stufe 3 Anlage 31 3.240,91 EUR, Anlage 32 3.225,10 EUR; [RK-Ost-Tabellen 2025](https://www.caritas.de/cms/contents/caritas.de/medien/dokumente/arbeitsrechtliche-ko/beschluesse/beschluesse-regional/2023-07-05-langfassu1/2023-07-05_langfassungeckpunktebeschlussrkostbeschlussdez.2019_werte_2025_gez.pdf?d=a&f=pdf), PDF-Seiten 8 und 16. Der Anlage-31-Monatshelfer ergibt deshalb dort 3.403,87 EUR Basis + 14,28 EUR = **3.418,15 EUR**.
- BW bei 19,5 h/Woche: Basis 1.722,41 EUR + Stunden-Schichtzulagen 14,12 EUR + Zeitzuschläge 50,16 EUR + Barüberstunden 125,40 EUR = **1.912,09 EUR**.
- Bayern, Anlage 31, 38,5 h/Woche: Basis 3.434,82 EUR + Stunden-Schichtzulagen 14,28 EUR + Zeitzuschläge 50,84 EUR + Barüberstunden 127,10 EUR = **3.627,04 EUR**.

Alle Beträge sind unvollständige Referenz-Teilbeträge mit externen Anspruchsvoraussetzungen. `completeGross: false`, DRAFT/UNSUPPORTED und Quellen bleiben erhalten. Andere Schicht-/Zeit-/Überstundenfälle, Jahreszahlung und lokale Bedingungen bleiben ausgeschlossen. Kein freigegebenes Caritas-Gehalt, keine App-Anbindung oder OTA.

## Prüfstand

48 fokussierte Tests (21 Monatshelfer, 27 Composer) und der vollständige erify:fast-Lauf sind grün: 1.015 Unit-Tests, 472 Komponententests sowie die weiteren Katalog-, Operator-, Audit- und Runtime-Prüfungen. Dateiscope und Whitespace sind geprüft. PR-CI ist der nächste Pflichtschritt.
