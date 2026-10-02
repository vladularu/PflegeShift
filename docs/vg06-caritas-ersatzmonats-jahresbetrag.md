# VG-06: Caritas-Jahresbetrag mit Ersatzmonat (DRAFT)

## Task-Vertrag

- Ziel: Die bestätigte historische Ersatzmonatsbasis mit geprüftem Jahresanspruch, Zwölftelfaktor und belegter Schlussrundung zu einem einzelnen DRAFT-Jahresbetrag verbinden.
- Plattform: reine TypeScript-Fachlogik; Expo ~57.0.22, versionierte Dokumentation SDK 57.
- Dateiscope: genau drei neue Dateien: `src/engine/caritas-annual-payment-fallback-amount.ts`, zugehöriger Test und dieser Beleg. Vorhandene Basis-, Anspruchs- und Rundungsfunktionen werden verwendet.
- Nicht-Ziele: historische Entgeltabrechnung rekonstruieren, Gruppen ohne bestätigte Septembergruppe ersetzen, Späteintritt, früher Austritt, besondere Elternzeit-Teilzeitbasis, Netto/vollständiges Brutto, App-Anbindung, Katalogaktivierung oder OTA.
- Abnahme: feste Beträge für 2025/2026 und regionale Matrix, Grenzen 0/29/30 Tage, Ersatzmonat im laufenden Jahr und Vorjahr, tatsächlicher Dienstverlauf, spätere volle Monate, bestätigte Krankengeldzuschussausnahmen, Zwölftelung und Rundung; `verify:fast` und sieben grüne PR-Prüfungen.

## Quellen und Berechnung

Die Originale wurden erneut mit SHA-256 geprüft und die einschlägigen Ersatzmonats- und Rundungsabschnitte gelesen.

| Original                                                                                                            | SHA-256                                                            | Abschnitt                                                             |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| [AVR Stand 01.07.2025](https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/AVR-PDF_Version_2025.pdf)      | `a4f8dea02fb84ba4f203a753bd362d82dec8ad8953f3befed99ac65e65ec2637` | Anlagen 31/32 § 16, Seiten 264–265 / 301–302; Anlage 1 X(e), Seite 32 |
| [AVR Stand 19.03.2026](https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/AVR_Online-PDF_2026_final.pdf) | `cb6fc32981eb120d5c05e68d6563725436001409e9bc728bc47d52d08d705aa7` | Anlagen 31/32 § 16, Seiten 255–256 / 291–292; Anlage 1 X(e), Seite 33 |

Unter 30 Entgeltanspruchstagen im Bemessungszeitraum ersetzt der letzte vollständige Entgeltanspruchsmonat die Juli–September-Basis. Hier öffnet ausschließlich `FALLBACK_REFERENCE_MONTH_REQUIRED` den vorhandenen Ersatzbasisvertrag.

Der bestätigte persönliche historische Monatsbetrag bleibt exakt die Basis (Nenner 1). Er wird mit dem belegten regionalen Bemessungssatz und den erhaltenen Zwölfteln multipliziert. Schlussrundung nach Anlage 1 X(e), ohne erneuten Durchschnitt, 30,67-Normalisierung oder Teilzeitkürzung.

## Grenzen und Abgleich

- Ein bestätigtes einzelnes Dienstverhältnis und Anspruch am 1. Dezember sind erforderlich. Der gesamte Ersatzmonat muss innerhalb dieses Dienstverhältnisses liegen.
- Vollständiger Entgeltanspruch, historische §-16-Basis, Identität des Dienstverhältnisses und letzter maßgeblicher voller Monat müssen ausdrücklich bestätigt sein.
- Liegt der Ersatzmonat im Anspruchsjahr, muss dessen Jahresmonat vollständige Entgelt-/Fortzahlungstage bestätigen. Ein nachgewiesener späterer voller Entgeltmonat vor Juli widerspricht einem älteren Ersatzmonat; beide Konflikte liefern `REPLACEMENT_MONTH_FACTS_MISMATCH`.
- Vorjahresmonate werden als bestätigte historische Beträge verwendet. Jahresdaten können ihnen widersprechen, rekonstruieren aber keine außerhalb des Anspruchsjahres liegende Abrechnung. Die externe Bestätigung des letzten maßgeblichen Monats bleibt erforderlich.
- Referenztage müssen mit den Jahresdaten übereinstimmen; Entgelt- und bezahlte Zuschusstage zusammen dürfen die Beschäftigungstage nicht überschreiten. Bei null Entgelttagen passen bezahlte Zuschusstage ausschließlich zur bestätigten Ausnahme `SICK_PAY_SUPPLEMENT`; deren Fehlen oder eine widersprechende andere Ausnahme bleibt nicht verfügbar.
- Die RK-Ost-West-Bemessung 2025 sowie die unterschiedlichen regionalen AVR-Originalstände bleiben aus dem bestehenden Jahresregelvertrag erhalten. Historische Monatsbeträge werden nicht aus der aktuellen Tabelle neu berechnet.
- Bestätigte Septembergruppe, nicht einschlägige Elternteilzeit-Sonderbemessung, ursprüngliche Basis, Jahresanspruch, exakter BigInt-Bruch und Rundungsquelle bleiben nachvollziehbar.
- `draft: true`, `completeGross: false`. Unabhängige Fachprüfung und App-Anbindung bleiben offen.

## Verifikation

- 85 neue Ersatzmonats-Betragstests, einschließlich 384 Kombinationen aus Jahren, Anlagen, Teilgebieten und P-Gruppen.
- 333 gezielte Ersatzbasis-, Anspruchs-, reguläre und Teilmonats-Betragstests grün.
- Feste Jahresbeträge für alle Faktoren von 0/12 bis 12/12; Vorjahresbasis, tatsächliche Februar-Länge, spätere volle Monate, 29/30-Tagesgrenze und Schlussrundung geprüft.
- `verify:fast` vollständig grün: 1.565 Unit-, 472 Komponententests, Typen, Lint, Format und Zusatzprüfungen; alle 17 Kandidaten gültig.
- `audit:production` mit verifizierter installierter RSA-Härtung sowie `release:check` grün.
- Graph aktualisiert; die neue persönliche Funktion wird ausschließlich im zugehörigen Test importiert.
- PR-CI und Merge werden getrennt im Pull Request und in der Gesamtcheckliste nachgewiesen.
