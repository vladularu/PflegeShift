# Rueckkehr zum einfachen App-Stand

## Auftrag und Freigabe

Der Nutzer hat am 04.10.2026 den Rueckbau ausdruecklich beauftragt. Die frueheren drei iPhone-/TestFlight-Bilder sind verbindlich: einfaches TVoed-P-Formular, Bruttoschaetzung mit kompakter Zusammensetzung und Zuschlagsfilter mit kurzen Dienstkarten. Zusaetzliche Tarif-/Ausbildungsablaeufe werden nicht weiter in den normalen App-Weg integriert. Vorhandene Daten und Sicherungen werden erhalten. Nur dafuer notwendige Datenkompatibilitaet ist zur Wiederverwendung freigegeben.

Zielplattform: internes iOS Preview, vorhandener Build 32. Die reale Geraeteabnahme bleibt Voraussetzung fuer den UI-Merge. Die dauerhafte Git-/Preview-Freigabe gilt weiter. Production, TestFlight und Backend-Katalog bleiben unveraendert.

## Ausgangsstaende

- Vorheriger einfacher Rechenweg: ef3f4298800abc7c6f3f97baa76f7ce703e1b710 (Build-31-Codebasis).
- Erhaltener letzter Preview-Kandidat: 1f2aa43fdaadb24950526f221d8f3269fd38c003, Branch codex/salary-original-views.
- Frischer Lieferbranch codex/restore-simple-app auf origin/master 7a844172eb3aa87f5767177d7de391d735f6175f. Dieser master enthaelt die alten normalen Formular-/Gehalts-/Zuschlagsrouten; die abgelehnten zusaetzlichen UI-PRs werden nicht uebernommen.
- Datenbankschema 31, Backup 19 und bestehende Verschluesselung bleiben erhalten. Kein SQL-Downgrade, Loeschen, Restore oder Ersetzen einer Benutzerdatenbank.

## Getrennte Arbeitsschritte

### R-01: vertraute Bedienung und Berechnung

Den urspruenglichen TVoed-P-Rechner aus dem genannten Stand gesondert wiederherstellen. Monatsgehalt, Zuschlagsdetails und Jahresauswertung verwenden diesen einfachen Profil-Rechenweg. Datierte Verguetung, Jahreszahlungs- und Ausbildungsrechner bleiben fuer spaetere Einzelauftraege im Quellstand erhalten und laufen in den normalen Auswertungen nicht.

Dateiscope: einfacher Rechner und Regressionstest, einfacher Jahreshook und Geraetefluss-Test, zwei Jahres-Einstiege, Monatsanalyse, Gehalt, Zuschlagsdetails, alte Rechenverzweigung im Jahreskern, dieser Beleg.

### R-02: Erhalt neuer Angaben

Eine ausschliesslich lesende Bruecke projiziert zuletzt gespeicherte, bereits gueltige TVoed-P- bzw. einfache eigene Monatsangaben in das alte Profilformat. Neuere direkt im einfachen Formular gespeicherte Werte haben Vorrang. Zukunftsstaende, fremde Tarife und komplexe eigene Konfigurationen werden nicht umgedeutet. Alle Originaldaten bleiben in ihren Tabellen und vollstaendig im Backup.

Dateiscope: Datenbruecke, normaler Profil-Port, integrativer SQLite-/Backup-Test. Keine neue Datenbank- oder Backup-Version, kein Massenupdate.

## Abnahme

1. Bestehende TVoed-P-Angaben liefern wieder sofort ein Monatsgehalt ohne Bestaetigungsdatum.
2. Formular und Zusammensetzung entsprechen den Referenzbildern; keine Historien-/Zusatzangaben-/Ausbildungsmenues im normalen Weg.
3. Zuschlagsfilter und kompakte Dienstkarten bleiben erhalten. Betragswerte werden berechnet und nicht aus Screenshots festgeschrieben.
4. Monat und Jahr verwenden denselben einfachen Rechenweg; keine neuen Jahreszahlungen oder DRAFT-Gehaltsanteile.
5. Neues und altes gespeichertes Profil, Zukunftsstaende und spaetere einfache Aenderungen bleiben nachvollziehbar. Backup 19 behaelt alle Daten byte- bzw. wertgleich.
6. Gezielte Regressionen, vollstaendige Datenbanksuite, verify:fast, Runtime- und PR-CI-Pruefung. Anschliessend drei Ansichten am realen iPhone pruefen.

## Danach

Auszubildendentabelle und ausschliesslich die gesetzliche Minderjaehrigenpruefung im Dienstplan werden als getrennte, einfache Nutzerfluesse geplant. Keine Wiederverwendung weiterer neuer Funktionen ohne konkrete Abstimmung. Weitere Tarife einzeln nach erfolgreicher Abnahme.

Die Datenbruecke veraendert die Wochenstunden des Arbeitsprofils nicht. Separat gespeicherte Verguetungs-Wochenstunden bleiben im erhaltenen Datensatz; das fruehere App-Modell nutzt wieder die bekannten Arbeitsprofil-Stunden. Damit veraendert eine neue Verguetungsangabe nicht das Arbeitszeit-Soll im Kalender.

## Lokaler Pruefstand am 05.10.2026

- `verify:fast`: erfolgreich; 372 Unit-/Integrationsdateien mit 5.750 Tests und 92 Komponentensuiten mit 550 Tests. Damit ist auch die gesamte Datenbanksuite ausgefuehrt.
- Gezielt: P5/P6 in BT-K und BT-B, fehlende Tabellenzelle, sofortige Monats-/Jahresberechnung, Fehlerfallnavigation, neuere und zukuenftige Angaben sowie Backup-19-Rundlauf.
- `release:check` fuer internes Preview: erfolgreich.
- iOS-Fingerprint `f2f4b99ba254b82ab22b99594d5228bd8c3774f7` stimmt mit installiertem Preview Build 32 ueberein.
- PR-CI, Auslieferungsnachweis und reale iPhone-Abnahme folgen. Vor Geraeteabnahme kein Merge.
