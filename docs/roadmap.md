# LUNA Shift – Roadmap und Abschlussstand

Stand: 12.09.2026. Konsolidierte Basis: `ef3f429` (9H-D, PR #71).
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

### Zuletzt abgenommen: 9H-D

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

## 9I – aktueller Dokumentationsauftrag

Ziel: einen belastbaren Abschlussstand und eine kleine Restliste schaffen.
Scope: diese Roadmap, README-Verweis und Statushinweise in elf Paketdokumenten
(13 Markdown-Dateien). Keine App-, Datenbank-, Tarif-, Test- oder Native-Änderung.
Lokale Dokumentation und Prüfung sind freigegeben; Commit, Push, PR und Merge
noch nicht. Ein Build oder eine OTA ist für diese Dokumentation nicht nötig.

### Abgleich mit den ursprünglichen Wünschen

| Wunsch / Restpunkt                                              | Einordnung und nächste Aktion                                                                                                                                                                                                                                               |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Termine bei Dienstkürzeln nicht auf einen Buchstaben reduzieren | Im aktuellen `prototype-entry-content.tsx` wird der Termintitel unabhängig vom Dienstmodus ausgegeben. Einzeiliges Abschneiden bei Platzmangel bleibt normal. Keine erneute Implementierung eingeplant.                                                                     |
| Harte Vibrationen appweit vermeiden                             | 9C belegt Kalender-Haptik, nicht jede Aktion der App. Nur verbleibende störende Aktionen benennen und gezielt prüfen; keine pauschale globale Änderung.                                                                                                                     |
| Einheitliche Popup-Köpfe in Hell/Dunkel                         | Frühere Rückmeldung: nach erneutem Öffnen korrekt. Kein aktuell reproduzierter Fehler dokumentiert. Wechsel bei bereits offenem Sheet in der kurzen Abschlussprüfung berücksichtigen.                                                                                       |
| TVöD-Prüfungen separat auswählbar                               | 9G dokumentiert einen Planungsschalter, keinen eigenständigen Tarifprüfungs-Schalter. Zulagenansicht aus 9H nicht damit gleichsetzen. Offen ist die Produktabgrenzung: Welche zusätzlichen Hinweise sollen optional sein? Keine neue Regelberechnung ohne konkreten Bedarf. |
| 9H-D manuelle Priorität und Lesbarkeit                          | Lokal automatisiert geprüft; gezielte ergänzende Geräteprüfung möglich, ohne bereits bestätigte Neustart-/Jahres-/Dienständerungstests zu wiederholen.                                                                                                                      |

Diese Liste enthält Prüflücken und eine offene Produktfrage, nicht fünf
bestätigte App-Fehler. Daraus entstehen keine automatischen Reparaturpakete.

### Kurze gemeinsame Abschlussprüfung auf bestehender OTA

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

### Abschlusskriterien für 9I

- Ein zentraler Roadmap-Verweis; alte Statusnotizen eindeutig als Historie markiert.
- Abnahmen, technische Integration, offene Prüfungen und Produktfragen getrennt.
- Markdown/Verweise geprüft und `verify:fast` ausgeführt.
- Nutzer bestätigt die Restliste; keine komplette neue Geräteabnahme für Dokumentation.
- Danach bleibt die aktuelle UI-/Logik-Runde geschlossen, soweit kein konkreter
  Restfehler oder eine ausdrücklich priorisierte neue Anforderung hinzukommt.

Lokales Prüfergebnis 9I: Markdown-Verweise gültig und `verify:fast` erfolgreich.
App-Code und unabhängige `.gitignore` unverändert. Kein Commit oder Upload.

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

1. 9I-Dokumentation bestätigen und bei Bedarf separat ins Repository übernehmen.
2. Nur die kurzen Restprüfungen beziehungsweise die Tarif-Schalter-Produktfrage klären.
3. Erst bei konkretem Befund ein kleines Folgepaket mit Ziel, Nicht-Zielen,
   Dateiscope und Abnahme festlegen. Ansonsten nächste Nutzerpriorität abwarten.

Kein verbindliches „9J“ erfunden. Für künftige reine Status-/Dokumentationspflege
genügt ein kleiner, gezielter Arbeitslauf; aufwendige Fach- oder Performanceanalyse
nur dort einsetzen, wo das konkrete Risiko sie rechtfertigt.
