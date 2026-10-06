# Prüfung: gewählte Variante 3

## Ziel und Abnahme

Die vom Nutzer gewählte Visualisierung wird als direkt sichtbare Dienstfolge umgesetzt. Referenz: `pruefung-drei-varianten-2026-10-06/index.html`, Variante 3 und Vergleich hell/dunkel. Keine ineinander verschachtelten Erklärungen; kein Abschnitt „Über die Prüfung“.

- Plattform: iPhone, helle und dunkle bestehende App-Palette.
- Kurze Ruhezeit: Dienstende mit tatsächlichem Enddatum, Abstand `HH:MM h`, nächster Beginn mit Datum. Ein erforderlicher Grenzwert bzw. eine Ausgleichsfrist bleibt sichtbar.
- Arbeits-/Nachtserie: Anzahl aus dem bestehenden Befund, dekorative Reihe, zuverlässiger Zeitraum. Nicht vollständige Dienstdaten erzeugen keinen erfundenen Zeitraum.
- „Dienste ansehen“ öffnet alle betroffenen Dienste chronologisch im bereits abgenommenen, herunterziehbaren Auswahlfenster. Keine zweite Erklärungsebene.
- Unbekannte Hinweise bleiben als verständliche Zusammenfassung bzw. vollständiger Originaltext erhalten. Fehlende Dienste werden benannt.
- Freie Schriftvergrößerung, Umbruch, mindestens 44 pt für Aktionen.

## Grenzen und Dateiscope

Reine Prüfungsdarstellung; keine Änderung an Grenzwerten, Rechtsregeln, Tarifen, Datenbank, Geburtsdatum/Schaltern oder Kalender-Markierungen. Das vorhandene Zeitintervall mit Zeitzone wird wiederverwendet, damit Nachtwechsel und Sommerzeit keine falsche Ruhezeit erzeugen.

12 Dateien: Timeline-Modell mit Tests; vorhandener Hinweisinhalt und Tagesliste mit Komponententests; Monatsansicht/Test; allgemeiner Kartenhelper und Jahresansicht mit Test (entfallener Infoabschnitt); dieser Vertrag.

Branch `codex/check-timeline`, Basis `codex/compact-info-texts` @ f6595d0. UI-Stack bleibt erhalten. Die auf dem iPhone abgelehnte Erklärungsvariante von PR #280 wird für die Prüfungsansicht durch diesen Folgeauftrag ersetzt; keine Abnahme des alten UI behaupten. PR-Basis ist deshalb der UI-Stack, nicht `master`.

## Freigabe und Nachweise

Bestehende ausdrückliche Implementierungs-, Git- und interne Preview-OTA-Freigabe. Gezielte Timeline-/Interaktionstests, serielles `verify:fast`, Runtime-Kompatibilität, iOS-Export, PR-CI. Eine neue iPhone-Abnahme ist vor einem visuellen Merge erforderlich.

Expo ~57.0.22, Dokumentation: https://docs.expo.dev/versions/v57.0.0/.

## Erforderlicher CI-Fix

Die neue CI meldet `GHSA-68fv-2mgg-jv7q` in `source-map-js` 1.2.1. Die geprüfte Patch-Version ist 1.2.2: https://github.com/advisories/GHSA-68fv-2mgg-jv7q .

Zusätzlicher Scope: ausschließlich `package-lock.json`, drei geänderte Werte (Version, Registry-Quelle, Integrität). Separater Korrektur-Commit im bestehenden PR. Installierte Abhängigkeiten, Produktions-Audit, `verify:fast`, iOS-Export und Preview-Fingerprint werden vor der Veröffentlichung erneut geprüft. Die Audit-Regeln werden nicht abgeschwächt.
