# VG-06: Persönliche Caritas-Jahresbasis im regulären Bemessungsfall

## Task-Vertrag

Stand: 01.10.2026. Branch: `codex/vg06-caritas-personal-annual-basis`.
Basis: `83370df` (PR #140). Zielplattform: reine TypeScript-Fachlogik.
Expo aus `package.json`: `~57.0.22`; passende SDK-57-Dokumentation gelesen.

Ziel: Aus drei extern bestätigten persönlichen Entgeltbasen für vollständige
Monate Juli, August und September einen exakten Durchschnitt für die
Caritas-Jahreszahlung ableiten. Die datierte Jahresregel, Septembergruppe und
regionale Tabellenbasis werden verknüpft; unbekannte Angaben bleiben gesperrt.

Dateiscope: genau drei neue Dateien:

- `src/engine/caritas-annual-payment-regular-basis.ts`
- `src/engine/caritas-annual-payment-regular-basis.test.ts`
- dieser Beleg.

Nicht-Ziele: Ableitung bezahlter Entgelte aus den bisherigen unvollständigen
Monatsteilbeträgen, Sonderbemessung, Anspruch, Kürzung, Jahresbetrag,
Datenbank-/Profilfelder, App-Anbindung, Aktivierung, Build und OTA.
DRAFT und alle Katalogfähigkeiten bleiben UNSUPPORTED.
Abnahme: alle sechs Regionalkommissionen, Anlagen 31/32 und 2025/2026;
Monats-/Tabellenidentität, Bestätigungen, Centbruchteile, ungültige Beträge,
Überlauf, fehlende Jahresregeln und Quellen sowie unveränderte Inputs prüfen.
Gezielte Tests, `verify:fast` und sieben grüne PR-CI-Prüfungen vor Merge.
Keine UI-/Native-Änderung, kein Gerätebild erforderlich. Die dauerhafte
Git-Freigabe des Nutzers umfasst Commit, Push, PR und Merge im Gesamtauftrag.

## Quellen und fachliche Grenze

- [AVR-Originaltext 01.07.2025](https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/AVR-PDF_Version_2025.pdf),
  SHA-256 `a4f8dea02fb84ba4f203a753bd362d82dec8ad8953f3befed99ac65e65ec2637`:
  Anlagen 31/32 § 16 Abs. 2 und Anmerkung 1, Druckseiten 264/301.
- [AVR-Originaltext 19.03.2026](https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/AVR_Online-PDF_2026_final.pdf),
  SHA-256 `cb6fc32981eb120d5c05e68d6563725436001409e9bc728bc47d52d08d705aa7`:
  Druckseiten 255 und 291/292. Dieselben normalen Bemessungsschritte.

§ 16 Abs. 2/Anmerkung 1 verwenden die drei gezahlten Monatsentgelte und
Division durch drei, auch bei geänderter Arbeitszeit. Bestimmte zusätzliche
Mehrarbeits-/Überstundenentgelte, Leistungszulagen und Prämien gehören nicht
in diese Basis; die tariflichen Ausnahmen müssen extern geklärt sein.
Die Funktion sortiert keine Gehaltsbestandteile automatisch aus. Jeder
Eingangsbetrag muss als persönliche, nach § 16 bereinigte Basis bestätigt sein.

Unterbrochene Entgelttage, Krankengeldzuschuss, weniger als 30 Entgelttage,
später Eintritt, Elternzeit im Geburtsjahr und frühes Ausscheiden sind andere
Bemessungsfälle. Nur `ORDINARY_FULL_MONTHS` mit bestätigter Anwendbarkeit wird
unterstützt. Eine Fallbezeichnung allein genügt nicht. Für jeden der drei
Monate muss vollständiger kalendermonatlicher Entgeltanspruch bestätigt sein.

## Daten- und Rechenvertrag

Die Septembergruppe muss ausdrücklich für den 01.09. bestätigt sein.
Die normale ausgewählte Tarifregion bleibt von der Jahresbasis getrennt:
RK Ost/Tarifgebiet Ost verwendet 2025 die belegte West-Jahresbasis und ab 2026
seine gewählte Basis. Jeder Monatsbeleg muss genau die vom Jahreslookup
vorgegebene Basisregion und Tabellen-ID nennen; ein normaler Ost-Monatsteilbetrag
wird nicht stillschweigend als West-Jahresbasis übernommen.

Ein Datensatz wird genau einmal für jeden Monat erwartet. Die Eingabereihenfolge
ist beliebig, das Ergebnis chronologisch. Beträge sind positive sichere ganze
Centzahlen; die Summenaddition prüft vor jeder Addition den Überlauf.
Das Ergebnis hält den Mittelwert als `numeratorCents / denominator` mit
Nenner 3 fest. Es wendet keinen Jahressatz an und rundet den Durchschnitt nicht
vorzeitig. Bestätigte Teilzeitwerte werden nicht noch einmal gekürzt.

Der Ausgang enthält kopierte Monatspositionen, die vollständige datierte
Jahresregel und deren Quellen. Persönliche Lohnbelege werden durch die
Bestätigungen weder gespeichert noch unabhängig verifiziert.
`draft: true` und `completeGross: false` bleiben sichtbar; es gibt keinen
Anspruchsnachweis, Jahresbetrag oder Gehaltsausgabepfad.

## Folgearbeit

Alternative Bemessungsfälle, bestätigter Anspruch, Zwölftel-Kürzung,
abschließender Jahresbetrag und Ergebnisintegration folgen separat.
Fachreview, App-Eingaben, Katalogfreigabe und Preview-/iPhone-Abnahme bleiben offen.

## Verifikation

Am 01.10.2026 lokal auf `83370df0a40fa025ed444502f7a5cc033413309c`:

- Fünf gezielte Testsuiten: 103 Tests bestanden. Die neue Suite enthält
  34 Fälle; ihre regionalen Referenzfälle prüfen 384 Kombinationen aus
  Jahr, Anlage, Tarifgebiet und P-Gruppe.
- `npm.cmd run verify:fast`: vollständig bestanden, darunter 1.118 Unit-
  und 472 Komponententests sowie sämtliche Publisher-, Delivery-,
  Produktionsoperator-, Audit-, Runtime- und Build-Abhängigkeitstests.
- Regelprüfung: alle 17 DRAFT-Kandidaten gültig; generierte Verträge aktuell.
- TypeScript, Lint mit null Warnungen, Prettier und `git diff --check` grün.
- Dateiscope: genau die drei oben genannten neuen Dateien.

Die Prüfungen belegen den Rechenvertrag und seine Sperren. Sie ersetzen weder
Fachreview noch persönliche Belege, Anspruchsprüfung oder Geräteabnahme.
