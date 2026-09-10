# 9E – Ortskarten in Kalender-Editoren

## Vertrag

Ziel: Vorhandene Ortskarten auch bei Kalenderdiensten und Terminen anzeigen.
Zielgerät: iPhone 14 Pro Max, iOS 26.6.1, interner Preview-Build 31.
Freigabe: Umsetzung, Tests, Commit, Push, PR, CI und Preview-OTA.
Merge erst nach Geräteabnahme.

Nicht-Ziele: Kalendernavigation, Animationen, Datenmodell, Speicherung,
Berechnungen, neue native Module oder Berechtigungen, automatische Geokodierung.

## Umsetzung und Scope

DayEditorForm übergibt den vollständigen Ort an ShiftEditOverlay und
AppointmentEditOverlay (einschließlich ShiftEditOverlayProps). Beide verwenden
unter der Ortszeile die vorhandene LocationPreview wie die Dienstvorlagen.
Ohne Koordinaten bleibt nur der Ortsname sichtbar. Ohne Ort gibt es keine Karte.
LocationMap bindet den Kartenausschnitt an die aktuellen Koordinaten statt nur
an den Anfangswert. Marker und Ausschnitt wechseln dadurch gemeinsam.

Zusätzlich: Overlay-Regressionstests, nativer Kartenkomponententest und dieses
Dokument. Kein neuer Kartenanbieter, keine Standortabfrage und keine Migration.
Bestehende Kartenanbieter können zum Laden der Karte Netzwerkzugriff benötigen;
Offline-Karten werden nicht zugesichert.

SDK-Referenz: https://docs.expo.dev/versions/v57.0.0/sdk/map-view/

## Geräteabnahme – offen

1. OTA laden; vorhandene Daten unverändert.
2. Dienst und Termin mit gespeicherten Koordinaten öffnen: Karte sichtbar.
3. Ort wechseln: Markierung und Ausschnitt zeigen den neuen Ort.
4. Karte antippen: vorhandene Kartenöffnung funktioniert.
5. Speichern und erneut öffnen; Ortsdaten korrekt. Abbruch ohne Datenänderung.
6. Ohne Ort und bei reinem Ortsnamen: keine leere Kartenfläche.
7. Hell/Dunkel und kleine Bildschirmfläche: scrollbare, erreichbare Aktionen.
8. Dienstvorlage mit Karte kurz gegenprüfen.

Komponententests ersetzen keine native Karten- und Geräteabnahme.
