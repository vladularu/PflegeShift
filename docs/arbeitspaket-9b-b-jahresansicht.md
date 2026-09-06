# Arbeitspaket 9B-B – Jahresanzeige und Ansichtswechsel

Ziel: Der Wechsel zwischen Monats- und Jahresansicht wirkt ruhig und die Orientierung
bleibt außerhalb des aktuellen Jahres eindeutig. Zielgerät ist ein iPhone 14 Pro Max
mit iOS 26.6.1 und dem installierten Preview-Build 31.

## Umsetzung

- Monats- und Jahresansicht erhalten unterschiedliche React-Schlüssel und werden als
  vollständige Szenen mit einem reinen Opacity-Crossfade gewechselt. Es werden keine
  Layoutwerte, Verschiebungen oder Skalierungen animiert.
- Überschrift und Bedienelemente im Kalenderkopf wechseln ebenfalls per Crossfade. Die
  bestehende Richtungsgeste für Monats- und Jahresnavigation bleibt erhalten.
- Im aktuellen Jahr zeigt die Monatsansicht weiterhin nur den Monatsnamen. In jedem
  anderen Jahr enthält die Überschrift zusätzlich immer die vierstellige Jahreszahl.
- Eine Jahresübersicht bleibt sichtbar, wenn das Zieljahr vollständig im vorhandenen
  Kalenderdatenfenster liegt, während das umgebende Fenster im Hintergrund nachlädt.
- Alle Übergänge verwenden die zentralen LUNA-Motion-Tokens und respektieren die
  Systemeinstellung „Bewegung reduzieren“.

## Abgrenzung

Betroffen sind Kalenderkopf, Ansichtscontainer, Datenabdeckungsprüfung, zugehörige
Tests und dieses Dokument. Unverändert bleiben Datenbankschema, Tarif- und
Gehaltslogik, Farben, Schnelleingabe, Tages-Popup, Abhängigkeiten sowie native
Konfiguration. Arbeitspaket 9B-A bleibt unverändert.

## Abnahme

1. Aktuelles Jahr: Im Monatskopf steht nur der Monatsname. Fremdes Jahr: Monatsname
   und Jahr sind stets sichtbar.
2. Monatsansicht öffnen, Jahresansicht öffnen und einen Monat auswählen: Inhalt,
   Überschrift und Bedienelemente blenden ruhig um, ohne Sprung oder Überlappung.
3. In der Jahresansicht vor- und zurückblättern: Bereits verfügbare Zieljahre bleiben
   ohne vollständiges Ladebild sichtbar und zeigen korrekte Dienste und Termine.
4. Schritte 1 bis 3 im Hell- und Dunkelmodus wiederholen. Mit aktivierter Einstellung
   „Bewegung reduzieren“ entstehen keine Verschiebungen oder Skalierungen.
5. App neu starten; Dienste und Gehalt bleiben vorhanden.

Die Änderung ist JavaScript/UI-only. Nach Commit, Push und grüner Pull-Request-CI ist
eine separat freizugebende Preview-OTA für Build 31 vorgesehen; ein neuer EAS-Build
ist nicht erforderlich, solange der Runtime-Fingerprint unverändert bleibt.
