# PflegeShift iPhone-Abnahme

Dieses Protokoll gilt für einen signierten internen iOS-Preview-Build auf einem realen iPhone. Simulator-, Export-, Unit- und Maestro-Ergebnisse ergänzen die Geräteabnahme, ersetzen sie aber nicht.

## 1. Teststand eindeutig festhalten

- [ ] Datum, Tester und verwendetes iPhone-Modell dokumentieren
- [ ] iOS-Version, Sprache `Deutsch`, Region `Deutschland` und Zeitzone dokumentieren
- [ ] EAS-Build-ID, Buildnummer, Git-Commit und Profil `preview` dokumentieren
- [ ] Bundle-ID ist `com.pflegeshift.app.internal`
- [ ] Der Build enthält den zu prüfenden Commit; ältere Preview-Builds gelten nicht als Nachweis
- [ ] Screenshots und Videos unter `artifacts/iphone-acceptance-YYYY-MM-DD/` ablegen

## 2. Installation und Start — P0

- [ ] Vorhandenen internen Preview-Build aktualisieren, ohne ihn vorher zu löschen
- [ ] App startet ohne Absturz, Web-/Expo-Go-Hinweis oder leeren Zwischenzustand
- [ ] Onboarding erscheint nur bei einer frischen Installation
- [ ] Bestehende Dienste, Termine, Vorlagen und Einstellungen bleiben nach dem Update erhalten
- [ ] App vollständig beenden, zweimal neu starten und Datenbestand erneut prüfen
- [ ] Flugmodus aktivieren: Kalender, Auswertung, Gehalt und Bearbeitung funktionieren weiterhin

Erwartung: Der lokale SQLCipher-Datenbestand bleibt über Update und Neustarts konsistent. Ein Fehler beim Öffnen darf keine leere Datenbank über vorhandene Daten schreiben.

## 3. Kernfluss Kalender — P0

- [ ] Onboarding abschließen und Monatskalender öffnen
- [ ] Leeren Tag antippen; Schnellauswahl öffnet ohne blockierende schwarze Fläche
- [ ] `Schicht hinzufügen` öffnet die Vollbildauswahl `Meine Dienste`
- [ ] `Früh direkt eintragen` speichert genau einen Dienst
- [ ] Dienst antippen, bearbeiten, speichern und erneut öffnen
- [ ] Dienst löschen; Kalender ist sofort wieder bedienbar
- [ ] Mehrere Tage im Stempelmodus markieren und korrekt speichern
- [ ] Zwischen Kalender, Auswertung, Gehalt und Mehr wechseln; kein Einfrieren oder Flickern
- [ ] Nach jedem Form-Sheet den Kalender direkt antippen und scrollen können

Nachweis: ein zusammenhängendes Bildschirmvideo vom leeren Tag bis zum gelöschten Dienst.

## 4. Native Zeitwahl — P0

- [ ] Neuen individuellen Dienst öffnen und Beginn sowie Ende jeweils ändern
- [ ] Picker schließen, ohne einen Wert zu ändern; der bisherige Wert bleibt bestehen
- [ ] `06:05–14:37` speichern und erneut öffnen; beide Minutenwerte stimmen exakt
- [ ] Nachtdienst `21:00–07:00` speichern; der Dienst wird dem gewählten Starttag zugeordnet
- [ ] Picker mehrfach hintereinander öffnen und schließen; kein Absturz oder doppeltes Sheet
- [ ] Mit VoiceOver werden `Beginn wählen` und `Ende wählen` verständlich angekündigt
- [ ] Mit großer Systemschrift bleiben Wert, Beschriftung und Touchziel erreichbar

Nachweis: kurzes Video mit Öffnen, Ändern, Schließen, Speichern und erneutem Öffnen.

## 5. Termine, Erinnerungen und Orte — P0

- [ ] Ganztägigen Termin anlegen, bearbeiten und nach Neustart wiederfinden
- [ ] Terminserie im Abstand von zwei Wochen anlegen und mehrere Vorkommen prüfen
- [ ] Erinnerung hinzufügen, Mitteilungsfreigabe erlauben und geplante Mitteilung prüfen
- [ ] Mitteilungsfreigabe verweigern; die App bleibt bedienbar und erklärt den Zustand
- [ ] Ort suchen und Kartenansicht öffnen; danach im Flugmodus ohne Absturz zurückkehren
- [ ] Termin mit Serie, Erinnerung, Ort und Notiz bearbeiten; alle Felder bleiben erhalten

## 6. Testlabor-Backup v2 — P0

Das Preview-Profil enthält das interne Testlabor. Aktivierung: `Mehr` → `Über PflegeShift` fünf Sekunden gedrückt halten → anschließend `Testlabor` im Bereich `Intern` öffnen.

- [ ] Einen individuellen Ganztagsdienst mit Notiz, Erinnerung und Ort anlegen
- [ ] Einen Termin mit zweiwöchentlicher Serie, Notiz, Erinnerung und Ort anlegen
- [ ] Im Testlabor für den betroffenen Monat Testdaten erzeugen
- [ ] Original aus dem Testlabor wiederherstellen
- [ ] Ganztagsstatus, Zeiten, Serie, Intervall, Notizen, Erinnerungen und Orte stimmen exakt
- [ ] App zweimal neu starten und den wiederhergestellten Stand erneut prüfen

Erwartung: Die Wiederherstellung verliert keines der aktuellen Dienst- oder Terminfelder.

## 7. Tarif-Regressionen — P0

### Historischer Monat Mai 2025

Profil: Nordrhein-Westfalen, `19,25` Wochenstunden, tarifliche Vollzeit `38,5`. Einen achtstündigen Dienst ohne Pause im Mai 2025 verwenden.

- [ ] Schichtzulage monatlich: `20,00 €`
- [ ] Wechselschichtzulage monatlich: `77,50 €`
- [ ] Schichtzulage stündlich: `1,92 €`
- [ ] Wechselschichtzulage stündlich: `7,44 €`

### Baden-Württemberg

Profil: Baden-Württemberg, `19,5` Wochenstunden, tarifliche Vollzeit `39`.

- [ ] Allgemeine TVöD-Zulage bei 50 Prozent Beschäftigungsumfang: `17,50 €`

### Nachtserie

- [ ] Zwei Nachtdienste und anschließend einen Frühdienst anlegen
- [ ] In der Planung erscheint kein eigener Hinweis `Kurze Erholung nach Nachtserie`
- [ ] Gesetzliche Ruhezeit- oder andere weiterhin gültige Hinweise bleiben unverändert sichtbar

## 8. Darstellung und Bedienung — P1

- [ ] Hellmodus und Dunkelmodus vollständig durchlaufen
- [ ] Normale und größte verwendbare Systemschrift prüfen
- [ ] VoiceOver: Onboarding, Monatskalender, Schnellauswahl, Diensteditor und Einstellungen bedienen
- [ ] Alle primären Touchziele sind mindestens 44 × 44 Punkte und zuverlässig erreichbar
- [ ] Safe Areas, Tab-Leiste, Tastatur und Form-Sheets überdecken keine Bedienelemente
- [ ] Hochformat auf kleinem und großem iPhone prüfen; mindestens ein Lauf muss auf einem realen iPhone erfolgen
- [ ] Kalender bleibt bei zwölf Monaten realistischer Daten flüssig scrollbar

## 9. Automatisierte Ergänzung

Nach einem Pull Request müssen im EAS-iOS-Workflow folgende Maestro-Flows bestehen:

- [ ] `.maestro/onboarding.yml`
- [ ] `.maestro/core-navigation.yml`
- [ ] `.maestro/shift-lifecycle.yml`
- [ ] `.maestro/sqlcipher-persistence.yml`

Der EAS-Maestro-Lauf verwendet einen iOS-Simulator. Die Abschnitte 2 bis 8 bleiben deshalb zusätzlich auf dem registrierten realen iPhone erforderlich.

## 10. Ergebnis

| Feld                       | Eintrag                                             |
| -------------------------- | --------------------------------------------------- |
| Datum                      |                                                     |
| Tester                     |                                                     |
| iPhone / iOS               |                                                     |
| EAS-Build-ID / Buildnummer |                                                     |
| Git-Commit                 |                                                     |
| P0-Ergebnis                | `BESTANDEN` / `NICHT BESTANDEN`                     |
| P1-Ergebnis                | `BESTANDEN` / `MIT RESTPUNKTEN` / `NICHT BESTANDEN` |
| Evidenzordner              |                                                     |
| Offene Fehler              |                                                     |

Freigabe: Kein P0-Punkt darf offen sein. P1-Restpunkte benötigen eine dokumentierte Entscheidung und dürfen Datenschutz, Datenverlust, Barrierefreiheit oder Kernbedienung nicht beeinträchtigen.
