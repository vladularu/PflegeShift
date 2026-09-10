# Kalender: Feiertagslayout-Korrektur

## Auftrag und Grenzen

Ziel: Dienstkacheln beginnen an Feiertagen auf derselben Höhe wie an Nachbartagen.
Der Feiertagsname steht unter den sichtbaren Einträgen und dem etwaigen Überlaufhinweis.
Zielplattform: iOS-Preview; Geräteabnahme nach OTA ist noch offen.
Freigabe: Umsetzung, lokale Prüfung, Commit, Push, PR, CI und Preview-OTA.
Kein Merge vor Geräteabnahme und gesonderter Freigabe.

Nicht-Ziele: Feiertagsberechnung oder -abdeckung, Datenänderungen, Farben,
Kachelgrößen, Wochenhöhen, Navigation, Scrollen, Jahresanimation und native Module.
SDK-Referenz: https://docs.expo.dev/versions/v57.0.0/sdk/updates/

## Scope und Absicherung

- `src/features/calendar/calendar-prototype-canvas.tsx`: nur die Reihenfolge der
  vorhandenen Feiertagszeile ändern. Zeilenbudget, Überlaufberechnung und
  Barrierefreiheit bleiben unverändert. Dies ist der aktive Hauptkalenderpfad.
- `src/features/calendar/calendar-prototype-canvas.component.test.tsx`: Reihenfolge
  und gleicher Inhaltsbeginn mit/ohne Feiertag in Hell/Dunkel; Feiertag ohne
  Einträge; ausgeblendete Feiertage; volle Tage in kurzen Sechs-Wochen-Monaten.
- Dieses Dokument.

Die neuen Reihenfolgetests reproduzierten vor der Korrektur den Versatz.
Die bestehenden Regeln für knappen Platz bleiben bestehen: nicht passende Einträge
werden über `+N` angezeigt, statt in die nächste Woche hineinzuragen.
Komponententests prüfen Struktur und Maße, nicht das reale iPhone-Layout.

## Lokale Prüfung

- Fokussiert: 15 Komponenten- und 2 Überlauf-Unit-Tests bestanden.
- `verify:fast` vollständig bestanden: 606 Unit- und 308 Komponententests sowie
  die weiteren Skriptprüfungen. Der erste Lauf hatte während parallelem Export
  einen 5-Sekunden-Timeout im bestehenden Navigationstest; der vollständige
  Wiederholungslauf ohne Export bestand unverändert, ohne Testlimit-Anpassung.
- Interner iOS-Export erfolgreich. Runtime-Fingerprint unverändert:
  `eac302484061dfb3fa63e2a74b8618ff6000861c`.

## Geräteabnahme

1. OTA laden und vorhandene Daten prüfen.
2. Oktober 2026: Dienst am 3. Oktober beginnt auf gleicher Höhe wie die Dienste
   am 1./2. Oktober; Feiertagsname steht darunter. Hell und Dunkel prüfen.
3. Feiertag ohne Dienst und voller Tag: Name bzw. Überlaufhinweis bleiben sichtbar,
   keine Überlappung mit der nächsten Woche.
4. Monatswechsel, Heute-Rücksprung und Jahreswechsel kurz gegenprüfen.

Kein neuer nativer Build vorgesehen. Vor Veröffentlichung muss der interne
iOS-Runtime-Fingerprint zum installierten Preview-Build passen.
