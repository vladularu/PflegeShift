# 9B-B – gemeinsame Kalendersteuerung, lokaler Kandidat

## Auftrag und Grenzen

Freigabe: Umsetzung und lokale Prüfung. Kein Commit, Push, OTA, Build oder Merge.
Basis: `2a81d7e`, bestehender Kalenderbranch, isolierter Checkout `calendar-sync`.
Zielgerät bleibt iPhone 14 Pro Max / iOS 26.6.1 / Preview Build 31.
Expo ~57.0.20, Referenz: https://docs.expo.dev/versions/v57.0.0/sdk/reanimated/.

Ziel: ein gemeinsamer Darstellungszustand für Monat/Jahr, sichtbaren Monat und
Übergangsabschluss. Datenprovider, Monats-Pager und Schreibaktionen bleiben
erhalten. Keine Änderung an Gehalt, Regeln, Datenbankschema oder Abhängigkeiten.
Farben, Kalenderglyphen, Chipformen und Animationstiming werden nicht geändert.

## Vertrag

- `useCalendarController` verwaltet den Animationsfortschritt, Übergangssperre,
  Abschlussgeneration und den beim Wischen sichtbaren Monat. Die gemeinsame
  Szene erzeugt im Hauptpfad keinen zweiten Controller.
- Der bestehende Datenmonat bleibt die Quelle für Pager-Seiten und Datenversorgung.
  Scroll-Ereignisse melden nur den überwiegend sichtbaren Monat an den Controller.
  Erst der vorhandene Scroll-Ende-Pfad veröffentlicht den Datenmonat. Abgebrochene
  Wischbewegungen können die Überschrift zurückführen, ohne Datenladungen auszulösen.
- Die Kopfzeile folgt dieser Darstellung ohne eigene Enter/Exit-Animationen oder
  wechselnde Textinstanzen. Jahr/Monat benutzen denselben Modus wie die Szene.
- Jeder Animationsauftrag hat eine Generation auf JS- und UI-Seite. Alte Abschlüsse
  dürfen weder den Fortschritt noch die aktuelle Übergangssperre verändern.
- Der Monats-Endzustand blendet den äußeren Jahrescontainer explizit aus, unabhängig
  von der inneren animierten Deckkraft. Die Jahresfläche bleibt montiert.
- Heute-Revision, Moduswechsel und Fokusverlust verwerfen die Scroll-Vorschau.
  Hintergrundwechsel beendet den Übergang am aktuellen Ziel. Unmount invalidiert
  verspätete Abschlussmeldungen.

## Einzige beabsichtigte Layoutkorrektur

Die hohe, unsichtbare Warnungsreservierung entfällt. Ein Hinweissymbol im Kopf
öffnet den vollständigen Lade-/Feiertagshinweis. Sein horizontaler Platz bleibt
konstant, damit Auftauchen einer Warnung nicht die Titelbreite verändert. Keine
Warnung über Kalenderzellen oder Tabbar. Diese sichtbare Korrektur muss auf dem
Gerät mit langen Monatsnamen, fremdem Jahr und vergrößerter Schrift geprüft werden.
Sie ist noch keine gestalterische Abnahme.

## Nachweise und Abnahme

Regressionen: verspätete UI-Abschlüsse, Hintergrund/Unmount, Heute-Revision,
Vorschau ohne Provider-Veröffentlichung, genau eine Veröffentlichung am Scroll-Ende,
unveränderte Titelinstanz, lesbarer Hinweisdialog, unsichtbare Jahresfläche am Ende.
Zusätzlich vollständiges `verify:fast` und lokaler iOS-Export.

Gerät offen: Januar/September/Dezember erstmals öffnen, schnelle Wischwechsel in
beide Richtungen, Jahreswechsel/Heute, Hell/Dunkel, Bewegung reduzieren,
Schriftvergrößerung sowie Dienste und Gehalt nach Neustart. Keine Behauptung über
native Flüssigkeit allein aus Komponententests oder Export.

Abbruchregel: Ein nötiger Pager-Neubau erweitert dieses Paket nicht automatisch.
Scheitert der spätere gebündelte Gerätekandidat, folgt eine Architekturentscheidung
statt einer weiteren ungezielten Timing-/OTA-Korrektur.

## Lokales Ergebnis, 09.09.2026

- `verify:fast` bestanden: 601 Unit-Tests, 260 Komponententests sowie sämtliche
  Skriptprüfungen; Typecheck, React-Compiler/Lint und Formatierung ohne Fehler.
- Interner iOS-Hermes-Export bestanden, Bundle
  `entry-abb5a5793e49fb8c9a3aa683f72d8ce0.hbc`.
- iOS-Runtime unverändert: `eac302484061dfb3fa63e2a74b8618ff6000861c`.
- Graft-Graph neu erzeugt, als lokales Artefakt unter
  `artifacts/calendar-controller-graph` abgelegt, ohne Ignore-Dateien zu ändern.
- Kein Commit, Push, EAS-Build, OTA oder Merge. Geräteabnahme ausstehend.
