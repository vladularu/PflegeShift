# Einfache Jugendlichenpruefung

## Stand

Umsetzung nach read-only Untersuchung. Der Nutzer hat den einfachen App-Rueckbau am 05.10.2026 abgenommen. PR #262 und #263 sind nach sieben gruenen CI-Pruefungen jeweils gemergt; Ausgangspunkt ist master ba9a0a6663ea6142902865cc1b6553937f89dc02.

Der Nutzer hat die Bedienung konkretisiert: ausschliesslich ein Schalter, kein Geburtsdatum und keine weitere Altersangabe. Die Umsetzung und die zuvor beschriebene Wiederverwendung der geprueften Dienstzeitregeln sind mit "Oke implementiere" freigegeben. Die bisherige Ausbildungsoberflaeche bleibt inaktiv.

## Ziel und Bedienung

Zusaetzliche Option auf der vorhandenen Seite Mehr > Pruefung: Jugendlichenpruefung (unter 18). Genau ein Schalter, standardmaessig deaktiviert. Aktivieren und deaktivieren ohne Formular, Geburtsdatum, Altersgruppe oder Gueltigkeitsdatum. Bei deaktivierter Option bleibt der bisherige Pruefweg aktiv; bei aktivierter Option erscheinen die Jugendhinweise direkt in der bestehenden Dienstplanpruefung fuer Monat, Details und Jahr.

Plattform: iPhone / internes Preview. Stil und Navigation entsprechen dem gerade abgenommenen einfachen App-Stand.

## Abgegrenzter Umfang

Arbeitszeit, Pausendauer, Schichtspanne, taegliche Ruhezeit, Zeitfenster sowie Arbeits-/Ruhetage und Feiertage anhand der erfassten Dienste pruefen. Ein aktivierter Schalter bestaetigt die Anwendung der Jugendpruefung auf den betrachteten Plan, belegt aber weder das genaue Alter noch altersabhaengige Ausnahmen (insbesondere § 14 JArbSchG). Fuer diese Faelle keine zusaetzlichen Pflichtfelder: stattdessen gezielte Hinweise im bestehenden Pruefergebnis. Gesetzliche Ausnahmen fuer Pflegeeinrichtungen und Mehrschichtbetriebe muessen fachlich korrekt behandelt werden; Berufsbereich allein ist kein Nachweis fuer jede Ausnahme. Fehlende Pausenlage oder nicht pruefbare Sonderfaelle duerfen nicht als vollstaendig gesetzeskonform dargestellt werden.

Keine Ausbildungs-/Verguetungshistorien, Schul- oder Pruefungsformulare, Tarifaktivierung, Pflichtangaben zu Gueltigkeitsbeginnen oder Aenderungen am abgenommenen Gehaltsweg. Dieser Auftrag prueft Dienstzeiten; spezielle Schul-/Ausbildungsanrechnung benoetigt bei tatsaechlicher Relevanz eine klare Pruefgrenze, ohne Wiedereroeffnung der entfernten Formulare.

## Freigegebene Wiederverwendung

Vorhanden sind youth-compliance.ts, youth-daily.ts und youth-weekly.ts mit Tests. Der bestehende Gesamtweg verlangt datierte Ausbildungsprofile, Zusatzbestaetigungen und einen passenden aktiven Jugend-Regelstand. Eine direkte Reaktivierung wuerde die gerade entfernte Komplexitaet zurueckbringen. Umgesetzt wird deshalb eine gesonderte einfache Anbindung ausschliesslich der nach aktueller Norm erneut geprueften Dienstzeitregeln. Keine Uebernahme der bisherigen Ausbildungsoberflaeche.

Offizielle Referenz: https://www.gesetze-im-internet.de/jarbschg/BJNR009650976.html , insbesondere §§ 2, 4 und 8 bis 18. Installiert ist Expo ~57.0.22; versionierte SQLite-Referenz: https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/ .

## Arbeitspakete und Dateiscope

1. **J-01 Einstellung und Datenerhalt:** vorhandene Pruefungsseite erweitern; separate validierte Einstellung und Speicherung mit Tests. Sicherung/Restore der Einstellung gezielt nachweisen. Erwartet 6 bis 10 Dateien. Die konkrete Backup-Kompatibilitaet wird vor Codeaenderungen festgelegt.
2. **J-02 Dienstplan-Anbindung:** einfache fachliche Anbindung mit gezielten gesetzlichen Grenzfaellen, Monats-/Jahreswegen und bestehender Detailansicht. Erwartet 8 bis 12 Dateien; genaue Liste nach Entscheidung zum vorhandenen Rechenkern. Keine native Erweiterung geplant.

Kein angefangener Teil wird als fertige gesetzliche Pruefung ausgeliefert. Pflichtcheck und PR-CI vor Preview; reale iPhone-Abnahme vor UI-Merge.

## Abnahmekriterien

- Genau ein zusaetzlicher Schalter auf Mehr > Pruefung; keine Geburtsdatums-, Alters- oder Gueltigkeitsfelder.
- Auswahl bleibt nach Neustart und Backup/Restore erhalten; alte Sicherungen lassen die Zusatzoption deaktiviert.
- Die Auswahl gilt fuer den betrachteten Dienstplan und wird vom Nutzer selbst gesetzt. Ohne Altersangabe erfolgt kein automatischer Wechsel an einem Geburtstag und keine erfundene historische Alterszuordnung. Altersabhaengige Ausnahmen werden nicht automatisch als erlaubt angenommen; relevante Faelle erscheinen als verstaendlicher Pruefhinweis.
- Jugendhinweise stehen in den vorhandenen Pruefansichten, ohne neue Untermenues oder technische Katalogtexte.
- Keine stillschweigend erfundenen Ausnahmebestaetigungen, Schulzeiten oder Pausenintervalle.
- Fachliche Grenzfaelle, verify:fast, CI und reale iPhone-Abnahme sind dokumentiert.

## Konkretisierte Pakete

J-01: preferences-repository.ts, local-backup-validation.ts, neuer Jugend-Preference-Integrationstest, check-preferences.tsx, check-settings-screen.tsx, dessen Komponententest und dieser Beleg. Die vorhandene generische Preference-Sicherung/Restore uebernimmt den validierten Schluessel; Schema 31 und Backup 19 bleiben unveraendert. Aeltere Backups ohne Schluessel setzen die Option auf aus.

J-02: zwei einfache Dienstzeit-Rechenmodule mit einem fachlichen Regressionstest, compliance.ts, Monats-Hook und dessen Komponententest, annual-core-report.ts sowie einfacher Jahres-Hook und dessen Komponententest. Keine native Integration. Beide Pakete werden erst zusammen im Preview ausgeliefert.

Die zwei lokalen Arbeitspakete werden in getrennten Commits in einem gemeinsamen Draft-PR geprueft. Dadurch bleibt die erstmals ausgelieferte Option vollstaendig angebunden. Die Auswahl ersetzt nur die Erwachsenen-Dienstzeitregeln in der Monats-, Detail- und Jahresauswertung; Ueberschneidungs- und Planungshinweise bleiben erhalten. Der bestehende unmittelbare kritische Hinweis beim Speichern eines Dienstes gehoert nicht zu diesen Auswertungsansichten.

## Lokale Verifikation

verify:fast bestanden: 374 Vitest-Dateien / 5.792 Tests und 92 Komponentensuiten / 554 Tests; saemtliche weiteren Pflichtpruefungen gruen. Interne Release-Konfiguration gruen. Runtime-Fingerprint f2f4b99ba254b82ab22b99594d5228bd8c3774f7 entspricht dem auf dem iPhone bestaetigten Preview-Update. PR-CI und reale iPhone-Abnahme folgen vor dem Merge.
