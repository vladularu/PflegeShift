# Einfache TV-L-Pflegeberechnung

Stand: 05.10.2026. Zielplattform: iPhone, Expo SDK ~57.0.22; Referenz https://docs.expo.dev/versions/v57.0.0/.

## Auftrag und Abnahme

Reihenfolge laut Nutzer: TV-L, dann TV-UK Baden-Württemberg, danach TV-H. Der erste TV-L-Schritt umfasst Pflegepersonen an Universitätskliniken mit KR5–KR17. Die vertraute Gehaltsansicht und Auswahl bleiben das Ziel. Keine Vergütungshistorie, Pflichtdatumseingabe oder zusätzliche Jugendkonfiguration.

Die Umsetzung wird wegen des Dateiumfangs in Berechnung, Speicherung und App-Anbindung geteilt. Dieses Paket enthält ausschließlich den lokalen Rechenkern, KR-Eingabeprüfung, unabhängige Tabellenreferenzen, gezielte Tests und diesen Beleg (fünf Dateien). Keine Änderung an Profil, Datenbank, bestehenden Rechenwegen, nativen Abhängigkeiten oder UI.

Abnahme: 268 Tabellenzellen; gültige KR-Stufen; West/Ost-Vollzeitbasis und deren datierte Änderung; Teilzeit; Nacht/Sonntag/Feiertag/Vorfesttag/Samstag; Zuschlagskollision; Sommerzeit; bestätigte Überstunden mit Stufenkappung; Schichtzulagensatzwechsel; ungültige Eingaben und fehlende Quellen. Anschließend verify:fast und PR-CI. Die App-Anbindung braucht danach den echten iPhone-Test.

## Wiederverwendung und Quellenprüfung

Nach dem erläuterten Vorschlag hat der Nutzer den Beginn mit TV-L beauftragt. Wiederverwendet werden die vier vorhandenen Quellentabellen als lokale, erneut validierte Rechengrundlage. Die verworfenen historischen Eingabeflüsse werden nicht übernommen.

Am 05.10.2026 wurden alle vier Anlage-C-PDFs direkt von der TdL erneut geladen. Ihre SHA-256-Werte stimmen mit den vorhandenen Paketen überein. Alle 268 Werte wurden unabhängig aus den PDFs extrahiert und zellenweise verglichen. Die unabhängige Referenz bleibt beim Test erhalten.

- Tabellenübersicht, Anlage C und Anlage F: https://www.tdl-online.de/tarifvertraege/tv-l
- Aktuelle TV-L-Lesefassung, ÄTV 14 vom 14.02.2026: https://www.tdl-online.de/fileadmin/downloads/TV-L/260812_TV-L__i.d.F._des_%C3%84TV_Nr._14_VT_neu.pdf
  SHA-256: 2bde4df4e29900e29e92c0cf6ea1d1fb26044e400045b7f3956cae83a0988277.
- Entgeltordnung Anlage A, Teil IV: https://www.tdl-online.de/fileadmin/user_upload/Anlage_A_i.d.F._des_%C3%84TV_Nr._13_Homepage.pdf
- Zulagen Anlage F, Abschnitt IV Nr. 8: https://www.tdl-online.de/fileadmin/downloads/TV-L/TV-L_Anlagen/TV-L_Anlage_F_neu.pdf

## Fachlicher Umfang

KR5/6: Stufe 1–6; KR7–17: Stufe 2–6. Grundentgelt wird nach persönlicher Teilzeit berechnet. Nacht-/Kalenderzuschläge basieren auf Stufe 3 und der tariflichen Vollzeitbasis. Unikliniken West: 38,5 Stunden; Ost: 40 bis Ende 2026, 39,5 ab 2027, 39 ab 2028 und 38,5 ab 2029. Die Ost-/West-Zuordnung ist ein expliziter Rechenparameter; die einfache App-Auswahl folgt im Anschluss.

Die allgemeine Pflegezulage an Universitätskliniken folgt Anlage F Nr. 8. Funktions-, Praxisanleitungs-, Leitungs-, besondere Tätigkeitszulagen, Bereitschafts-/Rufdienst und Jahressonderzahlung werden nicht aus KR-Gruppe oder Dienstname abgeleitet. Sie gehören nicht zu diesem Rechenpaket. Die Ausgabe ist eine Brutto-Schätzung der enthaltenen Bestandteile, keine vollständige Abrechnung.

Für den Samstagszuschlag wird im Rechenkern der Schichtarbeitsbezug ausdrücklich übergeben. Die begrenzte Pflege-Anbindung umfasst die Angestellten-Kategorie des §38 Abs.5 Satz1: 0,64 Euro/Stunde bei Schichtarbeit, sonst 20 Prozent. Eine spätere Kalenderheuristik ist als Schätzung zu behandeln. Nacht wird zusätzlich zum höchsten Kalenderzuschlag gezahlt.

Nur als tariflich bestätigte und auszahlbare markierte Überstunden werden berücksichtigt: Grundentgelt maximal Stufe 4, Zuschlag aus Stufe 3; KR5–12:30 Prozent, KR13–17:15 Prozent. Die Monats-Schichtzulage wird anteilig zur persönlichen Arbeitszeit gerechnet, Stunden-Schichtzulagen nach tatsächlicher Nettozeit. Der Rechenkern erwartet den passenden Zulagenstatus; er erfindet keinen Anspruch.

Die vier Quellpakete behalten DRAFT und ihre Quellen-/Reviewmetadaten. Der lokale Adapter ist unabhängig vom Remote-Katalog. Eine Aktivierung von Vertrag 12 im Katalog ist nicht Bestandteil dieses Auftrags.

## Prüfung dieses Rechenpakets

Am 05.10.2026 bestanden: 326 gezielte TV-L-Prüffälle und `npm.cmd run verify:fast` (6.151 Unit-, 562 Komponententests sowie Vertrags-, Format-, Typ-, Lint- und Skriptprüfungen). Es sind genau die fünf oben beschriebenen neuen Dateien betroffen. Der Rechenkern ist noch nicht mit der App verbunden. Geräteabnahme folgt mit der App-Anbindung.

## Paket 2: Auswahl speichern

Scope: neun Dateien (dieser Beleg, domain/types.ts, domain/validation.ts, domain/tvl-kr-tariff.ts, database/simple-salary-profile.ts, database/simple-app-profile.ts, database/preferences-repository.ts, database/local-backup-validation.ts und neuer database/tvl-kr-profile.test.ts). Gruppe und Stufe werden als optionale lokale Gehaltsgrundlage gespeichert. Genau eine Grundlage ist erlaubt. Profiländerung und Tarifwechsel bleiben atomar; Neustart, Backup/Restore und ältere Backups sind Abnahmekriterien. Keine neue Datenbankspalte oder native Migration. Noch keine UI-Anbindung.

Der Anbindungsbranch wurde von aktuellem master angelegt und enthält lokal die bereits freigegebenen E-/Azubi-Änderungen sowie den separaten TV-L-Rechenkern als Abhängigkeiten. PR #266 bleibt bis zur Geräteabnahme offen. Diese lokale Zusammenführung ist kein Merge nach master.

TV-L besitzt unterschiedliche West-/Ost-Vollzeitbasen. Das bestehende Tarifgebiet-Feld erhält dafür die verständlichen Werte West/Ost; keine zusätzliche Einstellungsseite. Das Gebiet wird ausdrücklich gespeichert, damit die besondere Berliner Vertragssituation nicht blind aus der Geografie abgeleitet wird. Der reine Tabellenadapter behält Gruppe/Stufe und einen getrennten Gebietsparameter.

Speicherprüfung: Typcheck und alle 844 Datenbanktests in 74 Dateien bestanden, einschließlich exklusiver Wechsel zwischen P/E/Azubi/manuell/TV-L, Ost-Gebiet im Backup, Rückkehr zu älterem Backup und Rollback bei Schreibfehler. Der gemeinsame aktuelle Pflichtcheck folgt vor der PR-Lieferung mit der App-Anbindung.

## Paket 3: Einfachen Rechenweg anbinden

Scope: fünf Dateien (dieser Beleg, engine/simple-tvl-kr-pay.ts, engine/simple-pay.ts und neuer engine/simple-tvl-kr-profile-pay.ts plus Test). Die vorhandene Monats- und Schichtzulagen-Schnittstelle erhält eine TV-L-Verzweigung. Das TV-L-Monatsmuster bleibt eine Schätzung; Beginnwechsel mindestens zwei Stunden und Betriebsspanne mindestens 13 Stunden werden zusätzlich geprüft. Explizite monatliche Zulagenentscheidung bleibt möglich. Samstags-Schichtbezug ergibt sich im Monatsweg aus dem Muster oder einer ausgewählten Schichtzulage. Der einzelne Dienstadapter benötigt diesen Zusammenhang ausdrücklich. Keine VKA-Satzübernahme. Der gemeinsame Pflichtcheck folgt vor PR-Lieferung.

Adapterprüfung: 404 gezielte Fälle in fünf Dateien bestanden; P/E/Azubi bleiben im Vergleich grün.

## Paket 4: Vertraute Auswertung

Scope: zehn Dateien (dieser Beleg; analysis/monthly-analysis.ts, month-overview.tsx, premium-details-screen.tsx, premium-breakdown-list.tsx, annual-core-report.ts, tariff-assessment-screen.tsx, analysis-rule-coverage.component.test.tsx; salary/salary-screen.tsx; settings/settings-info-details-screen.tsx). TV-L erscheint in den bisherigen Monats-/Jahreskarten, der einfachen Zusammensetzung und gruppierten Dienstzuschlägen. Pflegezulage und fester Samstagszuschlag erhalten passende Beschriftung und Erklärung. Keine neuen Menüs oder historischen Eingabeflüsse. Nach Komponententests und gemeinsamem Pflichtcheck folgen PR-CI und echte iPhone-Abnahme.

## Paket 5: Vorhandenes Gehaltsformular

Scope: acht Dateien (dieser Beleg, settings/settings-form-values.ts samt Test, settings-editor-screen.tsx, profile-update.ts, work-profile-summary.ts, work-profile-screen.tsx und neuer settings-tvl-kr.component.test.tsx). Auswahl TV-L Pflege, KR5–KR17, gültige Stufe, Tarifgebiet West/Ost im bereits vorhandenen Feld. BT-K/BT-B und VKA-Gebiet sind für TV-L ausgeblendet. Vollzeit wird automatisch datiert eingesetzt. Abnahme: Speichern, Wiederöffnen, erlaubte Stufen, Moduswechsel, Ost-/West-Auswahl sowie anschließende reale iPhone-Abnahme.
