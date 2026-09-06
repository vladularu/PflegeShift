# Arbeitspaket 9B-B – Jahresanzeige und Ansichtswechsel

Ziel: Der Wechsel zwischen Monats- und Jahresansicht wirkt ruhig und die Orientierung
bleibt außerhalb des aktuellen Jahres eindeutig. Zielgerät ist ein iPhone 14 Pro Max
mit iOS 26.6.1 und dem installierten Preview-Build 31.

## Umsetzung

- Monats- und Jahresansicht erhalten unterschiedliche React-Schlüssel. Beim Öffnen
  wächst der ausgewählte Mini-Monat aus seiner Position in die Monatsansicht; beim
  Zurückgehen verkleinert sich die Monatsansicht wieder dorthin. Opacity und Skalierung
  laufen gemeinsam über 420 ms mit der ruhigen LUNA-Kurve.
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
Datenabdeckungsprüfung, zugehörige Tests und dieses Dokument. Unverändert bleiben
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

Die Änderung ist JavaScript/UI-only. Nach Commit, Push und grüner Pull-Request-CI ist
eine separat freizugebende Preview-OTA für Build 31 vorgesehen; ein neuer EAS-Build
ist nicht erforderlich, solange der Runtime-Fingerprint unverändert bleibt.
