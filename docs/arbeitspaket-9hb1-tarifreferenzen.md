# 9H-B1 – isolierter BT-K-Nachtdienst-Baustein

> Statusabgleich 12.09.2026: Paket abgenommen und über [PR #68](https://github.com/vladularu/PflegeShift/pull/68) integriert. Aktueller Status und verbleibende Prüfpunkte stehen in der [zentralen Roadmap](roadmap.md). Die folgenden Freigaben, offenen Abnahmen und Implementierungsbeschreibungen dokumentieren den damaligen Arbeitsstand; sie sind keine neuen Aufträge und kein Beleg für den heutigen Code. Fachliche Grenzen bleiben maßgeblich, soweit spätere Pakete sie nicht ausdrücklich ersetzen.

## Vertrag und Grenzen

Ziel: Quellengebundene Referenzfälle und ein reiner, noch nicht produktiv angebundener Berechnungskern für die Nachtdienstfolge. Plattform: TypeScript, Expo ~57.0.20; spätere Zielabnahme iPhone 14 Pro Max. SDK-Referenz: https://docs.expo.dev/versions/v57.0.0/sdk/updates/.

Dateiscope: neuer Engine-Baustein, fokussierte Unit-Tests, dieses Dokument. Keine Änderungen an Gehalt, UI, Datenbank, Tarifpaketen, manuellen Entscheidungen, Kalender oder nativer Integration. Freigabe umfasst Commit, Push, PR und Preview-OTA, aber keinen Merge. Eine OTA ohne produktive Einbindung zeigt ausdrücklich keine neuen Funktionen.

## Quellen (geprüft 11.09.2026)

- VKA BT-K Stand 01.01.2026, § 48 Abs. 2: https://vka.de/wp-content/uploads/2026/04/BT-K_AETV_15_Lesefassung_Stand-01_01_2026.pdf
- BAG 24.05.2018, 6 AZR 191/17, insbesondere Rn. 16–25: https://www.bundesarbeitsgericht.de/entscheidung/6-azr-191-17/
- Ereignisfrist und Monatsende: https://www.gesetze-im-internet.de/bgb/__187.html und https://www.gesetze-im-internet.de/bgb/__188.html
- Nachtqualifikation: TVöD-AT § 7 Abs. 1 und 5, mindestens zwei Stunden tatsächliche Nachtarbeit zwischen 21 und 6 Uhr: https://vka.de/wp-content/uploads/2026/04/TVoeD_AT_AETV_22_Lesefassung_Stand_01_01_2026.pdf

## Kontrakt des Kerns

Eingaben sind qualifizierte Beobachtungen mit eindeutigen IDs, tatsächlichen Start-/Endzeitpunkten und bekannten Netto-Nachtminuten. Der Kalenderadapter ist NICHT Bestandteil dieses Pakets. Keine Ableitung aus dem Namen „Nacht“, keine frei erfundene mittige Pause. Unbekannte Minuten bleiben unbekannt. Der Aufrufer muss Datenvollständigkeit ausdrücklich als Intervall zusichern; der Kern liest keine Uhr und keine Datenbank.

Jedes Nachtschichtende eröffnet ein eigenes Kandidatenfenster. Die Monatsfrist endet am entsprechenden Kalendertag des Folgemonats, ersatzweise dessen letztem Tag. Technisch wird der nächste lokale Tagesbeginn als exklusive Grenze benutzt; dies ist kein fixes 28-Tage- oder 24-Stunden-Vielfaches. Zwei weitere qualifizierte Schichten müssen nach dem Ankerende und vor dieser Grenze beginnen. Ihr Ende darf danach liegen, muss aber durch vollständige Daten belegt sein.

`MET` belegt nur dieses Nachtdienstkriterium, niemals einen Monatsanspruch. Überlappende Kandidaten werden nicht automatisch mehrfach vergeben. Bereits anderweitig zugeteilte Folgeschicht-IDs sind ausgeschlossen, dürfen jedoch weiter eine Frist eröffnen. Die eigentliche chronologische Monatszuordnung und die Erzeugung dieser Zuordnungsliste müssen separat entwickelt werden. Es gibt weder einen Betrag noch einen Zulagenstatus als Ausgabe.

Unvollständige Fenster, unbekannte Nachtminuten und ungeklärte Abwesenheiten liefern konservativ `REVIEW`. Insbesondere ist Urlaub/Krankheit weder automatisch anspruchsschädlich noch eine tatsächlich geleistete Nacht. Die Fortzahlungsprüfung bleibt gesondert offen. Doppelte IDs, Überschneidungen und ungültige Intervalle werden zurückgewiesen.

## Referenzen / Abnahme

| Fall                                  | Erwartung                                                                                      |
| ------------------------------------- | ---------------------------------------------------------------------------------------------- |
| BAG-Termine 02./23./24.07.2015        | Nachtdienstkriterium erfüllt; Uhrzeiten 21–07 Uhr sind Testannahmen, keine Urteilsfeststellung |
| Ende 31.01.2026 / 31.01.2024          | Fristtag 28.02. / 29.02.                                                                       |
| Ende 03.12.2026                       | Fristtag 03.01.2027                                                                            |
| Zweiter Beginn spät am Fristtag       | zählt auch bei Ende nach Fristablauf                                                           |
| Zweiter Beginn um 00 Uhr am Folgetag  | zählt nicht                                                                                    |
| Zwei nicht aufeinanderfolgende Nächte | zulässig                                                                                       |
| Bereits angerechnete Folgeschicht     | keine erneute Verwendung als Folgebeleg                                                        |
| 119 / 120 Netto-Nachtminuten          | nicht qualifiziert / qualifiziert                                                              |
| Lücken oder unbekannte Pausen         | REVIEW statt sicherem Ergebnis                                                                 |
| Urlaub oder Krankheit im Fenster      | REVIEW; keine automatische Anspruchsentscheidung                                               |

Abnahme: fokussierte Tests und verify:fast; bestehende Pay-Tests bleiben unverändert grün. Vor späterer Integration: Monatszuordnung, weitere Anspruchsmerkmale (regelmäßiger Wechsel, Einsatz in Schichtarten, 24/7-Bereich, ständige Zuordnung), Abwesenheiten, Teilzeit und Betragsgültigkeit separat absichern. Keine Behauptung einer vollständig tarifkonformen Zulagenberechnung durch B1 allein.
