# Phase 2 – isolierter Kalender-Prototyp

## Vertrag

Ziel: Die Architekturhypothese aus Phase 1 auf dem iPhone prüfen. Ein gemeinsames
Koordinatenmodell ersetzt Messschleifen und den Austausch der Datumszahlen am
Animationsende. Datumszahlen bleiben zwischen beiden Endzuständen bestehen.
Der vorhandene Hauptkalender und PR 60 bleiben bis zur Geräteentscheidung offen.
Die Arbeit wird als Fortsetzung auf dessen Branch codex/calendar-year-crossfade
geführt; keine ungeprüften Vorarbeiten werden nach master übernommen.

Plattform: interne iOS-Preview, bestehender Build 31. SDK 57 / Reanimated 4.5.1
bleiben unverändert. Referenz: https://docs.expo.dev/versions/v57.0.0/sdk/reanimated/.
Erlaubt: Implementierung, Tests, Commit, Push, PR-CI und kompatible Preview-OTA.
Nicht erlaubt: Merge, nativer Build, Production-Veröffentlichung.

Scope: neue Prototype-Route, Screen, Canvas, gemeinsame Layoutfunktion und Tests;
Einstieg unter Mehr/Kalenderdiagnose; getrennte numerische Diagnose-Ereignisse.
Keine Datenbankabfragen, Schreibzugriffe, Gehaltslogik oder Benutzereinstellungen.

## Grenzen des Prototyps

Beispieldienste sind ausdrücklich synthetisch. Es werden keine echten Einträge
bearbeitet oder geladen. Monats-/Jahresnavigation erfolgt über die Pfeile und
Monatsauswahl. Kontinuierliches Wischen und die produktive Datenintegration sind
noch nicht enthalten. Ein schneller Prototyp beweist nicht die Performance der
späteren Gesamtintegration. Die Zahlen sind visuelle, redundante Glyphen; die
Monatsauswahl hat eigene zugängliche Beschriftungen und große Berührungsflächen.

## Architektur und Messung

Zwölf Monatsgeometrien werden vor der Auswahl aus Jahr und Viewport berechnet.
Ein gemeinsamer Fortschrittswert bewegt nur die Daten des ausgewählten Monats.
Keine measureInWindow-Aufrufe, RAF-Messschleifen, Pager-Neumontagen oder
Overlay-Übergaben. Neues Ziel ersetzt altes Ziel; veraltete Abschlüsse werden
ignoriert. Hintergrund/Blur und reduzierte Bewegung setzen einen Endzustand.

Opt-in-Messung über bestehende Diagnose: prototype-request, prototype-start und
prototype-end unterscheiden sich bewusst von Messungen des Hauptkalenders.
prototype-start bezeichnet den JS-Auftrag, nicht den ersten präsentierten Frame.
Es gibt keinen GPU-FPS-Nachweis. Visuelle Abnahme zusätzlich ohne Recorder.

## Geräteabnahme / Entscheidung

1. OTA laden, Daten im normalen Kalender kontrollieren.
2. Mehr → Kalender-Prototyp öffnen. Hinweis „Beispieldienste“ muss sichtbar sein.
3. Januar, September und Dezember jeweils öffnen und zur Jahresansicht zurück.
   Fünf Durchgänge (30 Richtungswechsel): kein Endsprung, keine dunklen Monate,
   keine Pause vor Beispieldiensten; Reaktion soll unmittelbar wirken.
4. Vier Jahre zurück, vier vor und Heute; schnelle Gegenbefehle ausprobieren.
5. Hell/Dunkel und Bewegung reduzieren prüfen. Prototyp verlassen: echte Dienste
   und Gehalt unverändert.
6. Optional Diagnose vor Schritt 2 starten und danach über Mehr teilen; Ziel
   p95 JS-Anforderung → Startauftrag unter 100 ms. Zusätzlich kurze Aufnahme
   für tatsächliche visuelle Bewegung, da Tests kein iPhone ersetzen.

Wenn der Prototyp besteht, wird die Integration in den Hauptkalender separat
abgegrenzt. Wenn nicht, keine weitere Serie von Timing-Patches: native
Profilierung bzw. ein anderer Renderer ist als eigene Entscheidung erforderlich.
