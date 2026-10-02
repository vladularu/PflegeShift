# VG-06: Caritas-Späteintritt, gemeinsame Jahresprüfung (DRAFT)

## Task-Vertrag

- Ziel: Die vorhandene gruppenfreie Späteintrittsbasis mit Jahresanspruch und Zwölftelung verbinden; widersprüchliche Angaben zum ersten vollen Monat abweisen.
- Plattform: reine TypeScript-Fachlogik, Expo ~57.0.22; versionierte Dokumentation SDK 57.
- Dateiscope: genau drei neue Dateien: `src/engine/caritas-annual-payment-late-entry-assessment.ts`, zugehöriger Test und dieser Beleg.
- Nicht-Ziele: Ersatzgruppenstichtag oder Bemessungssatz festlegen, Jahresbetrag berechnen, Dezember-Eintritt ohne vollen Monat im Anspruchsjahr, früher Austritt, besondere Elternzeit-Teilzeitbasis, vollständiges Brutto/Netto, App-Anbindung, Katalogaktivierung oder OTA.
- Abnahme: feste 2025/2026-Referenzfälle über alle sechs Regionen und Ost-Teilgebiete, tatsächlicher Dienstverlauf, Anspruch am 1. Dezember, Zwölftelung, widersprüchliche Monatsdaten und ausdrückliche Betragsperre; fokussierte Tests, `verify:fast` und sieben grüne PR-Prüfungen.
- Git-Lieferung: bestehende ausdrückliche Freigabe für Commit, Push, PR und Merge nach erfolgreicher CI. Kein Gerätebeleg erforderlich für dieses Fachlogikpaket.

## Geprüfte Originale

Die bereits vorhandenen Originaldateien wurden in diesem Arbeitsschritt erneut mit SHA-256 geprüft; die einschlägigen Abschnitte wurden vollständig gelesen.

| Original                                                                                                            | SHA-256                                                            | Abschnitt                                    |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------- |
| [AVR Stand 01.07.2025](https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/AVR-PDF_Version_2025.pdf)      | `a4f8dea02fb84ba4f203a753bd362d82dec8ad8953f3befed99ac65e65ec2637` | Anlagen 31/32 § 16, Seiten 264–265 / 301–302 |
| [AVR Stand 19.03.2026](https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/AVR_Online-PDF_2026_final.pdf) | `cb6fc32981eb120d5c05e68d6563725436001409e9bc728bc47d52d08d705aa7` | Anlagen 31/32 § 16, Seiten 255–256 / 291–292 |

Für Eintritt nach dem 30. September ersetzt der erste volle Kalendermonat den regulären Bemessungszeitraum. Die gelesenen Normabschnitte nennen den 1. September für die maßgebliche Entgeltgruppe, legen aber keinen Ersatzgruppenstichtag für diesen Späteintritt ausdrücklich fest. Diese Umsetzung trifft deshalb keine Gruppen- oder Satzentscheidung. Fachklärung und unabhängige Prüfung bleiben erforderlich; spätere AVR-2027-Regeln und andere Tarifwerke werden nicht auf 2025/2026 übertragen.

## Abgleich und Ergebnis

- Ein gemeinsamer Eingabevertrag verwendet dasselbe Paket, Jahr, Gebiet, dieselbe Anlage und denselben Beschäftigungsbeginn für beide vorhandenen Prüfungen.
- Die vorhandene Basis bestimmt den ersten vollen Monat; die Jahresprüfung verlangt ein bestätigtes einzelnes Dienstverhältnis, zwölf bestätigte Monatsangaben und Beschäftigung am 1. Dezember.
- Der Referenzmonat muss in den Jahresdaten Entgelt-/Fortzahlungsanspruch für alle tatsächlichen Kalendertage und die Ausnahme `NONE` aufweisen. Ein bestätigter voller Betrag bei weniger Tagen oder ausschließlich Krankengeldzuschuss-/anderen Ausnahmetagen liefert `REFERENCE_MONTH_FACTS_MISMATCH`.
- Die vorhandene Jahresprüfung weist Anspruchstage außerhalb des tatsächlichen Dienstverhältnisses ab. Das schließt erfundene volle Dezembermonate bei Austritt am 1. Dezember aus.
- Anspruch am 1. Dezember allein macht einen unvollständigen Referenzmonat nicht vollständig. Ein früherer voller Novembermonat ist dagegen mit einem bestätigten Ende am 1. Dezember vereinbar.
- Ein einzelner Entgeltanspruchstag kann den Eintrittsmonat in der Zwölftelung erhalten; ein unbezahlter Monat ohne bestätigte Ausnahme bleibt reduziert. Bestätigte Kürzungsausnahmen außerhalb des Referenzmonats bleiben aus der bestehenden Jahresprüfung erhalten.
- Die besondere Elternzeit-Teilzeitbasis muss ausdrücklich als nicht einschlägig bestätigt sein. Frühere Austritte bleiben wegen ihrer abweichenden Bemessung ausgeschlossen.
- RK Ost 2025 behält die belegte Westtabellen-Basis und die regionalen Quellenstände. Es wird kein persönlicher Monatsbetrag aus der aktuellen Tabelle rekonstruiert.
- Ein erfolgreiches Ergebnis enthält die kopierte persönliche Basis, den Jahresanspruch samt Zwölftelfaktor und beide Quellenbezüge, mit `draft: true` und `completeGross: false`.
- `annualAmount` bleibt ausdrücklich `unavailable / LATE_ENTRY_RATE_REFERENCE_UNRESOLVED`; Gruppenstichtag, Bemessungssatz und Jahresbetrag werden nicht ausgegeben.

## Verifikation

- 41 neue Tests einschließlich 224 Kombinationen aus Anspruchsjahren, Anlagen, Regionen/Teilgebieten und Eintrittstagen.
- 403 gezielte Späteintrittsbasis-, Anspruchs-, reguläre, Teilmonats- und Ersatzmonats-Betragstests grün.
- Feste Zwölftelfaktoren 3/12, 2/12 und 1/12, ein Entgelttag versus unbezahlter Eintrittsmonat, bestätigte Ausnahmen außerhalb der Basis und Beschäftigungsende am 1. Dezember geprüft.
- Widersprüchliche Referenzmonate, unbestätigte Angaben, ungültige Vertragsversion, falsche Auswahl/Basisidentität und erster voller Monat außerhalb des Anspruchsjahres bleiben nicht verfügbar.
- `verify:fast` vollständig grün: 1.606 Unit-, 472 Komponententests; Typen, Lint, Format und Zusatzprüfungen; alle 17 Kandidaten gültig.
- `audit:production` mit verifizierter installierter RSA-Härtung sowie `release:check` grün.
- Graph aktualisiert; die neue Funktion wird ausschließlich im zugehörigen Test importiert.
- PR-CI und Merge werden getrennt im Pull Request und in der Gesamtcheckliste nachgewiesen.
