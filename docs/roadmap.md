# LUNA Shift – Roadmap und Abschlussstand

Stand: 20.09.2026 (Europe/Berlin). Konsolidierte Basis: `45a12d5` (PR #80).
Diese Datei ist der zentrale Statusindex. Paketdokumente enthalten historische
Implementierungs- und Prüfnotizen; dortiges „offen“ oder „noch nicht freigegeben“
ist ohne Datum kein aktueller Auftrag. Git-Merges belegen Integration,
Nutzerrückmeldungen belegen die jeweils tatsächlich beschriebenen Gerätetests.

## Produktziel und Arbeitsgrenzen

Ein einfacher, ruhiger iPhone-Alltagsbegleiter für Schichtarbeitende, besonders
im Krankenhaus: Dienste schnell eintragen, Zeiten überblicken und Gehalt
unverbindlich einschätzen. Vorhandene Daten und gespeicherte Angaben möglichst
automatisch nutzen. Keine wiederkehrenden Nachweisformulare, keine exakte
Lohnabrechnung und keine stillschweigend als sicher dargestellten Annahmen.

Abgenommene Gestaltung und Kalendersteuerung bleiben stabil. Kein weiteres
Animations- oder Tarifpaket ohne konkreten Befund und begrenztes Ziel.
Lokale Kernfunktionen bleiben ohne Konto nutzbar. Android bleibt nach README
bis zur gesonderten technischen und realen Geräteabnahme pausiert.

## Erledigt und integriert

Die Paketabnahmen stammen aus dem Projektverlauf; die PR-Zuordnung wurde gegen
die lokale Master-Historie geprüft. Frühere Einzelabnahmen sind keine pauschale
Bestätigung aller Zustände auf jeder späteren OTA.

| Paket                   | Ergebnis                                                                                           | Integration                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 5A / 5B-A / 5B-B        | Lokale JSON-Sicherung, Vorschau und Wiederherstellung                                              | PR #51–53                                                   |
| 6 / 7                   | Runtime-Isolation und Bereinigung temporärer Backup-Dateien                                        | PR #54–55                                                   |
| 8A-1 / 8A-2             | SDK-57-Patchstand und Parser-Schutz                                                                | PR #56–57; keine dauerhafte Sicherheitsgarantie             |
| 9A                      | Dienstfarben und LUNA-Akzent, Hell/Dunkel                                                          | [PR #58](https://github.com/vladularu/PflegeShift/pull/58)  |
| 9B-A / 9B-B             | Jahreswechsel, Heute-Rücksprung, Monats-/Jahresansicht und flüssigere Navigation                   | PR #59–60                                                   |
| 9C                      | Plus-Schnelleingabe, kontrastierende Popups, Dienstauswahl von unten, subtile Kalender-Haptik      | [PR #61](https://github.com/vladularu/PflegeShift/pull/61)  |
| 9D                      | Ruhige Auswertungskarten; Monatsabgleich beim Tab-Wechsel; Karten bei Rückkehr geschlossen         | [PR #62](https://github.com/vladularu/PflegeShift/pull/62)  |
| 9E + Feiertagskorrektur | Karten in Dienst-/Termin-Editoren, Vorlagenübernahme, getrennte Feiertagszeile                     | PR #63–64                                                   |
| 9F                      | Schnellere Jahresauswertung, früh sichtbare Basisdaten, Wiederverwendung gültiger Teilberechnungen | [PR #65](https://github.com/vladularu/PflegeShift/pull/65)  |
| 9G-A / 9G-B             | Gespeicherte Auswahl freiwilliger Planungshinweise; konsistente Listen und Zähler                  | PR #66–67                                                   |
| 9H-B1 / 9H-B2           | Referenzkern und isolierte Prüfung monatlicher Nachweise                                           | PR #68–69; kein vollständiger produktiver Anspruchsnachweis |
| 9H-C / 9H-D             | Einfache Erklärung und gemeinsame automatische BT-K-Monatsschätzung                                | PR #70–71                                                   |

### Seit dem Abschlussstand vom 12.09.2026 integriert

Die PR-Zustände und Merge-Commits wurden am 20.09.2026 gegen GitHub geprüft.
Die folgenden Zeilen ersetzen keine eigenständige Geräte- oder Store-Abnahme.

| Paket                      | Ergebnis                                                                                                                                       | Integration / Nachweis                                                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 9I – Dokumentation         | Zentraler Statusindex und historische Paketverweise integriert                                                                                 | [PR #72](https://github.com/vladularu/PflegeShift/pull/72), `8efa2ba`                                                                               |
| Dialogthemen / Löschhaptik | Dialog-Farbschema aktualisiert und Löschhaptik abgeschwächt                                                                                    | [PR #73](https://github.com/vladularu/PflegeShift/pull/73), `35c0ab7`                                                                               |
| SDK-57-Patches / Parser    | Metro-Patch, Entfernung von image-size und SDK-Patchabgleich                                                                                   | [PR #74](https://github.com/vladularu/PflegeShift/pull/74), `14a445c`; keine dauerhafte Sicherheitsgarantie                                         |
| iOS-Produktionskennung     | LUNA-Shift-Produktions-Bundle-ID im Code übernommen                                                                                            | [PR #75](https://github.com/vladularu/PflegeShift/pull/75), `16e2987`; kein Beleg für Store-Veröffentlichung oder vollständige native Markenabnahme |
| LUNA-Onboarding            | Reguläres Onboarding durch den LUNA-Ablauf ersetzt                                                                                             | [PR #76](https://github.com/vladularu/PflegeShift/pull/76), `bdc632e`; keine pauschale Geräteabnahme aller Erststartzustände                        |
| UX-01                      | Gemeinsames Rot `#C93443` in App und Onboarding, Jahreszahl und tatsächlicher aktueller Monat rot                                              | [PR #77](https://github.com/vladularu/PflegeShift/pull/77), `9824298`; Farbkorrektur auf Preview Build 31 vom Nutzer bestätigt                      |
| UX-02                      | Schließgeste löst nach Speicherfehler keine automatische Wiederholung aus                                                                      | [PR #78](https://github.com/vladularu/PflegeShift/pull/78), `31b660f`; Preview-Gerätetest vom Nutzer bestätigt                                      |
| UX-03A                     | Eigener Löschvorgang bleibt bis zum Abschluss stabil; keine falsche Meldung „Eintrag nicht verfügbar“ und keine doppelte Lösch-/Speicheraktion | [PR #79](https://github.com/vladularu/PflegeShift/pull/79), `254828c`; Preview-Gerätetest vom Nutzer bestätigt                                      |
| Windows-Testlauf           | Jest findet Komponententests ohne Sonderparameter, Suchbereich auf `src` begrenzt; Regressionstest ergänzt                                     | [PR #80](https://github.com/vladularu/PflegeShift/pull/80), `45a12d5`; keine App-Änderung und keine OTA nötig                                       |

### Aktueller verifizierter Abschlussstand

- UX-01, UX-02 und UX-03A sind integriert und im jeweils beschriebenen Umfang
  durch Nutzerrückmeldung auf der Preview-App abgenommen. Zu UX-03A lautete
  die Rückmeldung „bestanden und funktioniert“. Kein zusätzlicher Screenshot-
  oder Videonachweis und keine vollständige App-Abnahme werden daraus abgeleitet.
- Zuletzt in dieser Aufgabenfolge veröffentlicht und bestätigt:
  [UX-03A-Preview-OTA](https://expo.dev/accounts/vladularu/projects/pflegeshift/updates/96aa1fef-7d04-41ac-8796-49a0780cd914),
  `preview` / iOS / Build 31, Runtime `eac302484061dfb3fa63e2a74b8618ff6000861c`.
  Das ist der dokumentierte Lieferstand, keine erneute Live-Abfrage von EAS.
- Für PR #79 und PR #80 bestanden jeweils alle sieben PR-CI-Prüfungen.
  [CI von PR #80](https://github.com/vladularu/PflegeShift/actions/runs/35475843932)
  prüfte auch die Testsuche unter Linux; der lokale Windows-Lauf von
  `npm.cmd run verify:fast` bestand ohne Zusatzparameter vollständig.
- Teststand nach PR #80: 732 Unit-Tests in 105 Dateien und 368 Komponententests
  in 73 Suites; zusätzlich neun Skript-Prüfgruppen. Der separate Komponenten-
  Coverage-Lauf bestand mit unveränderten Grenzwerten.
- Frühere Liefernotizen, etwa [UX-01](ux01-red-theme-delivery.md), dokumentieren
  noch den damaligen Windows-Workaround. Dieser ist mit PR #80 auf der aktuellen
  Entwicklungsbasis behoben; ältere separate Liefercheckouts ändern sich nicht automatisch.
- Kein neuer nativer Build und kein Production-/TestFlight-Update durch UX-03A
  oder das Windows-Testlauf-Paket. Ein Merge ist keine Veröffentlichung auf allen Geräten.

### Historische Geräteabnahme: 9H-D

- [PR #71](https://github.com/vladularu/PflegeShift/pull/71), Merge `ef3f4298800abc7c6f3f97baa76f7ce703e1b710`.
- [Master-CI](https://github.com/vladularu/PflegeShift/actions/runs/34653521207): sieben erfolgreiche Checks im abgeschlossenen Auslieferungsschritt.
- [iOS-Preview-OTA](https://expo.dev/accounts/vladularu/projects/pflegeshift/updates/1dd83977-a41e-4a1a-95c3-0f759ddb4a64), Commit `7c129dc`, kompatibel mit Build 31.
- Nutzer bestätigt: Daten vorhanden, Erklärung als plausibel eingeschätzt,
  Dienste/Gehaltswert nach Neustart erhalten, Jahreswechsel ohne spürbare neue
  Verzögerung, Aktualisierung nach Dienständerung. Paket abgenommen und gemergt.
- Kein zusätzlicher Hell-/Dunkel-, Screenshot- oder manueller-Override-Gerätetest
  für genau diese OTA behauptet. Automatisierte Tests decken manuelle Priorität ab.
- Lokaler Jahresbenchmark: rund 5 % zusätzliche CPU-Zeit; kein Geräte-Framerate-
  Nachweis. Die anschließende Nutzerprüfung meldete keine neue Verzögerung.

## 9I – integrierter Dokumentationsabschluss und verbleibende Prüfpunkte

Der damalige Dokumentationsauftrag umfasste diese Roadmap, den README-Verweis
und Statushinweise in elf Paketdokumenten (13 Markdown-Dateien). Er wurde mit
PR #72 integriert und ist kein offener Git-Auftrag mehr. Seine Restliste ist
keine Liste bestätigter Fehler und wird nicht pauschal als Geräteabnahme behandelt.

### Abgleich mit den ursprünglichen Wünschen

| Wunsch / Restpunkt                                              | Einordnung und nächste Aktion                                                                                                                                                                                                                                               |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Termine bei Dienstkürzeln nicht auf einen Buchstaben reduzieren | Der damalige Codeabgleich zu `prototype-entry-content.tsx` belegte Termintitel unabhängig vom Dienstmodus. Keine neue Abweichung in dieser Aufgabenfolge gemeldet; keine erneute Implementierung eingeplant.                                                                |
| Harte Vibrationen appweit vermeiden                             | Kalender-Haptik in 9C und gezielte Löschhaptik in PR #73 bearbeitet. Nur noch konkret störende Aktionen benennen; keine pauschale globale Nachbesserung oder Abnahme behaupten.                                                                                             |
| Einheitliche Popup-Köpfe in Hell/Dunkel                         | Gezielte Dialogthemen-Korrektur in PR #73 integriert, gemeinsame Farbrollen in UX-01 ergänzt. Eine umfassende Geräteprüfung aller bereits geöffneten Dialoge beim Farbschemawechsel bleibt davon getrennt.                                                                  |
| TVöD-Prüfungen separat auswählbar                               | 9G dokumentiert einen Planungsschalter, keinen eigenständigen Tarifprüfungs-Schalter. Zulagenansicht aus 9H nicht damit gleichsetzen. Offen ist die Produktabgrenzung: Welche zusätzlichen Hinweise sollen optional sein? Keine neue Regelberechnung ohne konkreten Bedarf. |
| 9H-D manuelle Priorität und Lesbarkeit                          | Lokal automatisiert geprüft; gezielte ergänzende Geräteprüfung möglich, ohne bereits bestätigte Neustart-/Jahres-/Dienständerungstests zu wiederholen.                                                                                                                      |

Diese Liste enthält Prüflücken und eine offene Produktfrage, nicht fünf
bestätigte App-Fehler. Daraus entstehen keine automatischen Reparaturpakete.

### Optionale, noch nicht vollständig belegte Restprüfungen

1. **Darstellung:** Dienstmodus kurz auf Kürzel/Symbol stellen; ein Termin bleibt
   als Titel erkennbar. Gehalt/Schichtzulage und einen Mehr-Dialog in Hell/Dunkel
   öffnen, auch einmal nach Farbschemawechsel neu öffnen. Nur konkrete Abweichungen melden.
2. **Manuelle Priorität, optional mit sicher notiertem Ausgangswert:** In einem
   geeigneten Monat eine manuelle Zulagenfestlegung prüfen und den Ausgangszustand
   wiederherstellen. Keine neue Pflicht zur monatlichen Eingabe.
3. **Bediengefühl:** Beim normalen Eintragen und Abbrechen auf eine noch störende
   Vibration achten. Keine komplette Wiederholung der abgenommenen Kalenderprüfung.

Das sind vorbereitete, noch nicht als durchgeführt markierte Checks. Bei einem
Fehler: Aktion, Monat, Farbschema und erwartetes Verhalten festhalten; Video
nur bei bewegtem Fehlverhalten. Eine Rückmeldung sammeln, erst danach bündeln.
Keine vorsorgliche OTA und keine weitere Kleinstkorrektur ohne Befund.

### Historische Abschlusskriterien für 9I

- Ein zentraler Roadmap-Verweis; alte Statusnotizen eindeutig als Historie markiert.
- Abnahmen, technische Integration, offene Prüfungen und Produktfragen getrennt.
- Markdown/Verweise geprüft und `verify:fast` ausgeführt.
- Nutzer bestätigt die Restliste; keine komplette neue Geräteabnahme für Dokumentation.
- Danach bleibt die aktuelle UI-/Logik-Runde geschlossen, soweit kein konkreter
  Restfehler oder eine ausdrücklich priorisierte neue Anforderung hinzukommt.

Damals dokumentiertes lokales Prüfergebnis: Markdown-Verweise gültig und
`verify:fast` erfolgreich; App-Code und unabhängige `.gitignore` unverändert.
Die anschließende Git-Integration ist durch PR #72 belegt. Das ersetzt keine
nachträgliche Bestätigung der oben genannten optionalen Geräteprüfungen.

## Bewusst nicht als nächstes Umsetzungspaket eingeplant

- Vollständige tarifliche Nachweisverwaltung, automatische verbindliche
  Anspruchsentscheidungen und komplexe Abwesenheitsbelege: B2 bleibt isoliert;
  9H-D nutzt die dokumentierte Schätzkonvention. Keine Rechtsprüfung durch UI-Abnahme.
- Neue Animationen, erneuter Kalenderumbau oder Performance-Reparatur ohne Messung
  beziehungsweise reproduzierbare Nutzerbeschwerde.
- Cloud-/Kontosynchronisation, externe Kalender, automatische Sicherungen und
  Dienstrotationen: mögliche spätere Produktentscheidungen, keine freigegebene Roadmap.
- Production-Regelkatalog, Store-/TestFlight-Veröffentlichung und Android-Auslieferung:
  gesonderte technische und Veröffentlichungsfreigaben; dieser Abschluss ist keine
  allgemeine Produktionsfreigabe.

## Priorität und weiterer Ablauf

1. **Diese Statusaktualisierung abschließen:** ausschließlich `docs/roadmap.md`
   auf Branch `codex/roadmap-status-september`. Akzeptanz: PRs und Abnahmen korrekt
   zugeordnet, historische Freigaben nicht als aktuelle Aufträge dargestellt,
   Links und Markdown geprüft, `verify:fast` bestanden. Lokale Bearbeitung,
   Commit, Push und PR sind freigegeben; der Merge benötigt noch eine eigene Freigabe.
2. **Kein neues UX-Reparaturpaket ohne Befund:** UX-01 bis UX-03A sind abgeschlossen.
   Bei Bedarf nur die verbleibenden kurzen Geräteprüfungen bündeln; bereits
   bestätigte Lösch-, Speicher- und Farbprüfungen nicht unnötig wiederholen.
3. **Nächste Produktentscheidung ausdrücklich wählen:** offene Tarif-Schalter-
   Abgrenzung oder eine neue Nutzerpriorität. Erst danach ein begrenztes Paket
   mit Ziel, Nicht-Zielen, Dateiscope und Abnahme definieren. Die zurückgestellten
   Themen oben bleiben ohne neue Freigabe zurückgestellt.

Kein verbindliches „9J“ erfunden. Für künftige reine Status-/Dokumentationspflege
genügt ein kleiner, gezielter Arbeitslauf; aufwendige Fach- oder Performanceanalyse
nur dort einsetzen, wo das konkrete Risiko sie rechtfertigt.
