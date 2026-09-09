# Phase 3B – Hauptkalender integrieren

## Vertrag

Phase 3A mit echten Daten wurde vom Nutzer auf Build 31 abgenommen. Freigegeben:
Integration bis einschließlich kompatibler Preview-OTA. Kein Merge, kein neuer
nativer Build. Fortsetzung auf codex/calendar-year-crossfade / PR 60, da die
abgenommenen Vorstufen dort liegen. Expo SDK 57 (~57.0.20), Reanimated 4.5.1:
https://docs.expo.dev/versions/v57.0.0/sdk/reanimated/.

Zielplattform: iPhone 14 Pro Max, vorhandene interne Preview. Scope:
calendar-screen, neuer calendar-shared-scene, deren Tests und diese Dokumentation.
Keine Schema-, Gehalts-, Tarif- oder Native-Änderungen. Kein zweiter schreibbarer
Kalenderzustand und keine Verwendung des read-only Prototyp-Caches im Hauptpfad.

## Integration

- Monat und Jahr verwenden die im Prototyp abgenommenen Koordinaten, Glyphen
  und Eintragsflächen. Der Hauptkalender verwendet keinen CalendarTransitionHost
  und keine Messregistrierung mehr. Das aktive Monatsblatt bleibt bei Wechsel
  zur Jahresansicht bestehen; keine Übergabe zwischen Original und Overlay.
- Die virtualisierte Monatsliste bleibt für vertikales, seitenweises Scrollen
  erhalten. Entfernte Monatssprünge positionieren die Liste direkt am Ziel;
  normale Monat/Jahr-Wechsel am selben Datum und Datenaktualisierungen behalten
  die Liste. Entfernte Sprünge bleiben als zusätzlicher Gerätetest erforderlich.
- „Heute“ springt wie der abgenommene Prototyp direkt ans Ziel. Zwischenmonate
  werden nicht zur Animation durchlaufen. Alte Scroll-Ereignisse werden bis zum
  nächsten echten Drag ignoriert. Die Jahresnavigation positioniert auch die
  unsichtbare Monatsliste auf das neue Ziel.
- Der vorhandene Provider bleibt Quelle für Einträge und Schreibaktionen.
  Wiederholungen werden für das sichtbare Jahr plus Randmonate expandiert,
  nicht mehr für das ganze 61-Monate-Scrollfenster.
- Laden blendet den Kalender nicht aus; ein Hinweis kennzeichnet fehlende Daten.
  Tagesaktionen sind bis zum geladenen Zeitraum gesperrt. Feiertagshinweise
  beeinflussen die gemeinsame Kalendergeometrie nicht.
- Tages-Taps liefern die Position des berührten Feldes direkt. Popup, Editor,
  Schichtauswahl und Schnelleingabe behalten ihre bestehenden Aktionen. Einträge
  aktualisieren sich aus dem Provider ohne eigenen Cache nach Speichern/Löschen.
- Planungsmodus bewegt das ganze Monatsblatt nicht mehr zusätzlich nach oben,
  damit Datum und Jahresziel dieselbe Geometrie behalten.

## Prüfkriterien

Lokal: verify:fast, gezielte Szenen-/Navigationstests, Runtimevergleich.
CI: alle sieben Gates vor OTA. iPhone: Monat/Jahr in beiden Richtungen,
Januar/Dezember, schnelle Monats-/Jahreswechsel, Heute aus entfernten Jahren;
ein vollständiger Anlegen–Bearbeiten–Löschen-Durchlauf sowie Schnelleingabe,
Termine, Hell/Dunkel, reduzierte Bewegung und Daten nach Neustart.

Tests beweisen keinen flüssigen nativen Listenaufbau: Erst diese Geräteabnahme
entscheidet über Phase 3B. Alte Hilfsdateien anderer Ansichten bleiben bestehen;
deren spätere Bereinigung ist keine Voraussetzung für diese Abnahme.
