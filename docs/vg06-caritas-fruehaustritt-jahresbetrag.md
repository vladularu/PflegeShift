# VG-06: Caritas-Jahresbetrag bei vorzeitigem Ausscheiden, Anlage 31 (DRAFT)

## Task-Vertrag

- Ziel: Einen bestätigten vollen letzten Beschäftigungsmonat nach Anlage 31 § 16(6), den bestehenden Jahresanspruch und den Zwölftelfaktor zu einem belegten DRAFT-Jahresbetrag verbinden.
- Plattform: reine TypeScript-Fachlogik; Expo ~57.0.22, versionierte Dokumentation SDK 57.
- Dateiscope: genau drei neue Dateien: `src/engine/caritas-annual-payment-early-exit-amount.ts`, zugehöriger Test und dieser Beleg.
- Nicht-Ziele: Austritte vor dem September-Stichtag, fehlende September-Beschäftigung oder voller Referenzmonat, Teil-/unbezahlte Referenzmonate, Anlage 32, besondere Elternzeit-Teilzeitbasis, historische Komponenten rekonstruieren, Netto/vollständiges Brutto, App-Anbindung, Katalogaktivierung oder OTA.
- Abnahme: datierte feste Beträge für alle sechs Regionen/Teilgebiete und P-Gruppen 2025/2026; Austritts-/Eintrittsgrenzen, letzter voller Beschäftigungsmonat, Komponentenabgrenzung, Jahresdatenabgleich, Zwölftelung und Schlussrundung; fokussierte Tests, `verify:fast` und sieben grüne PR-Prüfungen.
- Git-Lieferung: bestehende ausdrückliche Freigabe für Commit, Push, PR und Merge nach erfolgreicher CI. Keine native/visuelle Änderung; kein Gerätebeleg für dieses Paket erforderlich.

## Originalquellen

Die vorhandenen Originaldateien wurden erneut mit SHA-256 geprüft und die einschlägigen Normabschnitte gelesen. Der Web-Abruf des 2025-Originals war in diesem Arbeitsschritt nicht verfügbar; dessen geprüfte lokale Originaldatei wurde verwendet.

| Original                                                                                                            | SHA-256                                                            | Abschnitt                                               |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------- |
| [AVR Stand 01.07.2025](https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/AVR-PDF_Version_2025.pdf)      | `a4f8dea02fb84ba4f203a753bd362d82dec8ad8953f3befed99ac65e65ec2637` | Anlage 31 § 16, Seiten 264–265; Anlage 1 X(e), Seite 32 |
| [AVR Stand 19.03.2026](https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/AVR_Online-PDF_2026_final.pdf) | `cb6fc32981eb120d5c05e68d6563725436001409e9bc728bc47d52d08d705aa7` | Anlage 31 § 16, Seiten 255–256; Anlage 1 X(e), Seite 33 |

Anlage 31 § 16(6) erhält den Anspruch bei Ende vor dem 1. Dezember. Die Bemessung verwendet den letzten vollen Kalendermonat des Dienstverhältnisses und ausschließlich Tabellenentgelt sowie in Monatsbeträgen festgelegte Zulagen. Anlage 32 enthält diese Austrittsregel in den geprüften Normständen nicht.

Die maßgebliche Entgeltgruppe bleibt gemäß § 16(2) am 1. September zu bestätigen. Dieses Paket verlangt tatsächliche Beschäftigung an diesem Tag und Ende vor dem 1. Dezember. Ein Ersatzgruppenstichtag für andere Fälle wird nicht festgelegt.

## Berechnung und Grenzen

- Der bestehende Anspruchsprüfer validiert die zwölf Jahresmonate, den tatsächlichen einzelnen Dienstverlauf und die Kürzungsausnahmen. Ausschließlich `ANLAGE_31_EARLY_EXIT` öffnet diesen Betragspfad.
- Bei Austritt am Monatsletzten ist dieser Monat der letzte volle Beschäftigungsmonat; bei früherem Austrittstag der Vormonat. Der komplette Referenzmonat muss innerhalb des bestätigten Dienstverhältnisses und der Paketgültigkeit liegen.
- Der Referenzmonat muss ausdrücklich vollen Entgelt-/Fortzahlungsanspruch bestätigen, mit identischen vollständigen Kalendertagen und Ausnahme `NONE` in den Jahresdaten. Unbezahlte/teilbezahlte letzte Beschäftigungsmonate werden nicht durch einen älteren bezahlten Monat ersetzt.
- Die persönliche historische Tabellenkomponente und die Summe ausschließlich fester Monatszulagen sind getrennt anzugeben und nach § 16(6) ausdrücklich zu bestätigen. Andere Betragsfelder werden nicht in die Basis übernommen. Historische Abrechnung und Komponentenabgrenzung bleiben extern bestätigt.
- Persönlicher voller Monatsbetrag = Tabellenkomponente + feste Monatszulagen. Nenner 1; keine erneute Mittelung, 30,67-Normalisierung oder Teilzeitkürzung.
- DRAFT-Jahresbetrag = diese Basis × regionaler bestätigter September-Bemessungssatz × verbleibende Zwölftel. Exakter BigInt-Bruch, Rundung erst zum endgültigen Cent nach Anlage 1 X(e).
- Ein Entgeltanspruchstag kann den Austrittsmonat erhalten; ein ganz unbezahlter Monat ohne bestätigte Ausnahme bleibt reduziert. Bestätigte Kürzungsausnahmen außerhalb des Referenzmonats werden aus der Jahresprüfung erhalten, ohne zusätzliche Basisbeträge.
- RK-Ost-West-Bemessung 2025, regionale Quellenstände, bestätigte Septembergruppe, Komponenten, Anspruch und Rundung bleiben nachvollziehbar. Die ursprünglichen Juli–September-Felder der Quellenregel bleiben als Quellenmetadaten erhalten; der tatsächliche Ersatzmonat steht ausdrücklich unter `basis.lastFullMonth`.
- `draft: true`, `completeGross: false`. Frühere Austritte, weitere Sonderbemessungen, unabhängige Fachfreigabe und App-Anbindung bleiben offen.

## Verifikation

- 61 neue Tests bestanden; der gemeinsame fokussierte Lauf mit Anspruch, regulärem Betrag, Teilmonaten, Ersatzmonat und Späteintritt: 392 Tests grün.
- 192 Jahres-/Gebiets-/P-Gruppen-Kombinationen (2025/2026, alle sechs Regionalkommissionen einschließlich drei RK-Ost-Teilgebieten) mit festen externen persönlichen Basisbeträgen geprüft.
- Bestätigte Monatsbasis 278.204 + 9.450 = 287.654 Cent bei Ende 30.11. und 11/12: 86 Prozent ergeben 226.767 Cent, 76 Prozent 200.399 Cent. Austritt 01.09./30.09./01.10./31.10./01.11./15.11./30.11., letzter voller Monat, Anspruchstage und Ausnahmen zusätzlich einzeln geprüft.
- Schlussrundung unter/auf/über einem halben Cent, Summenüberlauf, ungültige Quelle/Pakete, fehlende Bestätigungen, unbezahlter letzter Monat, September-Stichtag, Anlage 32 und unveränderliche Jahresdaten geprüft.
- `verify:fast`: bestanden (1.667 Unit-, 472 Komponententests und alle eingebundenen Vertrags-/Operatorprüfungen). Produktions-Audit und `release:check` auf dem final gemergten Sicherheitsstand (PR #152/#153) bestanden; alle 53 Audit-/Härtungstests grün.
- Format und Diffprüfung bestanden. Sieben erfolgreiche PR-Prüfungen bleiben das verbindliche Merge-Gate; CI-Nachweis im zugehörigen Pull Request.
