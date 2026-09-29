# VG-06: Caritas-Überstunden-Stundengrundentgelt (DRAFT)

Stand: 30.09.2026. Dieser Baustein liest für Anlagen 31/32 aus dem datierten
regionalen P-Tabellenpaket den Stundenanteil des Entgelts für eine tatsächlich
geleistete Überstunde. Gemäß § 6 Abs. 1 Anmerkung zur tatsächlichen
Arbeitsleistung gilt die individuelle Stufe, höchstens Stufe 4. Die persönliche
Stufe muss in der Tabelle vorhanden sein; bei Stufe 5 oder 6 stammt der
Stundenwert aus Stufe 4. Er ist **ohne** Überstundenzuschlag.

Die [AVR-Gesamtausgabe 2026](https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/AVR_Online-PDF_2026_final.pdf)
(Anlagen 31/32 § 4 Abs. 7 und § 6 Abs. 1 sowie Anlage 1 Abschnitt IIa a)
trennt Überstundenbegriff, Entgelt für tatsächliche Arbeit und Zeitzuschlag.
Die [amtliche West-Tabellenbroschüre 2025](https://s3.eu-central-1.amazonaws.com/coverpubl-lam-01/20251/SP/AVR_Tabellen-Broschur_2025_West_WebPDF.pdf)
zeigt die P-Monatstabelle und die Stunden-/Zuschlagsspalten getrennt. Der
Stundenwert wird aus monatlichen Tabellencent `M` und regionalen
Vollzeit-Wochenminuten `W` als `M × 60.000 / (4.348 × W)` berechnet und erst
danach kaufmännisch auf Cent gerundet. Beispiel P6 Stufe 3, 39 Wochenstunden,
ab 01.07.2025: 3.271,86 € ergeben 19,29 € je Stunde ohne Zuschlag.

Die Funktion liefert Paket-, Tabellen-, Arbeitszeit- und Quellenkennungen.
Sie prüft weder Arbeitgeberanordnung noch Wochen-/Ausgleichsfrist, persönliche
vergütungspflichtige Stunden, Freizeitausgleich oder Kombinationen mit anderen
Zeitzuschlägen. Ein Überstundenanspruch, Zuschlag, Monatsbetrag und vollständiges
Brutto werden hier nicht berechnet. Caritas bleibt `DRAFT` und in der App
`UNSUPPORTED`; es gibt keine OTA.
