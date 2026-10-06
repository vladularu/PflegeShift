# Kompakte Infotexte

## Task-Vertrag

- Ziel: Kernaussagen in normal lesbarer Schrift; Hintergrund bei Bedarf über ein einheitliches Info-Symbol.
- Plattform: iPhone, interne Preview-OTA auf dem bestehenden Runtime-Stand.
- Basis: Abgenommener UI-Stack `codex/grouped-salary-choice`, 73f2927.
- Nicht-Ziele: Fachregeln, Grenzwerte, Tarifdaten, gespeicherte Daten, Schalter oder Navigation ändern.
- Freigabe: Bestehende ausdrückliche Implementierungs-, Git- und Preview-OTA-Freigabe. Merge nach grüner PR-CI und iPhone-Abnahme.

## Dateiscope

- Neue gemeinsame `InfoDisclosure`-Komponente und Interaktionstest.
- Neue reine UI-Zusammenfassung für bekannte Prüfhinweise und Fachwert-Erhaltungstests.
- Tagesliste, aufgeklappter Prüfhinweis und allgemeine Prüfungsinfo.
- Infotexte neben den vorhandenen Prüfungsschaltern und kurze Einleitung der Gehaltseinstellungen.
- Bestehende Tests der Tagesliste, Prüfungsansicht und Prüfungseinstellungen; dieser Vertrag.

## Abnahmekriterien

1. Bekanntes Beispiel: „Nur 5,8 Std. Ruhezeit.“ statt eines langen Absatzes.
2. Vollständige Erklärung bleibt per Info-Symbol erreichbar; sie wird weder aus Fachmodell noch Export entfernt.
3. Zahlen, erforderliche Pausen, Ausgleichsfristen und Handlungshinweise bleiben in der Kernaussage. Unbekannte Textformate bleiben vollständig erhalten.
4. Keine abgekürzte Kernaussage durch Textabschneiden; große Systemschrift darf umbrechen. Bedienelemente mindestens 44 pt.
5. Jugendalter und Vollzeitschulpflicht bleiben direkt sichtbar; die Jugendlichenoption bleibt ein Schalter.
6. Fehlermeldungen, Speicherzustände und fehlende Pflichtangaben werden nicht versteckt.
7. Bisherige kompakte Dienstliste, gesetzliche Einstufung und Navigation bleiben funktional erhalten.

## Einheitliches Muster für weitere Infotexte

- Eine konkrete Kernaussage, keine wiederholte Beschreibung des sichtbaren Menüs.
- Wichtige Handlung und Voraussetzung sichtbar.
- Hintergrund nur nach bewusstem Öffnen.
- Lesbare normale Textgröße; kein zusätzliches Kleingedrucktes.

## Quellenkontrolle und Tests

Die Originaltexte und Fachregeln bleiben erhalten. Ruhezeit- und Jugendbereich-Abgrenzung wurden gegen `https://www.gesetze-im-internet.de/arbzg/__5.html` und `https://www.gesetze-im-internet.de/jarbschg/__2.html` geprüft. SDK: Expo ~57.0.22, Dokumentation `https://docs.expo.dev/versions/v57.0.0/`.

Gezielte UI- und Zusammenfassungstests, `npm.cmd run verify:fast`, kompatibler iOS-Export, PR-CI und echte iPhone-Abnahme.
