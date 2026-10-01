# VG-06: Caritas-Jahresregeln RK Ost 2025/2026

## Task-Vertrag

Stand: 01.10.2026. Branch: `codex/vg06-caritas-ost-annual-rules`.
Basis: `14e356b` (PR #139). Plattform: Katalogdaten und TypeScript-Referenztests.
Ziel: 24 DRAFT-Jahresregeln für Anlagen 31/32, Anspruchsjahre 2025/2026,
Tarifgebiet Ost sowie West Berlin/Hamburg; 144 P-Auswahlkombinationen.

Dateiscope: genau fünf Dateien:

- `rules/packages/reviewed/avr-caritas-p-ost/2025-01-draft1.json`
- `rules/packages/reviewed/avr-caritas-p-ost/2026-01-draft1.json`
- `src/rules/caritas-ost-annual-payment-rules.test.ts`
- `src/rules/caritas-ost-draft-packages.test.ts` (exakte Quellenliste)
- dieser Beleg.

Nicht-Ziele: Vertrags-/Engineänderung, 2027, persönliche Jahresbasis,
Anspruch, Kürzung, Ergebnisintegration, App-Aktivierung, Build und OTA.
Vertrag 14, DRAFT und alle fünf Fähigkeiten UNSUPPORTED bleiben erhalten.
Abnahme: vollständige Jahres-/Anlagen-/Tarifgebiet-/P-Abdeckung, Normquellen,
Tabellenbasis vor/nach 2026, negative Jahres- und Quellenfälle, bisherige
Felder/Quellen unverändert; gezielte Tests, `verify:fast` und sieben grüne
PR-CI-Prüfungen vor Merge. Kein UI-/Native-Scope, kein Gerätebild erforderlich.
Die dauerhafte Git-Freigabe umfasst Commit, Push, PR und Merge im Gesamtauftrag.

## Originalquellen

Am 01.10.2026 heruntergeladene Originalbytes; keine PDF-/ZIP-Kopie im Repository:

| Quelle                                                                                                                                                                    | Dokumentstand | SHA-256                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------ |
| [AVR 2025](https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/AVR-PDF_Version_2025.pdf)                                                                        | 01.07.2025    | `a4f8dea02fb84ba4f203a753bd362d82dec8ad8953f3befed99ac65e65ec2637` |
| [AVR 2026](https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/AVR_Online-PDF_2026_final.pdf)                                                                   | 19.03.2026    | `cb6fc32981eb120d5c05e68d6563725436001409e9bc728bc47d52d08d705aa7` |
| [BK: Wegfall der Ost-Sonderregel](https://caritas-dienstgeber.de/fileadmin/Beschluesse/BK/BK_2025-03_Beschluss_Berechnung_JSZ_und_Weihnachtsgeld_fuer_die_RK_Ost_gez.pdf) | 09.10.2025    | `cb16c87710b42662d49e59666cee82c74d406f2da7569b6cfc7b9b9937c596c3` |
| [Faktenblätter 2025 TG Ost](https://caritas-dienstgeber.de/fileadmin/Faktenblaetter/Faktenblaetter_2025_-_Region_Ost_-_TG-Ost.zip)                                        | Juli 2025     | `33c753ebb59d25ca27d5f835792b3befbedb47d3e561fdbb8b7297e1e5e0e845` |
| [P6 Altenhilfe Ost 2026](https://caritas-dienstgeber.de/fileadmin/Faktenblaetter/Region_Ost/P6-AH-Faktenblatt_Verguetung_Ost_2026.pdf)                                    | Januar 2026   | `b1fab89be20d3c0d6109b3447bab8bb9be9b4f47f14314e288803143caf90da5` |
| [P12 Altenhilfe Ost 2026](https://caritas-dienstgeber.de/fileadmin/Faktenblaetter/Region_Ost/P12-AH-Faktenblatt_Verguetung_Ost_2026.pdf)                                  | Januar 2026   | `35c49650f31b590bbf1fec1c5505c589c3c7aa05f8ae120b0c77c3443824f849` |

Monatsgenaue Faktenblattstände werden im Quellenvertrag auf den Monatsersten
normalisiert; ein taggenauer Veröffentlichungstermin wird nicht behauptet.
`2025-03` im Dateinamen und in der stabilen ID des Aufhebungsbeschlusses
bezeichnet die dritte Sitzung, nicht März: Der Originalbeschluss ist vom
09.10.2025 und gilt ab 01.01.2026 (A.II/A.IV, Seite 1).

## Jahresbasis und Quellenabgleich

- 2025: § 16 Abs. 3 beider Anlagen verweist für das Tarifgebiet Ost auf die
  West-Tabelle der RK Ost. Druckseiten 264/265 (Anlage 31) und 301/302
  (Anlage 32) im Originalstand 01.07.2025; seit 2022 gelten 100 % des
  jeweiligen Satzes. P4/P6/P7/P8: 86 %, P9–P16: 76 %.
- 2026: A.II des BK-Beschlusses hebt § 16 Abs. 3 beider Anlagen mit Wirkung
  zum 01.01.2026 auf. Der Originaltext 2026 zeigt den weggefallenen Absatz
  auf Druckseiten 255/256 und 291/292. Jede Auswahl behält ihre eigene Basis.
- Die 2025er Ost-Auswahl der Anlage 32 hat eine eigene niedrigere
  Monatstabelle. Ihre Jahresbasis bleibt die gemeinsame West-Tabelle;
  die Jahresregel überschreibt die normale Monatsauswahl nicht.
- Die bestehende kanonische Basis-ID `OST_TARIF_WEST_HAMBURG` wird beibehalten.
  Beide West-Auswahlen verweisen in diesen Kandidaten auf dieselbe gemeinsame
  P-Tabelle. Der Lookup liefert diese Tabellen-ID und keinen Jahresbetrag.
- Der historische AVR-Online-Auszug zur Anlage 32 enthält noch den Zusatz
  ohne Hamburg. Der datierte Originaltext 01.07.2025 enthält ihn nicht mehr.
  Für 2025 ist der datierte PDF-Stand maßgeblich; deshalb ist keine Änderung
  am bestehenden West-Basisvertrag erforderlich.

Juli–September, Gruppenstichtag 01.09., reguläre Novemberzahlung sowie
Anlage-31-Sonderfall bei frühem Ausscheiden bleiben explizite Metadaten.
Die bestehende [P-Referenzmatrix](../rules/source-extracts/caritas-annual-payment-p-bands.csv)
ordnet P16 EG12 zu; P5 wird nicht ergänzt. Die Faktenblätter bestätigen
Satzbänder. Ihre Mustervergütungen ersetzen keine persönliche Jahresbasis.

## Folgearbeit

Bestätigte persönliche Jahresbasis, Anspruch, Kürzungen und Sonderfälle,
Jahresbetrag und gemeinsame Ergebnisausgabe folgen in eigenen Paketen.
Fachliche Quellenfreigabe, Vollständigkeitsprüfung, App-Anbindung und
Preview-/iPhone-Abnahme bleiben offen.

## Verifikation

- 81 gezielte Ost-/West-Jahresregel-, Vertrags-, Quellen- und Pakettests grün;
  darunter 13 neue Ost-Referenzfälle für alle 144 Auswahlkombinationen.
- `npm.cmd run verify:fast` vollständig grün: 1.084 Unit-Tests,
  472 Komponententests sowie Publisher-, Delivery-, Operator- und Policy-Tests.
- Alle 17 DRAFT-Kandidaten gültig; generierte Verträge aktuell.
- Sämtliche bisherigen Felder und Quellen beider Ost-Kandidaten sind gegen
  `HEAD` maschinell als unverändert bestätigt.
- Genau fünf Paketdateien; `git diff --check` grün, Graft-Index aktualisiert.

Der erste Pflichtlauf konnte den ESLint-Cache außerhalb des Hauptcheckouts
wegen fehlender Schreibrechte nicht speichern. Der vollständige Wiederholungslauf
mit Checkout-/Cache-Schreibzugriff ist erfolgreich abgeschlossen.
