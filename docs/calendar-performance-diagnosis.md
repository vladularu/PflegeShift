# Kalenderdiagnose – Phase 1

## Vertrag

Ziel: lokale, begrenzte Messdaten für den langsamen Monats-/Jahreswechsel sammeln.
Baseline: e3d89d7. Freigegeben: Diagnose, Commit, Push, CI, iOS-Preview-OTA.
Nicht freigegeben: Merge, native Builds, Änderungen an Animationskurven oder Daten.
Zielgerät: iPhone 14 Pro Max / iOS 26.6.1, bestehender Preview Build 31.
Scope: Recorder, Kalender-Messpunkte, Lade-Hook, interne Bedienung unter Mehr,
Export, Tests und dieses Dokument. Keine Datenbankänderungen oder neue Abhängigkeit.

## Bedienung und einheitlicher Testablauf

1. Diagnose-OTA laden. App neu öffnen, vorhandene Daten prüfen.
2. Unter Mehr: Kalenderdiagnose starten. Ein neuer Start ersetzt die vorige Messung.
3. Kalender: Jahresansicht → Januar → Jahresansicht; dasselbe mit September und
   Dezember. Diesen Block zweimal durchführen (12 Ansichtswechsel).
4. Zehn Monate weiter-/zurückwischen, danach in der Jahresansicht vier Jahre vor
   und vier zurück wechseln. Heute-Rücksprung prüfen. Keine Termine bearbeiten.
5. Unter Mehr: Diagnosebericht teilen; JSON in Dateien speichern und hier anhängen.
   Der Bericht bleibt bei abgebrochenem Teilen bis zum App-Neustart verfügbar.
6. Gerätetemperatur auffällig? Energiesparmodus aktiv? Bildschirmaufnahme aktiv?
   Diese Zustände bitte beim Bericht nennen; sie werden nicht automatisch erhoben.

## Daten und Schutz

Opt-in ausschließlich über sichtbare interne iOS-Preview-/Entwicklungssteuerung.
Keine automatische Aktivierung nach Neustart. Keine Telemetrie, keine Server-
Übertragung; allein der Nutzer entscheidet über Teilen im Systemdialog.
Maximal 2.000 Ereignisse und zehn Minuten; verdrängte Ereignisse werden gezählt.
Der Puffer liegt nur im Arbeitsspeicher. Verwerfen/Neustart löscht ihn.
JSON enthält technische Update-/Runtime-/App-/OS-Metadaten, relative Zeiten,
gewählte Monate und numerische Anzahlen. Keine Titel, Gehälter, Orte, Datenbank-
IDs, Notizen oder Fehlertexte. Feldnamen und Ereignisarten sind whitelisted.
Einzig selbst erzeugte temporäre Dateien werden nach Teilen/Abbruch/Fehler gelöscht.
Wenn eine Bereinigung scheitert, wird der Nutzer informiert; App-Daten bleiben unberührt.

## Interpretation

- `request-*`: Eintritt im JS-Handler, nicht Zeitpunkt des physischen Touch.
- `expand`/`index`: Dauer der synchronen Datenaufbereitung inkl. Rasterbereich bzw.
  Indexbildung; Anzahl Eingaben, Serien und Ausgaben. Keine erzwungene Neuberechnung
  nur zum Messen: bereits memoisiertes Material erzeugt kein neues Rechenereignis.
- `load-start`/`load-end`: gesamter Lade-Hook inkl. Abfrage/Abgleich, nicht reine SQL-
  Dauer. `month=YYYY00` bezeichnet hier das aktive Jahr. Veraltete Ergebnisse:
  `load-discard`; verworfen bedeutet nicht Abbruch der Datenbankabfrage.
- `commit`: Markierung im Layout-Effect, weder React-Renderdauer noch GPU-Präsentation.
- `pager-layout`: gemeldete Pagerhöhe. `prepare`, `measure`, `plan-ready`,
  `animation-start`, `animation-end`, `fallback`: Vorbereitung und Abschluss.
  Zusammengehörigkeit über `epoch`; `effect-cleanup` kann auch normaler Abschluss
  sein. Ein `animation-end` ohne vorausgehenden Start kann ein direkter Endzustand
  sein. `animation-start` ist JS-Startauftrag an Reanimated, nicht erster UI-Frame.
- `request` ist die aktuelle Anforderung bei der Ereignisaufnahme; bei Spans die
  Anforderung beim Start. Schnelle/ignorierte Eingaben erzeugen eigene IDs. Deshalb
  Animationspaare über `epoch` und Ladepaare über `load` zuordnen, nicht blind anhand
  der zuletzt eingegangenen Anforderung.
- `ui-frames`: aggregierte Abstände von Reanimated-UI-Callbacks, ungefähr ein
  Ereignis pro Sekunde. Anzahl, Maximum, Abstände >17/>34/>50 ms. KEINE GPU-FPS.
  Sampling nur im fokussierten Vordergrund-Kalender. Letztes unvollständiges Fenster
  wird verworfen; JS-Zeitpunkt des Berichteingangs kann hinter der UI-Messung liegen.

Recorder- und Messaufwand selbst beeinflussen das Ergebnis. Diese Diagnose grenzt
die Ursache ein und ersetzt keine anschließende Abnahme ohne aktive Messung.
GPU-/native Layout-/physische Touch-Profilierung benötigt bei Bedarf Instruments
und Mac-Zugang; wird durch diese OTA nicht behauptet. Keine Änderung am fachlichen
Verhalten, Datumsraster, Memo-Abhängigkeiten oder der Jahreslade-Strategie beabsichtigt.

## Gates

Unit-Tests: Opt-in, numerische Whitelist, Speicherlimit, Ablauf, Session-Isolation.
Komponententests: Start/Stopp/Verwerfen, Production-Ausblendung, Exportbereinigung,
UI-Frame-Bündelung und Vordergrundabschaltung. Bestehende Kalender-/Ladetests bleiben.
Vor OTA: verify:fast, iOS-Hermes-Export, unveränderter interner Fingerprint,
grüne PR-CI. Noch kein Geräte-Messbericht und keine Performance-Abnahme vorhanden.
