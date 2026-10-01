# VG-06: Caritas-Jahresbasis bei spätem Eintritt (DRAFT)

## Auftrag und Abnahme

- Ziel: Für bestätigten Eintritt nach dem 30. September den ersten vollen Kalendermonat des Dienstverhältnisses bestimmen und dessen bestätigten persönlichen §16-Basisbetrag unverändert als Jahresbasis liefern.
- Plattform: reine TypeScript-Fachlogik für das bestehende Expo-Projekt, installierte Version `~57.0.22`; Referenz [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/).
- Dateiscope: dieses Dokument sowie `src/engine/caritas-annual-payment-late-entry-basis.ts` und dessen gleichnamige Testdatei.
- Abnahme: echte DRAFT-Kandidaten für alle sechs Regionalkommissionen, beide Anlagen und 2025/2026; kalendergenaue Eintrittsgrenzen, bestätigte Quellenidentität, sichere ganzzahlige Centbeträge und Kopien der Eingaben; ungültige oder unbestätigte Angaben bleiben nicht verfügbar.
- Nicht-Ziele: Gruppenstichtag/Bemessungssatz bei spätem Eintritt, Anspruch am 1. Dezember, Anlage-31-Frühaustritt, Zwölftelung/Ausnahmen, Elternzeit, Auszahlung, vollständiges Brutto, UI, Backend-Aktivierung, OTA oder Store-Veröffentlichung.
- Keine native oder visuelle Änderung. Die spätere App-Anbindung braucht weiterhin Fachfreigabe und Geräteabnahme.

## Quellen und Auslegung

Datiertes Original des Deutschen Caritasverbandes/Lambertus:

| Stand      | Quelle                                                                                                  | Anlage 31 / Anlage 32                         | SHA-256                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------ |
| 01.07.2025 | [AVR 2025](https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/AVR-PDF_Version_2025.pdf)      | gedruckte Seiten 264 / 301, §16 Abs. 2 Satz 3 | `a4f8dea02fb84ba4f203a753bd362d82dec8ad8953f3befed99ac65e65ec2637` |
| 19.03.2026 | [AVR 2026](https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/AVR_Online-PDF_2026_final.pdf) | gedruckte Seiten 255 / 291, §16 Abs. 2 Satz 3 | `cb6fc32981eb120d5c05e68d6563725436001409e9bc728bc47d52d08d705aa7` |

Die Originale ersetzen für Dienstverhältnisse mit Beginn nach dem 30. September den üblichen Referenzzeitraum durch den ersten vollen Kalendermonat. Beide Fassungen und Anlagen wurden am 01.10.2026 direkt geprüft; die Hashes stimmen mit den vorhandenen Originaldateien überein.

Satz 2 nennt zugleich die Entgeltgruppe am 1. September. Satz 3 enthält hier keine ausdrückliche Ersatzgruppenregel. Die fachliche Anwendung des Prozentsatzes bei spätem Eintritt bleibt deshalb offen. Die Funktion hat bewusst keine Gruppeneingabe und gibt weder einen Gruppenstichtag noch einen Prozentsatz aus. Sie übernimmt keine Einstellungstagsregel aus TV-L, Lehrkräfte-Anlagen oder AVR 2027.

Die bestehende datierte regionale Jahresbasisregel wird validiert: RK-Ost-Tarifgebiet Ost verwendet für 2025 die dokumentierte Westbasis; 2026 gilt die dokumentierte Basis des gewählten Tarifgebiets. Der historische persönliche Betrag und eine notwendige Westanpassung müssen extern bestätigt werden. Ein Tabellenverweis beweist keinen individuell gezahlten Betrag.

## Eingabe und Ergebnis

`calculateCaritasAnnualPaymentLateEntryBasis` akzeptiert:

- gültiges DRAFT-Paket mit Engine-Vertrag 14 und ausschließlich `UNSUPPORTED`-Fähigkeiten;
- Anspruchsjahr 2025 oder 2026 sowie Anlage und Tarifgebiet;
- Fall `LATE_ENTRY`, bestätigten Referenzfall, bestätigten Eintrittstag und Identität des Dienstverhältnisses;
- genau den abgeleiteten ersten vollen Monat mit bestätigtem Entgelt für den ganzen Kalendermonat, bestätigter §16-Zusammensetzung, persönlichem Basisbetrag und passender Jahresbasisregion/-tabelle.

Bei Eintritt am ersten Tag gilt derselbe Monat; bei späterem Eintritt der Folgemonat. Beispiele: 01.10. → Oktober, 02.10./31.10. → November, 30.11. → Dezember, 01.12. → Dezember. Ein Beginn am 30.09. ist kein später Eintritt im Sinne dieses Bausteins.

Für spätere Dezember-Eintritte liegt der erste volle Monat im Folgejahr. Diese Kombination bleibt ausdrücklich `FIRST_FULL_MONTH_OUTSIDE_YEAR`: Es gibt hier keine automatisch gewählte Folgejahresbasis und keine implizite 2027-Unterstützung. Auch die Anspruchsfrage wird daraus nicht abgeleitet.

Das ganze Referenzmonat muss von der Paketgültigkeit gedeckt sein. Fehlende Normquellen, unvollständige Jahresregel-Abdeckung, andere Anlagen/Tarifgebiete und widersprüchliche Basisidentitäten werden abgewiesen. Datumswerte sind kanonische, tatsächlich existierende `YYYY-MM-DD`-Werte im Anspruchsjahr; Bestätigungen müssen exakt `true` sein.

Erfolg liefert `personal-annual-payment-late-entry-basis`, `draft: true`, `completeGross: false` und den unveränderten persönlichen Betrag als exakte Centbasis mit Nenner 1. Keine zweite Teilzeitquote, kein Drei-Monats-Divisor, kein Faktor 30,67, keine Prozentsatzmultiplikation oder Zwölftelung.

`sourceBasis` dokumentiert Paket/Version, Jahr, Anlage, ausgewähltes Tarifgebiet, Jahresbasisregion/-tabelle, Basisrichtlinien, alle zugehörigen Jahresregel-IDs und deren vereinigte Quellen-IDs. Diese gruppenfreie Herkunft ist kein anwendbarer persönlicher Bemessungssatz. Monatsdaten und Quellenlisten werden unabhängig kopiert; zusätzliche Eingabefelder werden nicht übernommen.

## Prüfungen

- Neue Referenzmatrix: 32 Kombinationen aus acht Tarifgebieten, zwei Anlagen und zwei Jahren, jeweils sieben unabhängig vorgegebene Eintritts-/Monatsfälle = 224 Kombinationen.
- Gezielte Prüfungen: Bestätigungen, Monats-/Datumsgrenzen, Dezember/Folgejahr, Ost-2025-Westbasis, Paket-/Quellenfehler, sichere Centgrenzen, Eingabeschutz und keine Gruppen-/Auszahlungsfelder.
- Bestehende reguläre, Teilmonats- und Ersatzmonatsbasis sowie Jahresregel-Abfrage laufen im gemeinsamen Testaufruf mit.
- Am 01.10.2026 bestanden: fünf gezielte Suiten mit 208 Tests, davon 72 neue Fälle; `npm.cmd run verify:fast` mit 1.275 Unit- und 472 Komponententests; alle 17 Katalogkandidaten gültig. Vertragsgenerierung, Typprüfung, Lint ohne Warnungen, Format, Katalog-/Operator-/Policytests und Diff ebenfalls grün.

## Weiter offen

- Fachlich belegte Ersatzgruppenregel für späten Eintritt und Folgejahresbezüge.
- Persönlicher Anspruch, Zwölftelung/Ausnahmen und Rundung/Auszahlung der Jahressonderzahlung.
- Elternzeit-/Geburtsjahr und Anlage-31-Frühaustritt als gesonderte Basisfälle.
- Unabhängige Fachreferenzen, Verantwortungsfreigabe, App-Anbindung und Preview-/Geräteabnahme.
