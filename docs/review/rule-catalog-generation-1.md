# Regelkatalog Generation 1 – Prüfdossier

Stand: 28. August 2026
Status: `DRAFT` – nicht zur Veröffentlichung freigegeben

## Gegenstand

Dieses Dossier beschreibt die fachliche Prüfung der ersten serverseitig auslieferbaren
Regelpakete. Die Pakete sind schema-valide Prüfkandidaten. `DRAFT` bedeutet ausdrücklich:
Sie dürfen weder in eine Release-Anforderung aufgenommen noch signiert oder ausgeliefert
werden.

| Paket                    | Gültigkeit            | Inhalt                                                                 |
| ------------------------ | --------------------- | ---------------------------------------------------------------------- |
| `tvoed-vka-bt-k/2026-05` | 01.05.2026–31.03.2027 | TVöD-VKA BT-K/BT-B Pflege: Tabelle, Zuschläge, Zulagen und Kombination |
| `de-arbzg-care/2026-01`  | ab 01.01.2026         | ArbZG-Arbeitszeit, Pausen, Nachtarbeit, Ruhezeit und Pflegeabweichung  |
| `de-holidays/2026`       | 01.01.2026–31.12.2026 | neun bundesweit und zehn landesweit definierte Feiertagsregeln         |

Die Paketdateien liegen unter `rules/packages/reviewed/<packageId>/<versionId>.json`.
Der Verzeichnisname bezeichnet die Review-Pipeline, nicht den bereits erreichten Status.

## Quellen- und Entscheidungsgrenze

Jede Quelle ist im jeweiligen JSON mit URL, Dokumentdatum, Abschnitt und SHA-256 des
heruntergeladenen Dokuments oder eines dokumentierten normalisierten Review-Snapshots
hinterlegt. Normative Werte und Produktentscheidungen werden getrennt behandelt:

- Normativ: Entgelttabelle, tarifliche Zuschläge und Zulagen, ArbZG-Grenzen sowie
  Feiertagsregeln.
- Nicht normativ: `workPatternRules`, `workPatternPolicy`,
  `grossPlanningWarningMinutes` und `planning`. Diese Werte sind PflegeShift-Heuristiken
  und dürfen weder als Gesetz noch als Tarifvorgabe dargestellt werden.
- Gemischte Objekte führen beide Quellarten auf. Die fachliche Prüfung muss die einzelnen
  Felder getrennt bewerten.

## Tarifprüfung

Der Tarifprüfer bestätigt gegen die beiden hinterlegten VKA-Lesefassungen:

- genau 50 Tabellenwerte der Anlage E ab 1. Mai 2026;
- Ableitung des Stundenentgelts nach dem im Paket dokumentierten Divisor
  `4,348 × 39`, Rundung `HALF_UP` auf Cent;
- acht Zuschlagsregeln einschließlich Zeitfenstern, Bemessungsstufe und Ausschlüssen;
- elf Zulagenregeln einschließlich BT-K/BT-B-, Länder- und Teilzeitbedingungen;
- Priorität und Mitglieder der Kombinationsregel;
- sachliche Reichweite des Paketnamens BT-K/BT-B gegenüber dem technischen Selector
  `specialPartId: bt-k`.

Die Regressionstests fixieren Anzahl, Eckwerte, Berechnung und kritische Grenzfälle. Sie
ersetzen keine Tarifprüfung.

## ArbZG-Prüfung

Der Rechtsprüfer bestätigt gegen die hinterlegte amtliche ArbZG-Fassung:

- acht Stunden Regelarbeitszeit und zehn Stunden Höchstgrenze;
- 30/45 Minuten Pause nach mehr als sechs/neun Stunden sowie 15-Minuten-Segmente;
- Nachtzeit 23:00–06:00, Qualifikation bei mehr als zwei Stunden Nachtarbeit und
  28-Tage-Ausgleichsfenster;
- elf Stunden Ruhezeit;
- Verkürzung auf zehn Stunden in Krankenhaus/Pflege nur zusammen mit zwölf Stunden
  Ausgleich innerhalb von vier Wochen.

Die separat gekennzeichneten Planungswarnungen benötigen eine Produktfreigabe, keine
gesetzliche Freigabe. Insbesondere sind Serien- und Wochenendwarnungen keine selbständigen
ArbZG-Verstöße.

## Feiertagsprüfung

Der Rechtsprüfer bestätigt alle 19 Regeln, insbesondere:

- die neun bundesweiten Regeln und sämtliche Oster-Offsets;
- Ländergruppen für Heilige Drei Könige, Frauentag, Fronleichnam, Reformationstag und
  Allerheiligen;
- Ostersonntag und Pfingstsonntag ausschließlich Brandenburg;
- Weltkindertag ausschließlich Thüringen und Buß- und Bettag ausschließlich Sachsen;
- Mariä Himmelfahrt im Paket ausschließlich Saarland.

Kommunale Feiertage und die gemeindeabhängige bayerische Regel zu Mariä Himmelfahrt sind
bewusst nicht enthalten. Sie benötigen ein separates Ortsmodell und dürfen nicht pauschal
für Bayern aktiviert werden.

### Reproduzierbare Landesnachweise und verbleibende Rechtsprüfung

Vier amtliche Länderportale liefern ihre aktuelle Darstellung dynamisch oder mit
nicht reproduzierbaren Antwortbytes aus. Für die Review-Grundlage wurden deshalb nur die
sichtbaren einschlägigen Normtexte am 28. August 2026 nach UTF-8/LF normalisiert und mit
Provenienz, Dokumentkopf sowie Abrufdatum unter `rules/sources/` festgeschrieben:

| Land      | Amtlicher Nachweis                                             | Snapshot                     |
| --------- | -------------------------------------------------------------- | ---------------------------- |
| Bayern    | Bayern.Recht, Art. 1 FTG, Text gilt ab 1. August 2013          | `de-by-ftg-art-1-2026.txt`   |
| Saarland  | Bürgerservice Rechtsinformation Saarland, § 2 SFG              | `de-sl-sfg-2-2026.txt`       |
| Sachsen   | REVOSax, § 1 SächsSFG, Fassung gültig ab 7. Mai 2025           | `de-sn-saechssfg-1-2026.txt` |
| Thüringen | Landesrecht Thüringen, § 2 ThürFGtG, Fassung vom 26. März 2019 | `de-th-thuerfgtg-2-2026.txt` |

Die im Paket hinterlegten SHA-256-Werte werden im Regressionstest aus den tatsächlichen
Snapshot-Bytes neu berechnet. Damit bleibt exakt prüfbar, auf welcher Textgrundlage der
Kandidat erstellt wurde, ohne die veränderlichen Transportbytes der Portale als
inhaltliche Version zu behandeln.

Die frühere Sekundärquelle wurde durch den vom saarländischen Ministerium der Justiz
bereitgestellten Bürgerservice Rechtsinformation ersetzt. Die stabile Dokument-ID
`jlr-NNLSL0000A2D6NN00000000007` bezeichnet § 2 SFG, Fassung vom 18. November 2010,
gültig ab 24. Dezember 2010. Der dort sichtbare Artikeltext wurde am 28. August 2026 nach
UTF-8/LF normalisiert und unverändert unter `rules/sources/de-sl-sfg-2-2026.txt`
gespeichert.

Die bisherige Thüringer Feiertagspetition ist vollständig entfallen. An ihre Stelle tritt
die aktuelle Einzelnorm § 2 ThürFGtG aus dem Landesrechtsportal mit dauerhafter
Dokument-ID. Bayern belegt zugleich, dass Mariä Himmelfahrt nicht landesweit, sondern nur
in Gemeinden mit überwiegend katholischer Bevölkerung gilt; diese Regel bleibt deshalb
bewusst außerhalb des landesweiten Pakets. REVOSax belegt den Buß- und Bettag ausdrücklich
als gesetzlichen Feiertag in Sachsen.

Der Bürgerservice weist darauf hin, dass seine konsolidierte Darstellung keine amtliche
Fassung ersetzt; rechtlich maßgeblich bleibt die angegebene Fundstelle Amtsblatt 1976,
Seite 211. Der Rechtsprüfer bestätigt deshalb weiterhin § 2 SFG sowie die in der amtlichen
StVO-Liste belegten länderübergreifenden Regeln gegen das jeweils geltende
Landesfeiertagsrecht. Auch die übrigen normalisierten Portalnachweise ersetzen weder die
jeweilige amtliche Verkündung noch die fachliche Rechtsprüfung. Bis zu dieser Bestätigung
bleibt `de-holidays/2026` zwingend `DRAFT`.

## Vier-Augen-Freigabe

1. Die unveränderten DRAFT-Dateien werden in einem eigenen Commit festgeschrieben.
2. Tarif-, Rechts- und Produktprüfer prüfen genau diesen 40-stelligen Git-Commit.
3. Beanstandungen erzeugen neue DRAFT-Inhalte und eine erneute Prüfung.
4. Erst nach vollständiger Zustimmung folgt ein eigener Promotion-Commit. Er ändert nur
   `status` und `review` auf `REVIEWED` und trägt Prüfer, UTC-Zeit und den geprüften
   DRAFT-Commit ein.
5. Erst die REVIEWED-Dateien dürfen in eine Release-Anforderung aufgenommen werden.
6. Signierung erfolgt separat mit einem privaten Schlüssel aus einem geschützten Secret
   Store. Der private Schlüssel gehört niemals in Repository, App-Bundle, Dossier oder
   Supabase-Tabelle.

## Technische Abnahme

Vor Übergabe an die Prüfer müssen erfolgreich sein:

```text
npm.cmd run rules:validate
npm.cmd exec vitest -- run src/rules/review-candidates.test.ts
npm.cmd run verify:fast
```

Eine bestandene technische Prüfung ändert keinen Reviewstatus und erteilt keine
Veröffentlichungsfreigabe.
