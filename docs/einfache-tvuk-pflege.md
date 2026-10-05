# Einfache TV-UK-Pflegeberechnung

## Auftrag und Abnahme

Stand: 05.10.2026. TV-UK Pflege (Baden-Württemberg) für Freiburg, Heidelberg,
Tübingen und Ulm. Die vertraute Gehaltsansicht und die einfache Tarifauswahl bleiben
maßgeblich. Plattform: iPhone, offline nutzbarer Rechenkern; Expo ~57.0.22 und
Dokumentation https://docs.expo.dev/versions/v57.0.0/ geprüft.

Dieses erste Paket enthält genau fünf neue Dateien:

- src/domain/tvuk-nursing-tariff.ts
- src/engine/simple-tvuk-nursing-tables.json
- src/engine/simple-tvuk-nursing-pay.ts
- src/engine/simple-tvuk-nursing-pay.test.ts
- docs/einfache-tvuk-pflege.md

Abnahme: alle 315 Tabellenwerte aus fünf veröffentlichten Zeiträumen, gültige
Gruppen/Stufen einschließlich Stufe 7 und P-UK9L, Teilzeit, Cent-Rundung,
Nacht-/Kalender-/Schichtzuschläge, Pflichtfreizeit, bestätigte zahlbare Überstunden,
Pausen, Datumswechsel und Sommerzeit; danach verify:fast und PR-CI.
App-Speicherung und bekannte Formular-/Auswertungsansichten folgen in getrennten
Paketen mit echtem iPhone-Nachweis. Kein neues Einstellungsmenü ist vorgesehen.

## Quellen

Offizielle AGU-Verträge: https://agu-uniklinika.de/tarifvertraege/

- Mantel TV-UK, Ä8, gültig vor 01.01.2025: § 11, PDF-Seiten 8/9.
  https://agu-uniklinika.de/wp-content/uploads/2023/09/TV-UK_durchgeschriebene-Fassung_final_20230504_AGU-Version-002.pdf
  SHA256: 98a9e0707ef792886844ed40880116a3e9e2924461ac8a0ddea52ad98bd56ebb
- Unterschriebener Mantel-Ä9, § 1 Ziffer 2 und § 2: Erhöhungen ausdrücklich
  erst ab 01.01.2025, unabhängig von der Entgelttabelle ab Oktober 2024.
  https://agu-uniklinika.de/wp-content/uploads/2025/01/20241219_TV-UK-Ae9_unterschrieben.pdf
  SHA256: 58213a2427970fd852d300a24cac33286a93817d1ca63cc13929bc278a5c39e6
- Mantel TV-UK, Ä9, gültig ab 01.01.2025: §§ 8, 10, 11, 17.
  https://agu-uniklinika.de/wp-content/uploads/2025/07/01_TV-UK_durchgeschrieben-Fassung-Ae9-vom-03.07.2024.pdf
  SHA256: 55601f36409ab2fc27adf5f8f959d26b74258c0aff387a3267ebdfe863f394d3
- TV-UK-Entgelt, Ä5, Anlage D Teil B Ziffern 1/2, Protokollerklärung 1 sowie
  Zulagenübersicht Teil B: Pflegezulage 200 Euro für P-UK6 bis P-UK15 einschließlich
  P-UK9L; P-UK5 verweist ausdrücklich nur auf Protokollerklärung 2.
  https://agu-uniklinika.de/wp-content/uploads/2025/07/02_TV-UK-Entgelt_durchgeschrieben-Fassung-Ae5-vom-03.07.2024.pdf
  SHA256: 5d4f88ea137fd9079c2ac8138e049558aae57bb4db8a7a8fa931c1086cff4f4e
- Anlage B, Tabellen ab 01.10.2024 und 01.10.2025, PDF-Seiten 3/4:
  https://agu-uniklinika.de/wp-content/uploads/2024/11/18_Entgelt-Pflegetabelle-ab-1.-Oktober-2024-bzw.-1.-Oktober-2025.pdf
  SHA256: 8f41283a72a59d4bc8ea0d238b57abc76f58e74d8db98f8d23b4d21d0e587b24
- Anlage B, Ä6 vom 08.07.2026, Tabellen ab 01.10.2026, 01.12.2027 und
  01.07.2028, PDF-Seiten 4/5/6 (Originalseiten 8/9/10):
  https://agu-uniklinika.de/wp-content/uploads/2026/10/19_Entgelt-Pflegetabelle-ab-1.-Oktober-2026-bzw.-01.-Dezember-2027-bzw.-01.-Juli-2028.pdf
  SHA256: 82b86dc7a985f2ddbe80d1865e74d5b6cb7f47cd6df5c11eebf92ff93d0b422e
- Unterschriebener Ä5, § 2 (volle Euro runden, 2025 +3,7 Prozent) und Anlage B:
  https://agu-uniklinika.de/wp-content/uploads/2025/01/241115_TV-UK-Entgelt-Ae5_unterschrieben.pdf
- Abgleich Ä6-Steigerungen (2026 +2,8 Prozent, mindestens 100 Euro; 2027/2028
  jeweils +1,3 Prozent):
  https://agu-uniklinika.de/entgelttarifverhandlungen-2026-tarifparteien-erzielen-einigung/

Die fünf Tabellen werden als tatsächliche veröffentlichte Euro-Werte gespeichert.
Der Test prüft ihre Übertragung unabhängig gegen die 2024-Referenz und die
vertraglichen Erhöhungsschritte. Die Laufzeit bis 31.07.2028 ist kein automatisches
Ablaufdatum für die ab 01.07.2028 veröffentlichte Tabelle.

## Berechnung

- Vollzeit 38,5 Stunden; persönlicher Tabellenbetrag und Pflegezulage anteilig.
- Stundenbasis: eigene Gruppe und tatsächliche Stufe / (4,348 × 38,5).
- Nacht 20–6 Uhr: 25 Prozent, 0–4 Uhr bis 31.12.2024 insgesamt 35 Prozent,
  ab 01.01.2025 insgesamt 40 Prozent. Fünf Prozentpunkte des Grundnachtzuschlags
  sind zwingend Freizeit. Geld: außerhalb 0–4 Uhr 20 Prozent; im Kernfenster
  bis Ende 2024 30 Prozent, danach 35 Prozent. Freizeitminuten bleiben separat.
- Sonntag bis 31.12.2024 25 Prozent, danach 40 Prozent; Feiertag und
  24./31. Dezember ganztägig 25 Prozent. Bei Überschneidung dieser
  Kalenderkategorien nur der höchste Zuschlag. Ein Dienst über Mitternacht
  verwendet für jeden Tag dessen gültige Zuschlagssätze.
- Bei bestätigtem regelmäßigen Schichtdienst: 6–20 Uhr zusätzlich 2,8 Prozent.
  Keine monatliche VKA-/TV-L-Schichtpauschale und kein Samstagszuschlag.
- Überstunden nur bei extern bestätigter zahlbarer Zuordnung: eigener
  Stundenbetrag plus 25 Prozent. Ein positives Stundensaldo begründet keinen Anspruch.
- Pausen mangels genauer Lage mittig geschätzt. Nur ausdrücklich bestätigte
  Nachtpausen, bei denen der Arbeitsplatz nicht verlassen werden kann, werden
  gemäß § 8 Protokollerklärung 2 als Arbeitszeit angerechnet.

Nicht enthalten: individuelle Eingruppierung, Bestands-E-Gruppen, Ärzte,
Auszubildende, besondere Tätigkeits-/Stationszulagen, Einspringen, Ruf-/Bereitschaft,
Jahressonderzahlung und untermonatige Beschäftigungs-/Tarifwechsel. Die Ausgabe
ist eine Bruttoschätzung für den gespeicherten vollen Monat, keine Lohnabrechnung.
Spezielle Zulagen werden nicht aus dem gewählten Gruppennamen abgeleitet.

## Prüf- und Lieferstand

Rechenkern fertig: 373 gezielte Referenztests bestanden. verify:fast ist grün
(6.524 Unit-Tests und 562 Komponententests einschließlich Datenbankprüfungen).
Keine App-Anbindung oder Veröffentlichung in diesem Rechenkern-Paket.

## Historischer Zuschlagsabgleich

Eigenes Korrekturpaket auf master: genau Rechenkern, Referenztest und dieser Beleg.
Ziel: richtige Sätze für Oktober bis Dezember 2024 und den Wechsel zum Januar 2025.
Keine Tabellen-, Profil-, UI- oder native Änderung. Abnahme: historische Nacht und
Sonntag, unveränderte Pflichtfreizeit und äußere Nachtzeit, Monatsbetrag und
Jahreswechsel; gezielte Tests, verify:fast und sieben grüne PR-Prüfungen vor Merge.

Gezielter historischer Abgleich: 381 Referenztests bestanden.
