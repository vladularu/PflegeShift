# Caritas: ergänzender Policy-Vertrag

Stand: 2026-10-04. Zehn-Dateien-Teilpaket des erhaltenen Gesamtauftrags.

## Ziel und Dateiscope

Das bestehende Vertrag-14-Schema erhält ausschließlich die drei ursprünglichen optionalen Caritas-Policies für Zeitzuschläge, bestätigte Überstunden und Jahressonderzahlung. Beide generierten Vertragsdateien werden daraus neu erzeugt. Die ursprüngliche vollständige Caritas-Pflegevalidierung und ihr vollständiger Vertragsreferenztest ergänzen die vorhandene Tabellen-/Jahresvalidierung. Hinzu kommen eine reine synthetische Policy-Testfixture, deren Konsistenztest und dieser Beleg. Plattformunabhängig; sichtbare App, Katalogverteilung und native Integration sind getrennt.

Die bestehenden Satz- und Jahresregelstrukturen werden von beiden Allowlists ausdrücklich akzeptiert und weiter durch ihre bisherigen Validatoren geprüft. Keine bestehende Regel wird ersetzt. Die vollständige ursprüngliche Pflegevalidierung bleibt fachlich erhalten; zwei vorhandene Strukturbezeichner sind ihre einzige kompatible Ergänzung. Regionale Pakete und Geldbeträge werden in diesem Teilpaket nicht geändert. Der historische Wochenzeitvergleich für Ost/West-Berlin stimmt nach exaktem Vergleich bereits mit master überein.

## Abnahme und Quellen

Alle ursprünglichen Vertragsfälle sowie zusätzliche Referenzen gegen widersprüchliche Datumsgrenzen, unbekannte Quellen, fremde Verträge, doppelte Überstundengruppen und unvollständige Jahresbänder. Pflichtcheck verify:fast und sieben grüne CI-Prüfungen vor Merge.

Drei Primär-PDFs wurden am 04.10.2026 frisch geladen; die aufgezeichneten SHA-256-Prüfsummen stimmen:

- [AVR Gesamtausgabe 2025/1](https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/AVR-PDF_Version_2025_1.pdf): 6b02381f7424744c1c8a5c60c55c65ab8a77c64f22444740e1e7be950117a6fc.
- [AVR Gesamtausgabe Stand 19.03.2026](https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/AVR_Online-PDF_2026_final.pdf): cb6fc32981eb120d5c05e68d6563725436001409e9bc728bc47d52d08d705aa7.
- [DCV Zeitzuschläge 2026](https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/Zeitzuschlagstabellen2026_AVR_und_bundesweite_Feiertage_31.10.2025_.pdf): 0e0869710b087a72ee3452d2caf9d65e1234f16e50b8d93a6c59989e3e12ade4.

Die vorhandenen Quellenbezeichner und Prozentwerte bleiben an diese Normstellen gebunden. Die historische Beschränkung bis Ende 2026 wird nicht verlängert.

## Grenzen

Die Policies sind optional und werden hier ausschließlich in einer Testfixture eingetragen. Caritas-Komponenten bleiben UNSUPPORTED, Pakete DRAFT. Regionale Ergänzungen, persönliche Monatsfunktionen, VG-06-Jahreswechsel 2027, unabhängige Fachfreigabe und Geräteabnahme bleiben offen. Keine Aktivierung oder OTA.

## Kompatibilität der historischen Vertragsfixture

Die ursprünglichen 39 Vertragsfälle bleiben vollständig erhalten. Die synthetische Ost-Fixture verwendet nun den bereits verbindlichen regionalen Periodenbeginn 01.01.2026; westliche Fixtures bleiben auf 01.02.2026. Diese einzelne Fixture-Datumsanpassung ändert keine tatsächlichen Tabellen oder Wochenzeiten.
