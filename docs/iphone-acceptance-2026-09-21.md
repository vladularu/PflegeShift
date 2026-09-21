# LUNA Shift – iPhone-Abnahme vom 21.09.2026

## Zweck und Teststand

Diese Notiz hält ausschließlich die vom Nutzer in der Aufgabenfolge gemeldeten
Ergebnisse fest. Sie ersetzt weder die vollständige Checkliste in
`iphone-acceptance.md` noch eine Abnahme eines späteren nativen Builds.

- App: vorhandene interne iOS-Preview-App, Build 31.
- Dokumentierter Preview-Stand: Updategruppe
  `57272d0b-e2ed-4343-9b33-f40bed65c147`, Runtime
  `eac302484061dfb3fa63e2a74b8618ff6000861c`.
- Letzte zuvor ausdrücklich genannte Geräteumgebung: iPhone 14 Pro Max,
  iOS 26.6.2. Gerät und Betriebssystem wurden für diese einzelne Runde nicht erneut
  angegeben und werden daher nicht als neu erhobener Nachweis behandelt.
- Prüfart: manuelle Rückmeldung des Nutzers; keine zusätzlichen Screenshots oder
  Bildschirmvideos für diese Runde.

## Bestandene Prüfungen

| Bereich           | Gemeldetes Ergebnis                                                                                                                       | Abgrenzung                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Darstellung       | Hell/Dunkel, Theme-Wechsel, Kalender, Arbeitsprofil und größte verwendete Schrift: „alles passt“                                          | Keine vollständige Prüfung jeder Seite oder jedes Themes dokumentiert   |
| Speicherung       | Änderung im Arbeitsprofil sowie Reihenfolge/Sichtbarkeit der Auswertung blieben nach vollständigem Neustart erhalten: „passt“             | Keine Migration von einem anderen nativen Build geprüft                 |
| Backup-Erstellung | JSON-Backup wurde erstellt und lokal gespeichert                                                                                          | Dateiinhalt und Wiederherstellung wurden nicht geprüft                  |
| Offline-Lesen     | App startete im Flugmodus; Kalender, Auswertung, Schichten und Mehr blieben mit vorhandenen Daten nutzbar                                 | Keine Aussage zu Karten- oder anderen bewusst netzabhängigen Funktionen |
| Offline-Schreiben | Testtermin offline angelegt, nach Neustart wiedergefunden, bearbeitet, erneut geprüft und gelöscht; Löschung blieb nach Neustart erhalten | Testeintrag wurde wieder entfernt                                       |
| Erinnerung        | Testtermin mit Erinnerung wurde angelegt; Mitteilung und Öffnen der App funktionierten                                                    | Keine systematische Prüfung aller Berechtigungszustände oder Zeitzonen  |
| Terminserie       | Zweiwöchentliche Testserie zeigte mindestens drei Vorkommen; Angaben waren korrekt; die gesamte Serie ließ sich entfernen                 | Keine weiteren Wiederholungsregeln geprüft                              |

## Bewusst offene Punkte

- VoiceOver wurde vom Nutzer ausdrücklich auf später verschoben; das ist kein
  fehlgeschlagener Test.
- Ein kleineres iPhone wurde nicht geprüft.
- Eine Backup-Wiederherstellung mit Originaldaten wurde nicht durchgeführt. Sie
  bleibt einer sicheren separaten Testinstallation mit aktuellem Sicherungsstand
  vorbehalten.
- Native Standortsuche und neue Markenassets benötigen einen dazu passenden nativen
  Build und sind nicht Gegenstand dieser Preview-Abnahme.
- Die vollständige P0-/P1-Matrix aus `iphone-acceptance.md` ist damit nicht
  abgeschlossen. Insbesondere wird keine pauschale VoiceOver-, Datenschutz-,
  Wiederherstellungs-, Android- oder Store-Freigabe behauptet.

## Lieferentscheidung

Der Nutzer möchte weitere Änderungen sammeln, bevor ein neuer TestFlight-Build
erstellt wird. Daher folgen aus dieser Abnahme weder EAS-Build noch Submit,
TestFlight-Verteilung oder Store-Veröffentlichung. Ein späterer Lieferkandidat wird
vom dann aktuellen Master neu geprüft und benötigt eine eigene Freigabe für jeden
Veröffentlichungsschritt.
