# VG-06: Caritas-Jahresbetrag aus Teilmonaten (DRAFT)

## Task-Vertrag

- Ziel: Die bestätigte Juli–September-Teilmonatsbasis mit Anspruch, Zwölftelung, regionalem Prozentsatz und belegter Schlussrundung zu einem einzelnen Jahresbetrag verbinden.
- Plattform: reine TypeScript-Fachlogik, ohne UI oder native Änderung; Expo ~57.0.22, Dokumentation SDK 57.
- Scope: neue Dateien `caritas-annual-payment-partial-amount.ts`, zugehöriger Test, `caritas-annual-payment-amount-rounding.ts` und dieser Beleg; vorhandener regulärer Jahresbetrag verwendet dieselbe Rundungsfunktion.
- Nicht-Ziele: Ersatzmonat bei weniger als 30 Entgelttagen, Eintritt nach dem 1. September, früher Austritt, besondere Elternzeit-Teilzeitbasis, Netto, vollständiges Brutto, App-Anbindung, Katalogaktivierung und OTA.
- Abnahme: feste Beträge und Brüche, regionale Matrix 2025/2026, konsistente Referenz- und Jahrestage, Krankengeldzuschuss, Grenzen 29/30/91/92 Tage, Zwölftelung, Schlussrundung, Quellenbindung, bestehende reguläre Referenzen sowie `verify:fast` und sieben grüne PR-Prüfungen.

## Quellen und Formel

Originale wurden erneut lokal mit SHA-256 geprüft und die einschlägigen Seiten gelesen:

| Original                                                                                                            | SHA-256                                                            | Abschnitt                                                             |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| [AVR Stand 01.07.2025](https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/AVR-PDF_Version_2025.pdf)      | `a4f8dea02fb84ba4f203a753bd362d82dec8ad8953f3befed99ac65e65ec2637` | Anlagen 31/32 § 16, Seiten 264–265 / 301–302; Anlage 1 X(e), Seite 32 |
| [AVR Stand 19.03.2026](https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/AVR_Online-PDF_2026_final.pdf) | `cb6fc32981eb120d5c05e68d6563725436001409e9bc728bc47d52d08d705aa7` | Anlagen 31/32 § 16, Seiten 255–256 / 291–292; Anlage 1 X(e), Seite 33 |

Die Anmerkung zu § 16(2) normiert bei Teilmonaten die Summe der berücksichtigungsfähigen Entgelte geteilt durch die Entgelt-Kalendertage, multipliziert mit 30,67. Gezahlter Krankengeldzuschuss gehört weder zur Entgeltsumme noch zum Tagesnenner. Unter 30 Entgelttagen gilt stattdessen der gesonderte Ersatzmonat.

Der Jahresbetrag ist diese ungerundete Basis × belegter regionaler Bemessungssatz × verbleibende Zwölftel. Erst der endgültige Betrag wird nach Anlage 1 X(e) auf Cent gerundet (halber Cent aufwärts). Keine erneute Teilzeitkürzung und keine Zwischenrundung.

Für RK Ost / Tarifgebiet Ost 2025 bleibt die West-Bemessung erhalten. Das Anspruchsjahr 2025 kann je nach bestehendem Paket durch das Original 2025 oder den rückblickenden Textstand 2026 belegt sein; die Rundung prüft die tatsächliche Kombination aus Quellennummer, URL, Datum und Hash. Für 2026 wird nur das Original 2026 akzeptiert.

## Grenzen und Nachvollziehbarkeit

- Anspruch am 1. Dezember, bestätigte durchgehende Beschäftigungshistorie, Eintritt spätestens am 1. September und bestätigte Septembergruppe sind erforderlich. Der Eintritt innerhalb Juli/August wird anhand der beschäftigten Kalendertage abgeglichen.
- Entgelt-/Fortzahlungstage der drei Referenzmonate müssen in Basis und Zwölftelung genau übereinstimmen. Entgelt- und bezahlte Zuschusstage dürfen zusammen die Beschäftigungstage nicht überschreiten.
- Ein Referenzmonat ohne Entgelt mit bezahltem Zuschuss benötigt die bestätigte Ausnahme `SICK_PAY_SUPPLEMENT`. Diese Ausnahme ohne bezahlte Zuschusstage sowie Kombinationen mit einer anderen Ausnahme liefern `REFERENCE_MONTH_FACTS_MISMATCH`. Nicht bezahlter, allein wegen Krankengeldhöhe blockierter Zuschuss bleibt separat bestätigt und darf keine bezahlten Zuschusstage melden.
- Basis, Anspruch, exakter Betrag als BigInt-Bruch und Rundungsbeleg bleiben im Ergebnis sichtbar. Eingaben werden nicht verändert.
- Alle Ergebnisse bleiben `draft: true` und `completeGross: false`. Feste Referenzfälle ersetzen keine unabhängige Fachfreigabe und keinen Nachweis für eine spätere App-Anbindung.

## Verifikation

- 62 neue Teilmonats-Betragstests, einschließlich 384 Jahres-/Anlagen-/Teilgebiets-/P-Gruppen-Kombinationen.
- 247 gezielte Teilmonats-, reguläre Betrags-, Basis- und Anspruchstests grün.
- `verify:fast` vollständig grün: 1.480 Unit-Tests, 472 Komponententests, Typen, Lint, Format und Zusatzprüfungen; alle 17 Kandidaten gültig.
- Produktions-Audit (installierte RSA-Härtung verifiziert) und `release:check` grün.
- Bestehende 67 reguläre Betragstests bleiben nach der gemeinsamen Rundung grün.
- Graph aktualisiert: neue persönliche Funktion wird ausschließlich im zugehörigen Test importiert.
- PR-CI und Merge werden getrennt im Pull Request und in der Gesamtcheckliste nachgewiesen.
