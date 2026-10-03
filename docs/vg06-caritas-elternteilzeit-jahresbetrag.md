# VG-06: Caritas-Elternteilzeit-Jahresbetrag (DRAFT)

## Task-Vertrag

- Ziel: Drei extern geprüfte Monatsbasen am Beschäftigungsumfang unmittelbar vor Elternzeit mit Jahresanspruch, Zwölfteln und Schlussrundung zu einem belegten DRAFT-Jahresbetrag verbinden.
- Plattform: reine TypeScript-Fachlogik; Expo ~57.0.22, versionierte SDK-57-Dokumentation geprüft.
- Scope: genau drei neue Dateien: `src/engine/caritas-annual-payment-parental-part-time-amount.ts`, zugehöriger Referenztest und dieser Beleg.
- Abnahme: feste Geldreferenzen für 2025/2026, Anlagen 31/32 und alle sechs Regionalkommissionen/Teilgebiete; Stichtage, Geburtsjahr, bestätigte Verläufe, identische historische Anteile und Monatsquellen, Jahresdatenabgleich, Kürzungsausnahmen, sichere Centbeträge und Schlussrundung. Gezielte Tests, `verify:fast`, Audit/Release und sieben grüne PR-Prüfungen.
- Nicht-Ziele: Teil-/unbezahlte Referenzmonate, Wechsel im Referenz-Teilzeitumfang, mehrere Elternzeiten/Kinder, Späteintritt oder früher Austritt, automatische Elterngeld-/Stunden-/historische Abrechnungsprüfung, vollständiges Brutto, App-Anbindung, Katalogaktivierung oder OTA.
- Lieferung: bestehende ausdrückliche Git-Freigabe; aktueller master 9fa729b. Keine visuelle/native Änderung dieses Pakets, kein Gerätebeleg nötig.

## Geprüfte Originalquellen

Die vorhandenen Originaldateien wurden erneut mit SHA-256 geprüft; die besondere Elternteilzeit-Regel wurde für beide Anlagen in beiden Normständen gelesen. Der 2025-Webabruf war nicht verfügbar, deshalb wurde die geprüfte lokale Originaldatei verwendet.

| Original                                                                                                      | SHA-256                                                            | Elternteilzeit-Regel                                                |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| [AVR 01.07.2025](https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/AVR-PDF_Version_2025.pdf)      | `a4f8dea02fb84ba4f203a753bd362d82dec8ad8953f3befed99ac65e65ec2637` | Anlage 31, Seite 264; Anlage 32, Seite 301; jeweils § 16(2), Satz 4 |
| [AVR 19.03.2026](https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/AVR_Online-PDF_2026_final.pdf) | `cb6fc32981eb120d5c05e68d6563725436001409e9bc728bc47d52d08d705aa7` | Anlage 31, Seite 255; Anlage 32, Seite 291; jeweils § 16(2), Satz 4 |

Bei elterngeldunschädlicher Teilzeit im Bemessungszeitraum des Geburtsjahres gilt der Beschäftigungsumfang am Tag vor Beginn der Elternzeit. Die Ausnahmeregel zur Zwölftelkürzung nach § 16(4) ist gesondert zu prüfen; aus der Sonderbasis folgt deren Erfüllung nicht automatisch.

## Bestätigter Berechnungspfad

- Unterstützt wird ein bestätigtes einzelnes Dienstverhältnis mit Anspruch am 01.12., ein Geburtsdatum im Anspruchsjahr und eine bestätigte einzelne Elternzeit. Elternzeit und ein bestätigter stabiler, elterngeldunschädlicher Teilzeitzeitraum müssen den ganzen Juli–September abdecken und innerhalb des Dienstverhältnisses liegen.
- Der vorherige Beschäftigungsumfang wird als exakter positiver Bruch höchstens 1 an seinem tatsächlichen UTC-Stichtag (Elternzeitbeginn minus ein Tag) extern bestätigt. Der Teilzeitumfang im Referenzzeitraum ist ein eigener positiver Bruch kleiner 1; die Elterngeldverträglichkeit wird extern bestätigt.
- Jeder Monatsbetrag heißt ausdrücklich `personalBasisAtPreLeaveScopeCents`: eine bereits extern nach § 16 und am früheren Umfang bemessene historische persönliche Basis. Dies sind keine als tatsächlich gezahlt ausgegebenen Beträge. Die Berechnung rekonstruiert keine historischen Komponenten und multipliziert keinen weiteren Teilzeitfaktor.
- Monat, Jahresbasisregion/-tabelle, volle Entgelt-/Fortzahlungstage, §-16-Bereinigung und Anwendung desselben historischen Umfangs müssen bestätigt sein. Äquivalente Brüche werden mit BigInt-Kreuzprodukten exakt verglichen; unbekannte oder abweichende Monatsumfänge bleiben unavailable.
- Die tatsächlichen Juli–September-Tage der zwölf Anspruchsmonate müssen 31/31/30 und ohne Kürzungsausnahme vorliegen. Andere bestätigte Elternzeit-Ausnahmemonate müssen dasselbe Kind betreffen und vollständig im bestätigten Elternzeitraum liegen. Gemischte Ausnahmemonate werden nicht erschlossen.
- Mittelwert = Summe der drei angepassten persönlichen Monatsbasen / 3. Der belegte September-Bemessungssatz und der unabhängig geprüfte Zwölftelfaktor werden angewendet; Rundung erst am endgültigen Cent über den bestehenden quellengebundenen AVR-Helfer.
- Regionale Regeln einschließlich der RK-Ost-West-Jahresbasis 2025 und beide Anlagen bleiben erhalten. Datenlücken, unbestätigte Anspruchsausnahmen und weitere Sonderverläufe ergeben unavailable.
- Ergebnis: `draft: true`, `completeGross: false`, keine App-Verbindung. Historische Abrechnung, Komponentenabgrenzung, Elterngeldverträglichkeit und unabhängige Fachfreigabe bleiben externe Voraussetzungen.

## Verifikation

- 96 neue Referenz- und Grenztests bestanden; darin 384 feste Jahres-/Anlagen-/Gebiets-/P-Gruppen-Kombinationen für 2025/2026.
- 426 gezielte Tests gemeinsam mit Jahresanspruch, regulärem Betrag, Ersatzmonat, Späteintrittsprüfung und Frühaustrittsbetrag bestanden.
- Feste persönliche Basis 300.000 Cent: bei 86 Prozent 258.000 Cent, bei 76 Prozent 228.000 Cent. Bereits am früheren Halbzeitumfang angepasste 150.000 Cent ergeben 129.000 Cent ohne zweite Teilzeitkürzung.
- Finale `verify:fast`-Prüfung bestanden: 1.763 Unit-/Integrationstests, 472 Komponententests, 53 Audit-/Härtungsfälle sowie Regel-, Typ-, Lint-, Format-, Liefer- und Laufzeitprüfungen.
- Produktions-Audit und `release:check` bestanden; alle 17 DRAFT-Kandidaten gültig. Die beiden installierten Sicherheitsbackports bleiben geprüft.
- Graph aktualisiert; der neue Rechner wird ausschließlich vom eigenen Referenztest importiert. Keine App-Anbindung.
- Genau die drei vereinbarten neuen Dateien; Format und `git diff --check` grün. Vor Merge sind die sieben PR-CI-Gates erforderlich.
