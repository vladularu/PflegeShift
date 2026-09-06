# Arbeitspaket 9B-B – Jahresanzeige und Ansichtswechsel

Ziel: Der Wechsel zwischen Monats- und Jahresansicht wirkt ruhig und die Orientierung
bleibt außerhalb des aktuellen Jahres eindeutig. Zielgerät ist ein iPhone 14 Pro Max
mit iOS 26.6.1 und dem installierten Preview-Build 31.

## Umsetzung

- Referenz ist das 3,57 Sekunden lange iOS-Kalender-Video vom 6. September 2026:
  September → Jahresübersicht → September. Die ausgewählten Tageszahlen bewegen sich
  zwischen tatsächlicher Mini-Monatsposition und großem Monatsraster; Wochenabstände
  und Schriftgröße verändern sich unabhängig voneinander. Die Referenz wurde in
  100-ms-Zwischenbildern geprüft. Die eingestellten 600 ms sind eine Annäherung an
  den beobachteten Verlauf, keine ermittelte interne Apple-Animationskonstante.
- Beide Kalenderansichten bleiben montiert. Vor dem Übergang werden der Mini-Monat,
  die Nachbarmonate und die Zielpositionen der Tageszahlen nativ im gemeinsamen
  Fensterkoordinatensystem gemessen. Zwei übereinstimmende Messungen warten laufende
  Scroll-/Layoutanpassungen ab. Fehlende Messwerte überspringen die Animation nach
  spätestens 900 ms; der Zielkalender bleibt dann direkt bedienbar.
- Ein gemeinsamer UI-Thread-Fortschritt steuert die einzelnen Tageszahlen und ihre
  Heute-Markierung. Die echten Nachbarmonate bewegen sich mit ihren Beschriftungen
  aus dem Bild bzw. zurück. Nur kleine Monatselemente werden skaliert; die vollständigen
  Kalenderlisten erhalten keine Skalierung. Der große Kalender blendet im letzten
  Teil des Hineinzoomens ein. Seine Dienste, Termine und Wochentage bleiben unverändert.
- Abschluss, Richtungswechsel, Tab-Verlassen, Hintergrundwechsel und Größenänderung
  setzen den Zustand zurück. Übergangsgrafiken verschwinden nach Abschluss und sind
  für Screenreader verborgen. Veraltete Mess- und Animationsantworten werden verworfen.
- Monats- und Jahresansicht verwenden eine durchgehende, kartenlose Kalenderfläche.
  Wochenzahlen und flächige Wochenendbänder entfallen. Die Jahresansicht zeigt zwölf
  kompakte Mini-Monate in einem 3-mal-4-Raster mit ausgeschriebenen Monatsnamen.
- Überschrift und Bedienelemente im Kalenderkopf wechseln ebenfalls per Crossfade. Die
  bestehende Richtungsgeste für Monats- und Jahresnavigation bleibt erhalten.
- Im aktuellen Jahr zeigt die Monatsansicht weiterhin nur den Monatsnamen. In jedem
  anderen Jahr enthält die Überschrift zusätzlich immer die vierstellige Jahreszahl.
- Eine Jahresübersicht bleibt sichtbar, wenn das Zieljahr vollständig im vorhandenen
  Kalenderdatenfenster liegt, während das umgebende Fenster im Hintergrund nachlädt.
- Alle Übergänge verwenden die zentralen LUNA-Motion-Tokens und respektieren die
  Systemeinstellung „Bewegung reduzieren“.

## Abgrenzung

Betroffen sind Kalenderkopf, Ansichtscontainer, Monatsraster, Jahresraster,
Mess-/Geometriehilfen, Mini-Kalendermaße, Datenabdeckungsprüfung, zugehörige Tests
und dieses Dokument. Unverändert bleiben
Datenbankschema, Tarif- und Gehaltslogik, LUNA-Dienstfarben, Schnelleingabe,
Tages-Popup, Abhängigkeiten sowie native Konfiguration. Arbeitspaket 9B-A bleibt
unverändert.

## Abnahme

1. Aktuelles Jahr: Im Monatskopf steht nur der Monatsname. Fremdes Jahr: Monatsname
   und Jahr sind stets sichtbar.
2. Monatsansicht öffnen, Jahresansicht öffnen und einen Monat auswählen: Die Ansicht
   zoomt sichtbar aus dem gewählten Mini-Monat beziehungsweise dorthin zurück, ohne
   Sprung oder Überlappung.
3. Monats- und Jahresansicht wirken im Hell- und Dunkelmodus wie eine ruhige,
   durchgehende Kalenderfläche; Dienste, Termine und Feiertage bleiben erkennbar.
4. In der Jahresansicht vor- und zurückblättern: Bereits verfügbare Zieljahre bleiben
   ohne vollständiges Ladebild sichtbar und zeigen korrekte Dienste und Termine.
5. Schritte 1 bis 4 im Hell- und Dunkelmodus wiederholen. Mit aktivierter Einstellung
   „Bewegung reduzieren“ entstehen keine Verschiebungen oder Skalierungen.
6. App neu starten; Dienste und Gehalt bleiben vorhanden.
7. Januar, September und Dezember jeweils öffnen und zurückgehen: Alle zwölf Monate
   bleiben nach Abschluss vollständig sichtbar. Auch nach Scrollen der Jahresansicht
   beginnt bzw. endet die Bewegung am tatsächlich ausgewählten Mini-Monat.
8. Schnell hin und zurück wechseln; während des Übergangs den Tab wechseln und die
   App in den Hintergrund schicken: keine dunklen Monate, kein zurückbleibendes
   Overlay und keine blockierte Bedienung.

Status: lokale Umsetzung; der visuelle Vergleich und die Bildrate auf dem Zielgerät
sind noch nicht abgenommen. Die Ursache der vorherigen iOS-Abdunklung ist nicht durch
ein natives Profiling nachgewiesen. Tests sichern Geometrie und Lebenszyklus, ersetzen
aber den Gerätevergleich mit dem Referenzvideo nicht.

Die Änderung ist JavaScript/UI-only. Nach Commit, Push und grüner Pull-Request-CI ist
eine separat freizugebende Preview-OTA für Build 31 vorgesehen; ein neuer EAS-Build
ist nicht erforderlich, solange der Runtime-Fingerprint unverändert bleibt.
