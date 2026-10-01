# VG-06: Westliche Caritas-Jahresregeln 2025/2026

## Task-Vertrag

Stand: 01.10.2026. Branch: `codex/vg06-caritas-west-annual-rules`.
Basis: `85ecce7` (PR #138). Plattform: reine Katalogdaten/TypeScript-Tests.

Ziel: 40 DRAFT-Jahresregeln für Baden-Württemberg, Bayern, Mitte, Nord und NRW,
jeweils Anlagen 31/32 und Anspruchsjahre 2025/2026. 240 P-Auswahlkombinationen.
Dateiscope: zehn bestehende JSON-Kandidaten, P-Referenzmatrix,
Referenztest, bestehender Quellenlisten-Referenztest, synthetische Testfixture und dieser Beleg; genau 15 Dateien.

Nicht-Ziele: RK Ost, 2027, persönliche Ansprüche/Bemessungsbeträge,
Kürzungen, Jahresbeträge, Monats-/App-Anbindung, Aktivierung und OTA.
Die Paketgültigkeit und übrigen Fachregeln bleiben erhalten.
Vertrag 14, DRAFT und alle Fähigkeiten UNSUPPORTED bleiben verpflichtend.

Abnahme: P-Satzbänder/Quellen/Anlagensonderfälle/Jahresgrenzen prüfen;
gezielte Tests und `npm.cmd run verify:fast`; PR-CI mit sieben grünen
Prüfungen vor Merge. Die dauerhafte Git-Freigabe umfasst Commit, Push, PR und
Merge im laufenden Gesamtauftrag. Ein Gerätebild ist für diese Datenänderung
kein Abnahmekriterium.

## Originalquellen

Am 01.10.2026 heruntergeladene Originaldateien, SHA-256 über unveränderte Bytes:

| Quelle                                                                                                                                            | Dokumentstand | SHA-256                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------ |
| [AVR-Gesamttext](https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/AVR_Online-PDF_2026_final.pdf)                                     | 19.03.2026    | `cb6fc32981eb120d5c05e68d6563725436001409e9bc728bc47d52d08d705aa7` |
| [DGS-Faktenblätter West 2025](https://caritas-dienstgeber.de/fileadmin/Faktenblaetter/Faktenblaetter_2025_-_Regionen_West.zip)                    | Juli 2025     | `01a2a4e6681bb94e6fd85042f012d9582a6805b12ccfd1283a82ce1371a6045a` |
| [DGS P6 Altenhilfe West 2026](https://caritas-dienstgeber.de/fileadmin/Faktenblaetter/Regionen_West/P6-AH-Faktenblatt_Verguetung_West_2026.pdf)   | Februar 2026  | `1d5d55787e2a94af24b48371d744669411407395b5ebafa89782b58dbbe0b1ca` |
| [DGS P12 Altenhilfe West 2026](https://caritas-dienstgeber.de/fileadmin/Faktenblaetter/Regionen_West/P12-AH-Faktenblatt_Verguetung_West_2026.pdf) | Februar 2026  | `936b9abdbed1d15c645dde2934eaf3b75bbbcf67eaadec8508f0aa13255c6428` |

Bei Faktenblättern mit reinem Monatsstand ist `documentDate` auf den ersten
Tag dieses Monats normalisiert; der Beleg behauptet keinen taggenauen
Veröffentlichungstermin.
AVR-Druckseiten 250 und 286: § 12 Abs. 1, P-Zuordnung.
Druckseiten 255–256 und 291–292: § 16, Jahreszahlung.
Die Sätze gelten laut Anmerkung zu § 16 Abs. 2 seit 2020; deshalb wird dieser
Textstand auch für Anspruchsjahr 2025 mit seinem tatsächlichen Dokumentdatum
19.03.2026 erfasst. Der zeitgenössische 2025er Beleg bestätigt die westlichen
Sätze zusätzlich. Die Quellen-IDs `caritas-avr-jsz-2025/2026` ordnen die
Jahresregel zu. Quellen für die Region-/Tabellenauswahl bleiben ausdrücklich
referenziert.

Die Referenzmatrix enthält 86 % für P4/P6/P7/P8 und 76 % für P9–P16.
P16 entspricht EG12. Anlagenspezifische Anspruchsverweise, Juli–September,
Gruppenstichtag 1. September, reguläre Novemberzahlung und Ausnahmen bleiben
als Metadaten erfasst; es wird kein persönlicher Betrag daraus berechnet.

## Quellenabweichungen

- Im ZIP-Mitglied `P11-KH-Faktenblatt Vergütung.pdf`, Seite 2, letztes
  Berufsjahr-Beispiel, steht eine 86-%-Beschriftung bei 4.069,00 EUR.
  5.353,95 EUR × 76 % ergibt gerundet 4.069,00 EUR. § 12/§ 16 ordnen P11 dem
  76-%-Band zu. Diese Regel wird in den DRAFT-Daten durch den Normtext gestützt;
  die abweichende Beschriftung ist als Belegfehler dokumentiert.
- Die P12-Zuordnungszelle auf Druckseite 286 des AVR-PDFs ist leer.
  [AVR-Online Anlage 32 § 12](https://www.avr-online.de/lambertus/avr-online/start.xav?start=%2F%2F%2A%5B%40attr_id%3D%27avr-online_normText_AVR_anl32_par12__2021-03-01%27+and+%40outline_id%3D%27avr-online_normText_AVR%27%5D)
  enthält P12 → 9c; das P12-Faktenblatt 2026 bestätigt 76 %.
  Die leere PDF-Zelle wurde zusätzlich am gerenderten Original geprüft.

Die Faktenblattbeispiele werden ausschließlich zur Satzprüfung verwendet.
Ihre Musterbeträge ersetzen keine individuelle Jahresbasis. Hashes beschreiben
die tatsächlich abgerufene Fassung; redaktionelle Quellen-/Fachfreigabe und
spätere App-Abnahme bleiben offen. Original-PDFs werden nicht ins Repository
aufgenommen.

## Rückwärtskompatibilität und Folgearbeit

Der optionale Jahresvertrag bleibt mit älteren Kandidaten ohne Jahresregeln
kompatibel. Die gemeinsame Testfixture entfernt zunächst vorhandene
Jahresregeln und ersetzt ihre normbezogenen Testquellen ausdrücklich durch
synthetische Quellen; dadurch werden Altfalltests weiter geprüft, ohne reale
Metadaten als synthetischen Beleg auszugeben.

Nächste Pakete: RK-Ost-Jahresregeln 2025/2026, bestätigte persönliche
Jahresbasis/Ansprüche/Sonderfälle, Ergebnisintegration, Referenzprüfung und
fachliche Freigabe.

## Verifikation

- 66 gezielte Jahresregel-, Vertrags-, Lookup- und West-Pakettests bestanden.
- `npm.cmd run verify:fast` vollständig bestanden: 1.071 Unit-Tests,
  472 Komponententests sowie Publisher-, Delivery-, Operator- und Policy-Tests.
- Alle 17 vorhandenen DRAFT-Kandidaten sind schema- und vertragsgültig.
- Alle 240 Kombinationen aus Jahr, Anlage, westlicher Region und P-Gruppe
  sind durch feste Quellenreferenzen geprüft.
- Für alle zehn Pakete wurde die unveränderte Übernahme sämtlicher bisheriger
  Felder und Quellen gegen `HEAD` zusätzlich maschinell geprüft.
- Genau 15 Dateien gehören zu diesem Paket; `git diff --check` ist grün.

Die erfolgreiche Prüfung bestätigt den DRAFT-Datenstand. Die fachliche
Freigabe sowie persönliche Berechnung und App-Anbindung bleiben Folgearbeit.
