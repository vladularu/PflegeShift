# TV-H Pflege in der einfachen Gehaltsansicht

## Auftrag und Abnahme

Ziel: TV-H Pflege (KR5–KR16) als weitere ausdrücklich wählbare Berechnung in der bisherigen einfachen Gehaltsansicht, offline auf iOS. Gruppe, gültige Stufe (KR5/KR6: 1a/1b/2–6; übrige: 2–6) und tarifliche Vollzeit (38,5 oder 40 Stunden) bleiben die einzigen Tarifangaben. Tabellenwechsel folgen dem ausgewerteten Monat.

Nicht im Auftrag: eine automatische Einstufung anhand eines Studiums, Haustarife einzelner hessischer Kliniken, E-Tabelle/Ärzte/TVA-H, neue Historien- oder Datumsformulare, native Abhängigkeiten, Production-Veröffentlichung. TV-H ist kein Sammelbegriff für alle hessischen Uniklinikverträge. Alt-Arbeiter-Sonderregeln nach §38(4) Satz1 werden nicht als heutiger Normalfall unterstellt.

Pakete (jeweils unter 15 Dateien): 1. Berechnung, Tabellen und unabhängige Referenzen (6 Dateien); 2. Speicherung/Backup/Validierung; 3. Monats-/Jahresauswertung und Gruppierung; 4. vertrautes Formular und Preview. Pure Berechnung darf nach CI nach master; visuelle Anbindung braucht zusätzlich Geräteabnahme.

Abnahme: offizielle Stunden- und Zeitzuschlagstabellen beider Vollzeitbasen, alle Datumsgrenzen, Stufen 1a/1b, Teilzeit, Pflege-/Schichtzulagen, höchste konkurrierende Kalenderzuschläge, Nachtzeiten, Pausen, Zeitumstellung und ausschließlich bestätigte tarifliche Überstunden. Ganze Datenbank-/Backup-Suite bei Speicherung, verify:fast und sieben PR-Prüfungen. iPhone: TV-H auswählen, speichern, Gehalt/Zeitzuschläge ansehen, Neustart; andere Tarifwege bleiben erhalten.

## Quellen (05.10.2026)

Offizielle Sammlung: https://innen.hessen.de/buerger-staat/arbeits-und-dienstrecht/oeffentliches-dienst-und-arbeitsrecht/entgelt

- Mantel, Fassung ÄndTV24 vom24.05.2024: https://innen.hessen.de/sites/innen.hessen.de/files/2023-01/tv-h_fassung_aendtv_nr._20_vom_15.10.2021.pdf (Dateiname veraltet, Inhalt geprüft). SHA256 `8ea0e67084ccf6b275b1c8e96424121b80e2c0b6f24bac587dd009c90b6cdc4f`.
- Einigung27.03.2026: https://innen.hessen.de/sites/innen.hessen.de/files/2026-03/tarifeinigung_2026-03-27.pdf. SHA256 `2e84e64dc93f5a0884d5463eec67bb8b38e7bfc8c713e682d23711794283f3a1`.
- Pflege01.08.2025–30.06.2026: https://innen.hessen.de/sites/innen.hessen.de/files/2026-06/entgelte_zulagen_und_zuschlaege_fuer_pflegekraefte_ab_1-august_2025.pdf. SHA256 `964a7bfb18873318a04f4c454fbbb5b61b5146e8107df212f2fd494c69a537c2`.
- Pflege01.07.2026–30.09.2027: https://innen.hessen.de/sites/innen.hessen.de/files/2026-06/entgelte_zulagen_und_zuschlaege_fuer_pflegekraefte_ab_1-juli_2026.pdf. SHA256 `2a33ed4075eb9b083058785fba7ef3972a1ba3b1f112c9b3add949fe5b46c3b7`.
- Pflege ab01.10.2027: https://innen.hessen.de/sites/innen.hessen.de/files/2026-06/entgelte_zulagen_und_zuschlaege_fuer_pflegekraefte_ab_1-oktober_2027.pdf. SHA256 `649965f15af4edc02334f5e33ffd448f598f10d0fa51c211df1d744c950ab90d`.

Jeweils PDF-Seite1: Monatstabellen (64 Werte); Seite2: Stundenwerte38,5/40; Seiten3/4: Stunden-Zeitzuschläge. Gruppen/Stufenspalten2026 visuell geprüft. Referenzfixture enthält die separat extrahierten gedruckten Stunden- und Zuschlagswerte, nicht aus der Implementierung erzeugte Sollwerte.

## Fachliche Grenzen

§6(1): regulär40 Stunden, ständig Schicht-/Wechselschichtarbeit38,5 Stunden; vereinbarte tarifliche Vollzeit wird ausgewählt, keine Ableitung des Arbeitsvertrags aus einem einzelnen Monat. Bei Wechselschicht werden gesetzliche Pausen in bezahlte Zeit eingerechnet. Pausenlage bleibt die bestehende mittige Schätzung, Schichtmuster ein Hinweis ohne Arbeitgeberentscheidung.

§7(5)/§8(1): Nacht21–6 Uhr20%, Sonntag25%, Feiertag35% mit/135% ohne Freizeitausgleich,24./31.12.ab6Uhr35%, Samstag13–21Uhr20% nur außerhalb Schichtarbeit; Kalenderzuschläge konkurrieren, Nacht kommt hinzu. Basierend auf Stufe3, Stundenfaktor4,348 (Monatsdivisor167,40 bzw.173,92 Stunden), Zwischenwerte centweise gemäß §24(4). Überstunden: bestätigte Minuten, tatsächliche Stufe höchstens4, Zuschlag30% KR5–8/15% KR9–16. Keine automatische Auszahlung aus bloßem Zeitkonto-Saldo.

Pflegezulage §43 Nr5a: nurKR5–12,138,04€ ab08/2025,142,22€ ab07/2026 (3,03%),146,20€ ab10/2027 (2,8%). Keine zusätzliche TVöD-P-Zulage.

Schicht/Wechselschicht §8(7)/(8): bis09/2026 monatlich40€/105€ oder stündlich0,24€/0,63€; ab01.10.2026 monatlich100€/200€ oder stündlich0,60€/1,19€ (Einigung AbschnittII). Monatliche Zulagen werden anteilig mit Vertragsstunden berechnet; stündliche folgen Arbeitsminuten und datierter Grenze.

Stand dieses ersten Pakets: reine lokale Berechnung; noch keine App-Anbindung, keine OTA.
