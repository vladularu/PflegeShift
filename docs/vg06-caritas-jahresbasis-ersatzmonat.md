# VG-06: persönliche Jahresbasis aus einem Ersatzmonat

## Task-Vertrag

- Stand: 01.10.2026; Basis `1ea511cbae113b2d3d9fa2addd298b27c748cbaa`.
- Branch: `codex/vg06-caritas-fallback-annual-basis`.
- Ziel: für einen vollständig bestätigten Juli-/August-/September-Zeitraum
  mit weniger als 30 Entgelttagen eine extern bestätigte historische
  Vollmonatsbasis als DRAFT-Jahresbasis übernehmen.
- Umsetzungsumfang: letzter anwendbarer Vollmonat vor Juli des Anspruchsjahres
  im selben Dienstverhältnis. Seine fachliche Auswahl muss extern bestätigt sein.
- Nicht-Ziele: automatische Auswahl aus Lohnhistorie, historische Tabellen-
  oder Entgeltneuberechnung, Ersatzmonate nach dem Referenzzeitraum, später
  Eintritt, Elternzeit-Sonderbasis, früher Austritt, Anspruch, Kürzungen,
  abschließender Jahresbetrag, vollständiges Brutto, App-Anbindung und OTA.
- Zielplattform: reine TypeScript-Fachlogik für die iPhone-first-App.
  Keine UI- oder native Änderung; für dieses Paket kein Screenshot erforderlich.
- Expo: `~57.0.22`; versionsgebundene Referenz
  <https://docs.expo.dev/versions/v57.0.0/> vor Implementierung gelesen.
- Erlaubter Dateiscope: genau drei neue Dateien:
  `src/engine/caritas-annual-payment-fallback-basis.ts`,
  `src/engine/caritas-annual-payment-fallback-basis.test.ts` und dieser Beleg.
- Git-Lieferung: bestehende ausdrückliche Dauerfreigabe für Commit, Push, PR
  und Merge nach sieben grünen CI-Prüfungen. Keine Build-/OTA-/App-Aktivierung.

## Abnahmekriterien

- Anlagen 31/32, Jahre 2025/2026, sämtliche belegten P-Gruppen und alle sechs
  Regionalkommissionen einschließlich der Ost-West-Jahresbasis 2025.
- Der vorhandene Teilmonatsbaustein muss exakt den notwendigen Ersatzmonat
  melden. Seine vollständigen Bestätigungs-, Monats-, Tages-, Betrags-,
  Quellen- und Identitätsprüfungen dürfen nicht umgangen werden.
- 0 bis 29 Entgelttage lösen diesen Fall aus. Ab 30 Entgelttagen wird kein
  Ersatzmonat übernommen; andere Referenzfälle bleiben gesperrt.
- Kanonischer historischer Monat von 1900 an und vor Juli des Anspruchsjahres;
  frühere Kalenderjahre sind im bestätigten selben Dienstverhältnis erlaubt.
- Vollmonatsanspruch, historisch nach § 16 bereinigte Basis, dasselbe
  Dienstverhältnis und letzter anwendbarer Vollmonat benötigen jeweils
  ausdrückliche Bestätigungen. Die Jahresbasisregion muss exakt passen.
- Historische Basis ist ein positiver sicherer ganzzahliger Centbetrag.
  Keine Wiederholung von Teilzeitkürzung, Mittelwert oder Faktor 30,67.
- Kopierte Monatspositionen, unabhängige Quellenlisten, unveränderte Eingaben,
  DRAFT und `completeGross: false`; kein Anspruch oder Jahresbetrag.
- Gezielte Referenz- und Negativfälle sowie vollständiges `verify:fast` grün.

## Originalquellen

| Jahr | Originalstand | Fundstelle                                                                   | SHA-256                                                            |
| ---- | ------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 2025 | 01.07.2025    | Anlagen 31/32, § 16 Abs. 2, Anmerkung 1 Satz 4; gedruckte Seiten 264/301     | `a4f8dea02fb84ba4f203a753bd362d82dec8ad8953f3befed99ac65e65ec2637` |
| 2026 | 19.03.2026    | Anlagen 31/32, § 16 Abs. 2, Anmerkung 1 Satz 4; gedruckte Seiten 255/291–292 | `cb6fc32981eb120d5c05e68d6563725436001409e9bc728bc47d52d08d705aa7` |

- [Original-AVR 2025](https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/AVR-PDF_Version_2025.pdf)
- [Original-AVR 2026](https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/AVR_Online-PDF_2026_final.pdf)

Die Original-PDFs wurden erneut gelesen und ihre SHA-256 geprüft. Unter
30 Entgelt-Kalendertagen im Bemessungszeitraum verweist die Anmerkung auf den
letzten Monat mit Entgeltanspruch für sämtliche Kalendertage. Die fachliche
Bestimmung dieses Monats wird hier extern bestätigt. Das Paket unterstützt
historische Monate vor Juli; andere zeitliche Fallkonstellationen bleiben offen.

## Historische Basis und Quellenidentität

Die vorhandenen westlichen 2025-Pakete beginnen erst am 01.07.2025. Ihre
Juli-Tabelle darf deshalb nicht als Tabellenbeleg für Juni oder frühere
historische Monate ausgegeben werden. Dieser Baustein berechnet keinen
historischen Tabellenbetrag. Er übernimmt einen extern fachlich bestätigten
persönlichen Monatsbasisbetrag mit der zum Jahresregel-Lookup passenden Region.
Die Bestätigung umfasst die historische Entgeltinformation, §-16-Bereinigung
und erforderliche regionale Anpassungen; insbesondere darf eine Ost-Basis
2025 nicht ohne Bestätigung zur erforderlichen West-Jahresbasis werden.

Die Ersatzmonatsposition nennt daher keine historische Tabellen-ID.
`annualRule.basisPayTableId` beschreibt ausschließlich die im Jahreskatalog
belegte Jahresregel-Auswahl. Sie belegt keine Tabelle für den historischen Monat.
Persönliche Lohnbelege und ihre fachliche Aufbereitung werden hier weder
unabhängig geprüft noch gespeichert.

## Rechenvertrag und Folgearbeit

Der vorhandene Teilmonatscheck prüft zuerst den vollständigen Referenzzeitraum.
Nur seine Meldung `FALLBACK_REFERENCE_MONTH_REQUIRED` erlaubt die Übernahme.
Der historische Vollmonatsbetrag wird als exakter Bruch mit Nenner 1 ausgegeben.
Die Juli-/August-/September-Beträge bleiben nur als separate Prüfpositionen
sichtbar und fließen nicht zusätzlich in die Ersatzbasis ein.

Fehlender letzter Vollmonat, spätere Bemessungsmonate, Eintritts-/Elternzeit-
und Austrittsfälle, historische Tabellenaufbereitung, Anspruch, Kürzungen,
abschließender Jahresbetrag sowie Fachreview und App-Anbindung bleiben offen.

## Verifikation

Am 01.10.2026 lokal auf `1ea511cbae113b2d3d9fa2addd298b27c748cbaa`:

- Sieben gezielte Testsuiten: 188 Tests bestanden. Die neue Suite enthält
  43 Fälle mit 384 regionalen Jahr-/Anlage-/Tarifgebiets-/P-Gruppen-Kombinationen.
- 0/1/29 Entgelttage, die Grenze ab 30, Krankengeldzuschusszeiten, frühere
  Kalenderjahre, historische Monatsidentität und alle Ersatzmonatsbestätigungen geprüft.
- Sämtliche Referenzzeitraum-Sperren bleiben wirksam: fehlende Bestätigungen,
  Monats-/Tages-/Betragsfehler, Quellendrift, Auswahlabweichungen und Überlauf.
- Ersatzbetrag bleibt exakt; keine Wiederholung von Teilzeitkürzung,
  Mittelwert oder Faktor 30,67. Die Ausgabe behauptet keine historische Tabellen-ID.
- `npm.cmd run verify:fast` vollständig bestanden: 1.203 Unit-Tests,
  472 Komponententests und sämtliche Infrastrukturtests grün.
- TypeScript, Lint mit null Warnungen, Prettier und Diff-Prüfung grün;
  alle 17 Regelkandidaten gültig, generierte Verträge aktuell.
- Genau drei neue Dateien; bestehende Logik und Katalogdaten unverändert.

Fachreview, persönliche Belege und die tatsächliche Auswahl des letzten
anwendbaren Vollmonats sind weiterhin externe Abnahme. Es entsteht kein
Anspruchsnachweis, abschließender Jahresbetrag oder App-Gehaltsausgabepfad.
