# Dialogfarben und Lösch-Haptik – lokale Korrektur

## Auftrag

- Ziel: Gehalt/Arbeitszeitmodell aktualisieren native Kopf-Farben beim Systemfarbwechsel ohne App-Neustart; erfolgreiche Löschaktionen bleiben subtil.
- Plattform: iOS, bestehender Preview-Build. Android-Geräteabnahme bleibt außerhalb des Auftrags.
- Scope: Einstellungen-Editor, zentrale Haptik, Dienst-/Termin-Löschwege, Vorlagen-Editor und gezielte Tests (neun Dateien einschließlich dieser Notiz).
- Nicht-Ziele: Navigator-Remount, Kalenderumbau, Tarif-/Datenbankänderungen, globale Änderung von Warnungen oder Bestätigungsdialogen.
- Freigabe: lokale Umsetzung und Prüfung. Kein Commit, Push, PR, Merge, Build oder OTA.

## Umsetzung und Grenzen

Der Einstellungen-Editor abonniert die Palette direkt und liefert Hintergrund,
Titel-/Aktionsfarbe und Statusleistenstil an Stack.Screen. Kein Theme-Key und
kein Neuaufbau des Formulars; ungespeicherte Eingaben bleiben bestehen.
Die native Aktualisierung auf dem iPhone ist damit noch nicht bewiesen.

Alle drei betrachteten erfolgreichen Löschpfade nutzen deletionFeedback:
ein Soft-Impuls auf iOS, ein dezenter Tick auf Android, kein Web-Impuls.
Abbruch, Persistenz, Fehlerbehandlung sowie andere Erfolgs-/Warnsignale bleiben
unverändert. Native Systemhaptik des Bestätigungsdialogs wird nicht ersetzt.

Referenz: Expo SDK 57 (~57.0.20), versionierte Router-Stack- und Haptics-Dokumentation.

## Prüfung und spätere Abnahme

Gezielte Komponententests prüfen beide Richtungen des Farbwechsels für Gehalt
und Arbeitszeitmodell, den Erhalt eines ungespeicherten Feldes, genau einen
Soft-Impuls sowie den Lösch-Hook bei Erfolg, Fehler und Abbruch.
Diese Tests ersetzen keine native Geräteprüfung.

Lokales Ergebnis: `verify:fast` erfolgreich, einschließlich 729 Unit-/Strukturtests,
335 Komponententests und der Sicherheits-/Runtime-Prüfungen. Die acht gezielten
Tests sind ebenfalls separat erfolgreich. Unabhängige `.gitignore` unverändert.

Nach grüner lokaler Prüfung und separat freigegebener Auslieferung gemeinsam prüfen:

1. Hell → Dunkel → Hell, bei offenem Dialog und nach erneutem Öffnen, ohne App-Neustart.
2. Kopf, Titel, Speichern und Inhalt lesbar; ungespeicherte Eingaben bleiben erhalten.
3. Testdienst, Testtermin und Testvorlage löschen: subtile Rückmeldung; Abbrechen verändert keine Daten.

Eine gemeinsame Preview-OTA ist nach Runtime-Abgleich vorgesehen. Kein neuer
Build allein für diese JS-Änderungen eingeplant. Keine Geräteabnahme erfolgt.
