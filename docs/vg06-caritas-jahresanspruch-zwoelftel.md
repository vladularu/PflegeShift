# VG-06: Caritas-Jahresanspruch und Zwölftelkürzung (DRAFT)

## Task-Vertrag

- Ziel: Für ein extern bestätigtes einzelnes Dienstverhältnis den Jahresanspruch nach §16 Abs. 1/6 beurteilen und aus zwölf bestätigten Monatsnachweisen den unabhängigen Kürzungsfaktor nach Abs. 4 bilden.
- Nicht-Ziele: persönlicher Gruppenstichtag, Bemessungssatz, Jahresbasis-Sonderfälle, endgültiger Centbetrag/Rundung, mehrere Dienstverhältnisse oder Dienstgeberwechsel, automatische Feststellung von Ansprüchen aus Schichten, App-/Backend-Aktivierung, OTA und Store-Lieferung.
- Plattform: reine TypeScript-Fachlogik; installiertes Expo `~57.0.22`, [versionierte SDK-57-Dokumentation](https://docs.expo.dev/versions/v57.0.0/) geprüft. Keine native oder visuelle Änderung; spätere App- und Fachabnahme bleiben erforderlich.
- Dateiscope: dieses Dokument, `src/engine/caritas-annual-payment-entitlement.ts` und die gleichnamige Testdatei. Bestehende Bausteine und Katalogdaten bleiben unverändert.
- Abnahme: echte Quellenkandidaten aller sechs Regionalkommissionen, Anlagen 31/32 und 2025/2026; 01.12.-Grenzen und Anlage-31-Austritt; vollständige eindeutige Monatsliste, Teilmonate mit wenigstens einem bestätigten Entgelttag, alle fünf Ausnahmeformen einschließlich ihrer Voraussetzungen, exakter Faktor ohne Geldrechnung und unabhängige Ergebniskopien. Unsicherheit oder widersprüchliche Angaben bleiben nicht verfügbar.
- Git-Lieferung: Commit, Push, PR und Merge nach sieben grünen CI-Prüfungen durch bestehende dauerhafte Nutzerfreigabe für den Gesamtauftrag gedeckt.

## Normquellen

| Originalstand | Original                                                                                                | Anlage 31 / Anlage 32, §16 Abs. 1/4/6                    | SHA-256                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------ |
| 01.07.2025    | [AVR 2025](https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/AVR-PDF_Version_2025.pdf)      | gedruckte Seiten 264–265 / 301–302; Abs. 6 nur Anlage 31 | `a4f8dea02fb84ba4f203a753bd362d82dec8ad8953f3befed99ac65e65ec2637` |
| 19.03.2026    | [AVR 2026](https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/AVR_Online-PDF_2026_final.pdf) | gedruckte Seiten 255–256 / 291–292; Abs. 6 nur Anlage 31 | `cb6fc32981eb120d5c05e68d6563725436001409e9bc728bc47d52d08d705aa7` |

Beide Originaldateien wurden am 02.10.2026 lokal seitenbezogen gelesen und ihre SHA-256 geprüft. Der Webabruf des 2025-Originals schlug an diesem Tag fehl; die bereits vorhandene hashgeprüfte Originaldatei war verfügbar. Die 2026-Fassung wurde zusätzlich über die Original-URL geöffnet. Regeln anderer Tarifwerke und AVR 2027 wurden nicht übernommen.

Für das gewählte Jahr werden alle passenden validierten Jahresregeln zusammen als gruppenfreie Herkunft verwendet: Paket/Version, Anlage, Tarifgebiet, Anspruchs-/Kürzungsrichtlinie, Regel-IDs und vereinigte Quellen-IDs. Diese Herkunft wählt keinen persönlich anwendbaren Prozentsatz.

## Anspruch und Kürzung

Ein bestätigtes Dienstverhältnis am 1. Dezember erfüllt den Stichtag; Eintritt und letzter Diensttag zählen einschließlich. Anlage 31 erhält den Anspruch außerdem bei einem Ende vor dem 1. Dezember innerhalb des Anspruchsjahrs. Anlage 32 hat in den geprüften Fassungen keine entsprechende Austrittsregel. Frühere abgeschlossene Jahre und erst nach dem Stichtag beginnende Verhältnisse werden nicht als Anspruch des aktuellen Jahrs behandelt.

Jeder Monat ohne Entgelt-/Fortzahlungsanspruch kürzt um ein Zwölftel. Mindestens ein bestätigter Anspruchstag erhält das Monatszwölftel; reine Schichtplanung oder tatsächlicher Zahlungszeitpunkt ersetzen diesen Nachweis nicht. Die Funktion prüft die Tageszahl auch gegen die maximale Beschäftigungsdauer im Monat.

Für Monate ohne solche Anspruchstage können bestätigte Ausnahmen das Zwölftel erhalten:

- Grundwehr-/Zivildienst: fehlendes Tabellenentgelt wegen dieses Dienstes, Ende vor dem 1. Dezember und unverzügliche Wiederaufnahme bestätigt; ein Ausnahmemonat kann nicht nach dem Dienstende liegen. Dienstende und Wiederaufnahme müssen zeitlich zum bestätigten einzelnen Dienstverhältnis passen.
- Beschäftigungsverbot nach Mutterschutzgesetz: Rechtsgrund und fehlendes Tabellenentgelt deswegen bestätigt.
- Elternzeit nach BEEG: fehlendes Tabellenentgelt deswegen und vorheriger Entgeltanspruch bestätigt; Geburt im Anspruchsjahr und Monat nicht vor der Geburt; eine Geburt nach dem letzten Beschäftigungstag kann keine Ausnahme dieses Dienstverhältnisses begründen.
- gezahlter Krankengeldzuschuss: qualifizierender Monatsnachweis bestätigt;
- nur wegen der Krankengeldhöhe nicht gezahlter Krankengeldzuschuss: ausschließlich dieser Ausschlussgrund bestätigt.

Der Militärdienst-Typ bezeichnet ausschließlich Grundwehrdienst oder Zivildienst nach dieser Vorschrift, keine freiwilligen Militärdienste.

Die Ausnahmevoraussetzungen werden extern fachlich bestätigt. Die Funktion leitet weder eine Krankheit, Elternzeit oder ein Beschäftigungsverbot aus Kalendereinträgen ab noch bewertet sie selbst die Unverzüglichkeit. Unbestätigte, unbekannte oder zeitlich unmögliche Ausnahmeangaben bleiben nicht verfügbar. Ausnahme-Nachweise sind in diesem Vertrag nur für Monate ohne Entgelt-/Fortzahlungstage vorgesehen; bei vorhandenen Tagen wird kein zusätzlicher Ausnahmegrund gebraucht.

## Ergebnis und Grenzen

Die DRAFT-Ausgabe trennt Anspruchsentscheidung und Kürzungsfaktor. Auch bei nicht erfülltem Stichtag kann ein rein rechnerischer Monatsfaktor größer als null vorliegen; dieser begründet keinen Anspruch. Der Faktor ist die Zahl erhaltener Monatszwölftel über 12, mit getrennten Monatsentscheidungen und Zahl gekürzter Monate. Keine Prozent- oder Geldmultiplikation und keine Rundung.

Genau zwölf eindeutige kanonische `YYYY-MM`-Nachweise desselben Jahrs sind nötig. Beschäftigungsdaten müssen tatsächlich existierende `YYYY-MM-DD`-Werte ab 1900 sein; unbekanntes Ende ist als ausdrücklich bestätigtes offenes Ende `null` darstellbar. Ein bestätigter einzelner Zeitraum muss lückenlos dasselbe Dienstverhältnis beschreiben; mehrere Verträge, Unterbrechungen und Wechsel brauchen spätere eigene Modelle.

Die folgende zusätzliche Sperre ist eine Konsistenzableitung für diese Eingabeform aus der AVR-Voraussetzung des vorherigen Entgeltanspruchs und dem frühesten Elternzeitbeginn laut [Familienportal des Bundes](https://familienportal.de/familienportal/familienleistungen/elternzeit/faq/wie-kann-ich-die-dauer-der-elternzeit-berechnen--124832). Mehrere Kinder, Geburt während schon bestehender Elternzeit, Adoption und Pflegekinder liegen außerhalb dieses Einzelfallvertrags.

Eine Geburt nach dem Monatsersten ist für die Elternzeit-Ausnahme mit null Entgeltanspruchstagen in diesem Monat nicht unterstützt: Elternzeit dieses Kindes beginnt frühestens bei Geburt, der bestätigte Entgeltanspruch unmittelbar davor würde dann in denselben Monat fallen. Geburt am Monatsersten oder in einem früheren Monat bleibt mit passenden Bestätigungen möglich.

Die Ausgabe bleibt `draft: true`, `completeGross: false`, ohne Jahresbetrag oder vollständiges Brutto. Anlage-31-Austrittsanspruch beweist noch nicht die besondere letzte Vollmonatsbasis. Gruppenauswahl bei spätem Eintritt, Elternzeit-Basis und endgültige Auszahlung bleiben offen.

## Prüfungen

- Am 02.10.2026 bestanden: drei gezielte Suiten mit 165 Tests, davon 76 neue Fälle. Die regionale Matrix umfasst 256 Anspruchs- und 160 Ausnahme-Kombinationen.
- `npm.cmd run verify:fast` vollständig grün: 1.351 Unit-, 472 Komponententests; alle 17 Katalogkandidaten gültig. Vertragsgenerierung, Typen, Lint ohne Warnungen, Format, Katalog-/Operator-/Policytests und Diff bestanden.
- Zeitliche Regressionen für Dienstende vor Beschäftigungsbeginn und Geburt nach Austritt zunächst reproduziert und anschließend gesperrt. Dienstende nach Austritt und widersprüchlicher Geburtsmonat ebenfalls geprüft.
- Bestehende Jahresregel-Abfrage und gruppenfreie Späteintrittsbasis in den fokussierten Tests mitgeprüft. Kein bestehender Baustein oder Kandidat geändert.
