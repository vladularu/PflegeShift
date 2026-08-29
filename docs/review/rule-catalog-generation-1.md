# Regelkatalog Generation 1 – Prüfdossier

Stand: 29. August 2026
Status: `DRAFT` – nicht zur Veröffentlichung freigegeben

## Gegenstand

Dieses Dossier beschreibt die fachliche Prüfung der ersten serverseitig auslieferbaren
Regelpakete. Die Pakete sind schema-valide Prüfkandidaten. `DRAFT` bedeutet ausdrücklich:
Sie dürfen weder in eine Release-Anforderung aufgenommen noch signiert oder ausgeliefert
werden.

| Paket                    | Gültigkeit            | Inhalt                                                                        |
| ------------------------ | --------------------- | ----------------------------------------------------------------------------- |
| `tvoed-vka-bt-k/2026-05` | 01.05.2026–31.03.2027 | TVöD-VKA BT-K/BT-B Pflege: Tabelle, Zuschläge, Zulagen und Kombination        |
| `de-arbzg-care/2026-01`  | ab 01.01.2026         | ArbZG-Arbeitszeit, Pausen, Nachtarbeit, Ruhezeit und Sonn-/Feiertagsausgleich |
| `de-holidays/2026`       | 01.01.2026–31.12.2026 | neun bundesweite, zehn landesweite und vier regionale Feiertagsregeln         |

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

Der Projekt-Owner gleicht gegen die beiden hinterlegten VKA-Lesefassungen ab:

- genau 50 Tabellenwerte der Anlage E ab 1. Mai 2026;
- Ableitung des Stundenentgelts nach `Monatsentgelt ÷ (4,348 × Wochenstunden)`,
  Rundung `HALF_UP` auf Cent; dabei 38,5 Stunden für BT-K außerhalb KAV Baden-Württemberg
  und 39 Stunden für BT-K im KAV Baden-Württemberg sowie BT-B;
- acht Zuschlagsregeln einschließlich Zeitfenstern, Bemessungsstufe und Ausschlüssen;
- elf Zulagenregeln einschließlich BT-K/BT-B-, Länder- und Teilzeitbedingungen;
- Priorität und Mitglieder der Kombinationsregel;
- sachliche Reichweite des Paketnamens gegenüber dem technischen Selector mit den beiden
  besonderen Teilen `bt-k` und `bt-b`;
- eine eingegebene Mehrarbeitsdauer wird erst nach separater Bestätigung als tarifliche
  Überstunde vergütet.

Die Regressionstests fixieren Anzahl, Eckwerte, Berechnung und kritische Grenzfälle. Sie
ersetzen keine Tarifprüfung.

## ArbZG-Prüfung

Der Projekt-Owner gleicht gegen die hinterlegte amtliche ArbZG-Fassung ab:

- acht Stunden Regelarbeitszeit und zehn Stunden Höchstgrenze;
- für jeden auf mehr als acht und höchstens zehn Nettoarbeitsstunden verlängerten Tag
  durchschnittlich höchstens acht Stunden je Werktag innerhalb der folgenden sechs
  Kalendermonate oder alternativ innerhalb der folgenden 24 Wochen;
- Urlaub und Krankheit ohne tatsächliche Arbeit bleiben in diesem Durchschnitt neutral
  und dürfen Mehrarbeit nicht als Nulltage ausgleichen; ausdrücklich erfasste freie Tage
  bleiben mögliche Ausgleichstage;
- 30/45 Minuten Pause nach mehr als sechs/neun Stunden sowie mindestens 15 Minuten je
  Teilpause; die App verwendet bewusst nur die eingetragene Gesamtdauer, verlangt weder
  Pausenzeitpunkte noch einzelne Abschnitte und erzeugt dafür keine eigene Monatsmeldung;
- Nachtzeit 23:00–06:00 und Nachtarbeit bei mehr als zwei Stunden in diesem Zeitraum;
- Nachtarbeitnehmerstatus getrennt davon: ausdrücklich bestätigte regelmäßige
  Nachtarbeit in Wechselschicht oder mindestens 48 erfasste Nachtarbeitstage im
  Kalenderjahr;
- für Nachtarbeitnehmer durchschnittlich höchstens acht Stunden innerhalb eines
  Kalendermonats oder eines tatsächlich berechneten 28-Tage-Zeitraums;
- keine pauschale Anrechnung von Urlaub oder Krankheit als fiktive Arbeitszeit;
- elf Stunden Ruhezeit;
- Verkürzung auf zehn Stunden in Krankenhaus/Pflege nur zusammen mit zwölf Stunden
  Ausgleich innerhalb eines Kalendermonats oder innerhalb von vier Wochen; die spätere
  der beiden zulässigen Fristen bleibt offen;
- Zulässigkeit der Sonn- und Feiertagsbeschäftigung in Krankenhaus und Pflege nach
  § 10 Abs. 1 Nr. 3, soweit die Arbeit nicht an Werktagen vorgenommen werden kann;
- mindestens 15 beschäftigungsfreie Sonntage je Kalenderjahr;
- je gearbeitetem Sonntag ein eigener Ersatzruhetag innerhalb eines den Sonntag
  einschließenden 14-Tage-Zeitraums, je gearbeitetem Feiertag auf einem Werktag innerhalb
  eines entsprechenden 56-Tage-Zeitraums;
- ein ohnehin arbeitsfreier Werktag kann nach der Rechtsprechung des BAG als Ersatzruhetag
  dienen; die App wertet deshalb innerhalb des vollständig geladenen Prüfbereichs auch einen
  Werktag ohne Arbeitseintrag als frei. Ein expliziter Eintrag `FREE` bleibt optional;
  eingetragene Abwesenheiten werden nicht automatisch als Ersatzruhetag umgedeutet. Bei
  weniger als insgesamt 35 Stunden ununterbrochener Ruhe wird die Verbindung mit § 5 separat
  zur Prüfung markiert, weil technische oder arbeitsorganisatorische Ausnahmegründe nach
  § 11 Abs. 4 nicht aus dem Kalender ableitbar sind;
- keine tariflichen Abweichungen nach § 12 und keine Verlagerung der Sonn- oder
  Feiertagsruhe in Mehrschichtbetrieben nach § 9 Abs. 2 in diesem Vertragsstand.
- die App verlangt eigenständige Angaben zur Zulässigkeit nach § 10, zum regelmäßigen
  Nacht-/Wechselschichtstatus und dazu, ob Arbeitszeiten aller Arbeitsverhältnisse erfasst
  sind; unbekannte Angaben erzeugen sichtbare, fail-closed Hinweise.

Die separat gekennzeichneten Planungswarnungen benötigen eine bewusste Ownerentscheidung,
keine gesetzliche Freigabe. Insbesondere sind Serien- und Wochenendwarnungen keine
selbständigen ArbZG-Verstöße.

## Feiertagsprüfung

Der Projekt-Owner gleicht alle 23 Regeln mit den hinterlegten Quellen ab, insbesondere:

- die neun bundesweiten Regeln und sämtliche Oster-Offsets;
- Ländergruppen für Heilige Drei Könige, Frauentag, Fronleichnam, Reformationstag und
  Allerheiligen;
- Ostersonntag und Pfingstsonntag ausschließlich Brandenburg;
- Weltkindertag ausschließlich Thüringen und Buß- und Bettag ausschließlich Sachsen;
- Mariä Himmelfahrt landesweit im Saarland sowie als ausdrücklich gewählte Regionalregel
  in Bayern;
- Augsburger Friedensfest sowie die ausgewählten Fronleichnamsregionen in Sachsen und
  Thüringen.

Regionale Regeln werden nicht aus dem Bundesland erraten. Sie gelten nur nach expliziter
Auswahl des Arbeitsorts; `UNKNOWN` bleibt in Bayern, Sachsen und Thüringen sichtbar und
verhindert eine unbemerkte Vollständigkeitsannahme.

### Reproduzierbare Landesnachweise und verbleibende Rechtsprüfung

Mehrere amtliche Länderportale liefern ihre aktuelle Darstellung dynamisch oder mit
nicht reproduzierbaren Antwortbytes aus. Für die Review-Grundlage wurden deshalb nur die
sichtbaren einschlägigen Normtexte am 28. oder 29. August 2026 nach UTF-8/LF normalisiert und mit
Provenienz, Dokumentkopf sowie Abrufdatum unter `rules/sources/` festgeschrieben:

| Land                   | Amtlicher Nachweis                                | Snapshot                       |
| ---------------------- | ------------------------------------------------- | ------------------------------ |
| Bayern                 | Bayern.Recht, Art. 1 FTG                          | `de-by-ftg-art-1-2026.txt`     |
| Bremen                 | Transparenzportal Bremen, § 2 Feiertagsgesetz     | `de-hb-feiertg-2-2026.txt`     |
| Hamburg                | Landesrecht Hamburg, § 1 Feiertagsgesetz          | `de-hh-feiertg-1-2026.txt`     |
| Hessen                 | Hessen Innen, gesetzliche Feiertage 2026          | `de-he-holidays-2026.txt`      |
| Mecklenburg-Vorpommern | Landesrecht Mecklenburg-Vorpommern, § 2 FTG M-V   | `de-mv-ftg-2-2026.txt`         |
| Niedersachsen          | NI-VORIS, § 2 NFeiertagsG                         | `de-ni-nfeiertagsg-2-2026.txt` |
| Nordrhein-Westfalen    | RECHT.NRW.DE, § 2 Feiertagsgesetz NW              | `de-nw-feiertg-2-2026.txt`     |
| Rheinland-Pfalz        | Innenministerium, gesetzliche Feiertage 2026      | `de-rp-holidays-2026.txt`      |
| Saarland               | Bürgerservice Rechtsinformation Saarland, § 2 SFG | `de-sl-sfg-2-2026.txt`         |
| Sachsen                | REVOSax, § 1 SächsSFG                             | `de-sn-saechssfg-1-2026.txt`   |
| Schleswig-Holstein     | GVOBl., Einführung des Reformationstags           | `de-sh-sftg-2-2018.txt`        |
| Thüringen              | Landesrecht Thüringen, § 2 ThürFGtG               | `de-th-thuerfgtg-2-2026.txt`   |

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

Die StVO dient nur noch als amtlicher Vergleichsnachweis für die neun bundesweiten Regeln.
Fronleichnam, Reformationstag und Allerheiligen verweisen jeweils auf direkte amtliche
Nachweise sämtlicher betroffener Länder; keine Länderzuordnung dieser drei Regeln hängt
allein an der StVO. Konsolidierte Portaltexte und normalisierte Snapshots ersetzen weder
die jeweilige amtliche Verkündung noch eine Rechtsberatung. Bis zum dokumentierten
Owner-Abgleich bleibt `de-holidays/2026` zwingend `DRAFT`.

## Produktintegration und bekannte Grenzen

- Das Profil speichert Tarifregion, Feiertagsregion, Nacht-/Wechselschichtstatus,
  §-10-Zulässigkeit und die Vollständigkeit aller Arbeitsverhältnisse verschlüsselt lokal.
- Der Feiertags-Cache ist nach Bundesland, Regionalauswahl, Jahr und Resolver isoliert.
- Jahresauswertungen laden das vollständige Vorjahr, Zieljahr und Folgejahr, damit
  Ausgleichsfenster nicht an der früheren Monatsgrenze abgeschnitten werden.
- Ein fehlendes Feiertagspaket unterdrückt Sonntagsprüfungen nicht mehr; die App meldet die
  fehlende Katalogabdeckung separat.
- Die App prüft die Pause bewusst nur anhand der eingetragenen Gesamtdauer. Pausenzeitpunkte
  und einzelne Abschnitte werden nicht verlangt und erzeugen keine eigene Monatsmeldung.
- Betriebliche §-10-Voraussetzungen, tarifliche Überstundenanordnung und nicht erfasste
  Fremdarbeitszeiten kann die App nicht selbst beweisen. Dafür bleiben ausdrückliche
  Nutzerangaben beziehungsweise Hinweise bestehen.

## Solo-Owner-Freigabe

1. Die unveränderten DRAFT-Dateien werden in einem eigenen Commit festgeschrieben.
2. Der Projekt-Owner prüft genau diesen 40-stelligen Git-Commit anhand der Tarif-, ArbZG-,
   Feiertags- und Produktchecklisten dieses Dossiers. Eine zweite Person ist nicht
   vorgeschrieben.
3. Beanstandungen erzeugen neue DRAFT-Inhalte und einen erneuten Owner-Abgleich.
4. Erst nach abgeschlossenem Abgleich folgt ein eigener Promotion-Commit. Er ändert nur
   `status` und `review` auf `REVIEWED` und trägt eine stabile nicht personenbezogene
   Owner-ID, den automatisch erfassten UTC-Zeitpunkt und den geprüften DRAFT-Commit ein.
5. Weder Klarname noch Rollenangabe sind erforderlich. `REVIEWED` dokumentiert den
   Quellenabgleich durch den Owner und ist keine juristische Zertifizierung.
6. Erst die REVIEWED-Dateien dürfen in eine Release-Anforderung aufgenommen werden.
7. Signierung erfolgt separat mit einem privaten Schlüssel aus einem geschützten Secret
   Store. Der private Schlüssel gehört niemals in Repository, App-Bundle, Dossier oder
   Supabase-Tabelle.

## Technische Abnahme

Vor der Owner-Freigabe müssen erfolgreich sein:

```text
npm.cmd run rules:validate
npm.cmd exec vitest -- run src/rules/review-candidates.test.ts
npm.cmd run verify:fast
```

Eine bestandene technische Prüfung ändert keinen Reviewstatus und erteilt keine
Veröffentlichungsfreigabe.
