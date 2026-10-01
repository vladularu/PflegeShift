# VG-06: persönliche Jahresbasis bei Teilmonaten

## Task-Vertrag

- Stand: 01.10.2026; Basis `6056c29d430214070b9920a8b002c79bee732579`.
- Branch: `codex/vg06-caritas-partial-annual-basis`.
- Ziel: datierte persönliche DRAFT-Jahresbasis für bestätigte unvollständige
  Entgeltzeiträume im normalen Juli-/August-/September-Bemessungszeitraum.
  Krankengeldzuschusszeiten werden ausdrücklich aus Betrag und Tageszahl ausgeschlossen.
- Nicht-Ziele: weniger als 30 Entgelttage mit Ersatzmonat, später Eintritt,
  Elternzeit-Sonderbasis, frühes Ausscheiden, Anspruch, Zwölftel-Kürzung,
  abschließender Jahresbetrag, vollständiges Brutto, App-Anbindung und OTA.
- Zielplattform: reine TypeScript-Fachlogik für die iPhone-first-App. Keine UI-
  oder native Änderung; für dieses Paket kein Screenshot erforderlich.
- Expo: `~57.0.22`; versionsgebundene Referenz
  <https://docs.expo.dev/versions/v57.0.0/> vor der Implementierung gelesen.
- Erlaubter Dateiscope: genau drei neue Dateien:
  `src/engine/caritas-annual-payment-partial-basis.ts`,
  `src/engine/caritas-annual-payment-partial-basis.test.ts` und dieser Beleg.
- Git-Lieferung: bestehende ausdrückliche Dauerfreigabe für Commit, Push, PR
  und Merge nach sieben grünen CI-Prüfungen. Keine Build-/OTA-/App-Aktivierung.

## Abnahmekriterien

- Beide Anlagen 31/32, Jahre 2025/2026 und sämtliche belegten P-Gruppen in
  allen sechs Regionalkommissionen; RK-Ost-West-Jahresbasis 2025 bleibt getrennt.
- Vollständige, extern bestätigte Tagesaufteilung für jeden der drei Monate:
  Entgelttage, Krankengeldzuschusstage und sonstige Tage ohne Entgelt.
  Keine Lücken, überzähligen Tage oder stillschweigenden Nullwerte.
- Genau drei passende Monate; Fall, Septembergruppe, Tagesaufteilung und
  bereinigte persönliche Beträge benötigen ausdrückliche Bestätigungen.
- Mindestens 30 und weniger als 92 Entgelttage. Weniger als 30 erfordern
  einen anderen Bemessungsfall; vollständige Monate bleiben im regulären Baustein.
- Krankengeldzuschuss und Fallbezeichnung müssen zusammenpassen. Ein Monat
  ohne Entgelttage darf keinen anrechenbaren Betrag enthalten.
- Exakter gekürzter Bruch ohne vorzeitige Rundung oder wiederholte Teilzeitkürzung.
  Negative, unsichere und gebrochene Centbeträge sowie Überlauf werden gesperrt.
- Kopierte Ergebnispositionen und unveränderte Eingaben; DRAFT und
  `completeGross: false`, kein Anspruch oder Jahresbetrag.
- Gezielte Referenz- und Negativfälle sowie vollständiges `verify:fast` grün.

## Originalquellen

| Jahr | Originalstand | Fundstelle                                                            | SHA-256                                                            |
| ---- | ------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 2025 | 01.07.2025    | Anlagen 31/32, § 16 Abs. 2, Anmerkung 1; gedruckte Seiten 264/301     | `a4f8dea02fb84ba4f203a753bd362d82dec8ad8953f3befed99ac65e65ec2637` |
| 2026 | 19.03.2026    | Anlagen 31/32, § 16 Abs. 2, Anmerkung 1; gedruckte Seiten 255/291–292 | `cb6fc32981eb120d5c05e68d6563725436001409e9bc728bc47d52d08d705aa7` |

- [Original-AVR 2025](https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/AVR-PDF_Version_2025.pdf)
- [Original-AVR 2026](https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/AVR_Online-PDF_2026_final.pdf)

Die Original-PDFs wurden lokal erneut gelesen und ihre SHA-256 geprüft.
Für unvollständig bezahlte Referenzzeiträume beschreibt Anmerkung 1 die Summe
bereinigter Entgelte geteilt durch die zugehörigen Entgelt-Kalendertage,
multipliziert mit 30,67. Krankengeldzuschusszeiten zählen weder in die Basis
noch in diese Tageszahl. Unter 30 Entgelt-Kalendertagen gilt ein Ersatzmonat;
dieser Fall wird hier ausdrücklich nicht berechnet.

## Eingabe- und Rechenvertrag

Die drei Monatspositionen enthalten persönliche bereinigte Centbeträge und
vollständig bestätigte disjunkte Tagesaufteilungen. Tageszahlen sind ganze
Zahlen zwischen null und Monatslänge und ergeben je Monat genau 31, 31 bzw.
30 Tage. Der Vertrag verlangt die Bestätigung, dass Entgelttage und zugehörige
gezahlte Beträge nach § 16 korrekt bestimmt sind. Er prüft keine Lohnbelege
und leitet Tagesansprüche nicht aus dem Schichtkalender ab.

`PARTIAL_MONTHS` bezeichnet Unterbrechungen ohne Krankengeldzuschusstage;
`SICK_PAY_SUPPLEMENT` verlangt mindestens einen solchen ausgeschlossenen Tag.
Der bestätigte Bemessungszeitraum bleibt Juli bis September. Andere
Sonderfälle werden auch bei rechnerisch passenden Monatsdaten nicht akzeptiert.

Monatsbetrag null ist nur bei null Entgelttagen erlaubt. Beträge für
Krankengeldzuschuss müssen bereits ausgeschlossen sein. Jahresbasisregion und
Tabellen-ID müssen zum datierten Jahreslookup passen; die Gruppe zum 01.09.
und der Bemessungsfall müssen bestätigt sein. Die RK-Ost-Basis 2025 wird
unabhängig von der normalen Auswahl geprüft.

Der Mittelwert wird exakt als gekürzter Bruch gespeichert:
`Summe der Centbeträge × 3067 / (Entgelttage × 100)`.
Vor Multiplikation werden gemeinsame Faktoren gekürzt; Summen und der
verbleibende Zähler müssen sichere ganze Zahlen bleiben. Nicht darstellbare
Ergebnisse werden gesperrt. Das verhindert Zwischenüberlauf und Cent-Rundung.
Persönliche Teilzeitbeträge werden nicht erneut gekürzt.

Die Ausgabe nennt die datierte Jahresregel, Monatskopien, Entgelttage,
ausgeschlossene Krankengeldzuschusstage und Tage ohne Entgelt. Sie stellt weder
einen vollständigen Entgeltnachweis noch eine Anspruchs- oder Jahreszahlung dar.

## Folgearbeit

Ersatzmonat bei weniger als 30 Entgelttagen, später Eintritt,
Elternzeit-Sonderbasis, früher Austritt, Anspruch und Kürzungen sowie
abschließender Jahresbetrag und App-Anbindung bleiben separate Schritte.

## Verifikation

Am 01.10.2026 lokal auf `6056c29d430214070b9920a8b002c79bee732579`:

- Sechs gezielte Testsuiten mit 145 bestandenen Tests; die neue Suite enthält
  42 Fälle und prüft 384 regionale Jahr-/Anlage-/Tarifgebiets-/P-Gruppen-Kombinationen.
- Beide Bemessungsfälle, 0/1/29/30/91/92 Entgelttage, volle Monate ohne
  Entgelt oder mit Krankengeldzuschuss, exakte Bruchwerte, sichere große
  Zahlen nach Kürzung und unzulässiger Überlauf sind geprüft.
- Fehlende Bestätigungen, Tageslücken/-überzählung, falsche Fallbezeichnungen,
  Monats-, Quellen- und Tabellenabweichungen werden gesperrt.
- `npm.cmd run verify:fast` auf dem endgültigen Stand vollständig bestanden:
  1.160 Unit-Tests, 472 Komponententests und sämtliche Infrastrukturtests grün.
- TypeScript, Lint mit null Warnungen, Prettier und Diff-Prüfung grün;
  alle 17 Regelkandidaten gültig, generierte Verträge aktuell.
- Genau drei neue Dateien; bestehende Logik und Katalogdaten unberührt.

Die Prüfungen bestätigen den Rechenvertrag. Fachreview, unabhängige persönliche
Belege, Anspruchsprüfung, endgültiger Jahresbetrag und App-Abnahme bleiben offen.
