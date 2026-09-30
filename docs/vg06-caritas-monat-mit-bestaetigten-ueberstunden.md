# VG-06: Caritas DRAFT-Monatsteilbetrag mit bestätigten Überstunden

Stand: 30.09.2026. Basis: master `eb8e473`, Branch `codex/vg06-caritas-monthly-with-overtime`.

## Task-Vertrag

- Ziel: Den bekannten Monatsbetrag aus Tabellenentgelt und einzeln bestätigten Pflegezulagen um extern geprüfte, bar auszuzahlende Überstunden ergänzen. Grundentgelt und Zuschlag bleiben getrennte Positionen mit datierten Quellenbelegen.
- Nicht-Ziele: Vollständiges Brutto, automatische Überstundeneinstufung, Auszahlungstermin, Zeitkonto, Teilstunden, Mehrarbeit, Bereitschaft/Rufbereitschaft, Teilmonate, Stufen-/Regelwechsel im Monat, weitere Zuschläge, App-Anbindung oder Tarifaktivierung.
- Plattform: Reine TypeScript-Fachlogik; Expo SDK 57 (`~57.0.22`), [versionierte Dokumentation](https://docs.expo.dev/versions/v57.0.0/). Keine native oder visuelle Änderung; kein Gerätenachweis erforderlich.
- Dateiscope: Diese Dokumentation sowie `src/engine/caritas-care-draft-monthly-with-overtime.ts` und `.test.ts`. Bestehende Funktionen, Satzdaten, DRAFT/UNSUPPORTED-Status und App-Verbindungen bleiben unberührt.
- Abnahme: Quellengestützte Referenzsummen; getrennte Grund-/Zuschlagspositionen; stabile eindeutige IDs; Monats- und Anspruchsbestätigung; Sperre bei einem ungültigen Eintrag; fokussierte Tests, `verify:fast` und `git diff --check`.
- Git-Lieferung: Commit/Push/PR benötigen die Freigabe dieses geprüften Pakets; Merge folgt erst nach erfolgreicher CI mit eigener Freigabe. Keine Build-/OTA-Freigabe.

## Fachliche Grundlage und Grenze

Die [AVR, Stand 19.03.2026](https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/AVR_Online-PDF_2026_final.pdf), Anlage 31 und Anlage 32 jeweils § 4 Abs. 6–8 und § 6 Abs. 1, unterscheiden Mehrarbeit, Überstunden, tatsächliche Arbeitsleistung, Zuschlag und möglichen Zeitausgleich. Die fachliche Prüfung von Anordnung, Ausgleich und getrenntem Baranspruch bleibt extern. Es wird keine neue Anspruchsregel implementiert.

Die Funktion verwendet unverändert die geprüften Helfer `calculateCaritasCareDraftMonthlyComponents` und `calculateCaritasPersonalOvertime` (PR #133). Die Stundensätze stammen aus datiertem regionalem Tabellenentgelt, Vollzeit-Wochenzeit und dem bestehenden AVR-Divisor 4,348. Tabellenbelege und getrennte Berechnungsgrundlagen sind im Ergebnis unter `hourlyValues` enthalten.

Jeder Eintrag braucht:

1. Eine nicht leere, nach Entfernen äußerer Leerzeichen eindeutige `lineId`, die ein extern überprüftes Stundenkontingent bezeichnet.
2. Ein gültiges Arbeitsdatum im betrachteten Monat und dieselbe Paket-, Varianten-, Regions-, Gruppen- und Stufenauswahl wie die Monatsbasis.
3. Exakt `true` für Überstundeneinstufung und Stundenbestätigung sowie getrennt `CONFIRMED_CASH` für Grundentgelt und Zuschlag.
4. Exakt `true` für `monthlyAllocationConfirmed`: Die externe Prüfung hat die Barposition diesem Monat zugeordnet und bestätigt, dass sie weder in den Monatspositionen noch in einem anderen Überstundeneintrag enthalten ist.

Es werden nur volle Stunden von 1 bis 24 pro Eintrag akzeptiert, zusammen höchstens 24 pro Arbeitsdatum. Diese Plausibilitätsgrenze ist keine Arbeitszeitrecht-Bewertung. Verschiedene IDs beweisen keine Überschneidungsfreiheit; dafür ist die externe Bestätigung erforderlich. Ein fehlender oder gesperrter Eintrag macht den gesamten zusätzlichen Teilbetrag nicht verfügbar. Eine leere Liste behauptet keinen geprüften Nullanspruch.

Der Monatsfilter ist eine bewusst enge technische Voraussetzung. Er ermittelt keinen Auszahlungstermin aus dem Arbeitsdatum. Nachzahlungen für frühere Arbeitsmonate und automatische Zuordnung zu Abrechnungsmonaten bleiben offen.

## Referenzfälle

[Gedruckte West-Tabellen, Juli 2025](https://s3.eu-central-1.amazonaws.com/coverpubl-lam-01/20251/SP/AVR_Tabellen-Broschur_2025_West_WebPDF.pdf), PDF-Seiten 10/11 (38,5/39 Stunden), sowie die geprüften regionalen DRAFT-Pakete:

- BW, Anlage 32, P6/Stufe 3, 39 h, Oktober 2025: Tabelle 3.271,86 EUR + bestätigte Pflegezulagen 35,00 EUR und 137,96 EUR = 3.444,82 EUR. Drei plus zwei bestätigte Überstunden: Grundentgelt 96,45 EUR + Zuschlag 28,95 EUR = 125,40 EUR. Bekannter Teilbetrag: **3.570,22 EUR**.
- Gleiche Auswahl mit 19,5 h/Woche: Monatspositionen 1.722,41 EUR + unverändert 125,40 EUR für die fünf bestätigten Barstunden = **1.847,81 EUR**. Keine zusätzliche Teilzeitquote auf die bestätigten Überstunden.
- P6/Stufe 6: Monatstabelle bleibt Stufe 6; allein der Überstunden-Grundsatz ist auf Stufe 4 begrenzt. Fünf Stunden ergeben 107,20 EUR Grundbetrag + 28,95 EUR Zuschlag.
- Bayern, Anlage 31, 38,5 h, P6/Stufe 3: zwei Stunden = 39,10 EUR + 11,74 EUR = **50,84 EUR**.
- RK Ost, Ost-Tarif, Anlage 32, P6/Stufe 3, Oktober 2025: Tabelle 3.225,10 EUR ohne bestätigte Pflegezulagen + zwei Stunden 49,46 EUR = **3.274,56 EUR**.

Das Ergebnis heißt `draft-known-monthly-components-with-overtime`, enthält `completeGross: false` und nennt ausgeschlossene Schichtzulagen, Zeitzuschläge, weitere Überstundenfälle, Jahressonderzahlung und lokale Bedingungen. Es ist kein Caritas-Gehalt in der App.
