# Mehr bei großer Systemschrift

## Ziel und Scope

Die Mehr-Übersicht soll lange Beschreibungen bei großer iPhone-Systemschrift vollständig
darstellen. Referenz: Nutzerscreenshots vom 2026-09-20, iPhone 14 Pro Max.

Die vorhandenen Texte hatten bereits kein Zeilenlimit. Die exakte native Ursache der
abgeschnittenen Darstellung ist mit Komponententests nicht reproduziert. Dieses Paket
gibt den Beschreibungen bei großer Schrift bewusst mehr horizontalen Platz.

- Ab fontScale 1.3: Beschreibung unter der Titel-/Icon-/Pfeilzeile über die verfügbare Breite.
- Darunter: bisherige kompakte Textspalte neben dem Icon.
- useWindowDimensions reagiert auch auf Änderungen bei bereits geöffneter Seite.
- Keine Schriftverkleinerung, Skalierungsgrenze oder feste Zeilenhöhe.
- RowButton bietet das Layout optional an; nur Mehr und seine Diagnosezeilen aktivieren es.
- Keine Änderungen an Daten, Berechnungen, Unterseiten, Auswertung oder nativer Navigation.
- Kein pauschal vergrößerter Tab-Leisten-Abstand: automatische Insets bleiben erhalten.

## Dateiscope

- src/ui/design-system.tsx und zugehöriger Komponententest
- src/features/settings/settings-screen.tsx und zugehöriger Komponententest
- src/features/calendar/calendar-performance-controls.tsx (nur Layout-Weitergabe)

Der zuvor bestätigte Header-Fix bleibt im separaten Checkout keyboard-dismiss erhalten.
Dieses Paket liegt auf codex/more-dynamic-type, Basis origin/master 541efc8.
Nach Umsetzung separat freigegeben: Preview-OTA sowie anschließend Commit, Push, PR
und Merge nach erfolgreicher CI. Kein neuer nativer Build oder Production-Release.

## Abnahmekriterien

Automatisiert: Schriftfaktoren 1, 1.29, 1.3, 2 und 3.1; Layoutwechsel bei offener Seite;
unbegrenzte Skalierung; Tipp- und Langdruckaktionen; interne/Production-Sichtbarkeit.

Auf dem iPhone vorgelegte Abnahmekriterien:

1. Höchste Bedienungshilfen-Schriftgröße aktivieren und Mehr öffnen.
2. Lange Titel und Beschreibungen bei Gehalt, Prüfung, lokaler Datenspeicherung und
   internen Diagnosezeilen vollständig lesbar, ohne seitlichen oder vertikalen Beschnitt.
3. Bis Über LUNA Shift scrollen: letzte Zeile vollständig erreichbar oberhalb der Tab-Leiste.
4. Schriftgröße bei offener App normal → maximal → normal ändern, auch im Dunkelmodus.
5. Navigation sowie Langdruck zum Testlabor bleiben funktionsfähig.

Risiko: höhere Zeilen benötigen mehr vertikales Scrollen.

## Ergebnis am 2026-09-20

- verify:fast bestanden: 738 Unit-Tests, 390 Komponententests sowie weitere Skriptprüfungen.
- Preview-OTA 920bd125-eb6b-4217-9f1b-ee7fa7ab1d7d für Build 31 veröffentlicht.
- Runtime: eac302484061dfb3fa63e2a74b8618ff6000861c; bestehender Header-Fix enthalten.
- Nutzer bestätigte die Testliste mit „abnahme erfolgreich“. Gerät laut bisherigem
  Testkontext: iPhone 14 Pro Max, iOS 26.6.2. Kein neuer Screenshot nach dem Fix vorgelegt.
- Native Darstellung per Nutzerabnahme bestätigt; andere Geräte nicht separat geprüft.
