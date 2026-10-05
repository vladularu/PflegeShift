# Einfache TVA-L-Pflegeberechnung

Stand: 05.10.2026, iPhone, Expo ~57.0.22; https://docs.expo.dev/versions/v57.0.0/.

## Auftrag und Abnahme

TVA-L Pflege im bisherigen Formular und der kompakten Auswertung, wie die bereits gelieferten Tarife. Geltungsbereich dieses Adapters: dreijährige Pflegeausbildung an Universitätskliniken mit TV-L. Ausbildungsjahr und Tarifgebiet West/Ost sind die Tarifangaben. Vollzeit wird datiert eingesetzt. Tabellenwechsel folgen dem Auswertungsmonat.

Arbeitspakete: 1. Rechenkern und unabhängige Tabellenreferenz (sieben Dateien); 2. Speicherung/Backup/Validierung; 3. Rechenadapter und bestehende Auswertung; 4. vorhandenes Formular und Preview. Das Rechenpaket extrahiert die bisherige TV-L-Dienstzeitberechnung in einen gemeinsamen Helfer; vorhandene TV-L-Ergebnisse müssen unverändert bleiben. Weitere Tarifparameter und Quellen bleiben tarifspezifisch.

Abnahme: alle 15 Tabellenwerte aus fünf Paketen; Ausbildungsjahre 1–3, West-/Ost-Vollzeit mit datiertem Wechsel, Teilzeit, Nacht-/Kalenderzuschläge, Schichtzulagenanteil 75%, bestätigte zahlbare Überstunden, Rundung, Pausen, Monatswechsel und Sommerzeit. Danach Speichern/Neustart, Tarifwechsel, Backup und bisherige Monats-/Jahresansicht. Jugendprüfung bleibt der eigene Schalter. Git und interne Preview sind durch die bestehenden Freigaben autorisiert; UI-Merge erst nach echtem iPhone-Test.

## Quellen und Wiederverwendung

Die zuvor vorbereiteten DRAFT-Pakete werden lokal validiert und begrenzt wiederverwendet. Die verworfenen historischen Eingabeflüsse werden nicht übernommen. Remote-Katalog und Reviewmetadaten bleiben getrennt.

Am 05.10.2026 von der offiziellen TdL-Seite neu geladen:

- TVA-L Pflege, ÄTV13 vom 14.02.2026, §§8(1,4,5), 7; https://www.tdl-online.de/fileadmin/downloads/TV-Ausbildung/TVA-L-Pflege/260804_TVA-L_Pflege_i.d.F._des_%C3%84TV_Nr._13.pdf ; SHA256 0d6e0db4974150534f96cc5745a93330c8b4f6524629753cb09607e4e80eb1c4. Alle Ausbildungsentgelte unabhängig aus dem PDF extrahiert und als separate Testreferenz gespeichert.
- TV-L, ÄTV14 vom 14.02.2026, §§7,8,24,43; https://www.tdl-online.de/fileadmin/downloads/TV-L/260812_TV-L__i.d.F._des_%C3%84TV_Nr._14_VT_neu.pdf ; SHA256 2bde4df4e29900e29e92c0cf6ea1d1fb26044e400045b7f3956cae83a0988277.

## Fachlicher Umfang

Grundentgelt nach Ausbildungsjahr und persönlicher Arbeitszeit. Zuschläge aus vollem Ausbildungsentgelt und tariflicher Vollzeitbasis (Faktor4,348), jeweils centweise Stundenbasis, Stunden-Zuschlag und Endbetrag. Nacht20%, Sonntag25%, Feiertag35%/135%, 24./31.12.ab6Uhr35%, Samstag13–21Uhr20% bzw.0,64 Euro in Schichtarbeit. Höchster Kalenderzuschlag plus Nacht. Nur bestätigte zahlbare Überstunden mit30%. Schicht-/Wechselschichtzulage nach Krankenhausregelung zu75%, erst Satzanteil dann persönlicher Anteil. Kein Nacht-Mindestbetrag aus TVAöD. Keine allgemeine TV-L-Pflegezulage für Auszubildende: §8(5)a verweist auf Vorbemerkungen9–11, nicht Nr8.

Nicht Bestandteil dieses einfachen Monatsadapters: Pflegefachassistenz ab2027, individuelle Funktions-/Tätigkeitszulagen, Bereitschaft/Rufdienst, Jahressonderzahlung oder untermonatige Beschäftigungswechsel. Die Ausgabe ist eine Brutto-Schätzung der enthaltenen Bestandteile. Sonderzahlungen bleiben wie bei den anderen neu angebundenen Tarifen ein eigenes Arbeitspaket.

## Prüfung des Rechenkerns

Am 05.10.2026: 386 gezielte Tests (60 TVA-L-Fälle und 326 bestehende TV-L-Fälle) bestanden. Vollständiges `verify:fast` grün: 7.275 Unit-Tests plus die bestehenden Komponenten- und Skriptprüfungen. Genau sieben Code-/Test-/Belegdateien, keine App-Aktivierung in diesem Rechenpaket.

## Speicherung

- Ausbildungsjahr und West/Ost-Auswahl als eigene, strikt validierte Benutzerpraeferenz.
- Profil und Tarifpraeferenzen werden in derselben Transaktion geschrieben; jeder andere Gehaltsmodus entfernt die TVA-L-Auswahl.
- Arbeitszeitbearbeitung und Neustart erhalten die Auswahl. Backup/Restore nimmt sie auf, aeltere Backups entfernen spaeter gespeicherte TVA-L-Angaben.
- Keine native Aenderung, neue DB-Migration, Geburtsdatum oder datierte Verguetungshistorie.
- Gesamte Datenbanksuite: 943 Tests in 77 Dateien gruen, einschliesslich Fehler-Rollback und widerspruechlicher Backups.

## Auswertung

- Einfache Monats- und Jahresauswertung liefern TVA-L als Tarifgehalt, mit Ausbildungsentgelt und gruppierten Zeitzuschlaegen.
- Zulagenmuster nutzt die TV-L-Definitionen des laufenden Monats; TVA-L-eigene 75-Prozent-Saetze bleiben im Rechenkern.
- Keine Beschaeftigten-Pflegezulage, TVoeD-Zulage oder TVAOeD-Nacht-Untergrenze.
- Der gemeinsame Monatscache wird auch beim Wechsel von Auswertung zu Gehalt wiederverwendet.
- 50 gezielte Adapter-, Jahres-, Muster- und Cachepruefungen gruen; Jahresbasis 2026 im 1. Ausbildungsjahr 17.108,40 Euro.
