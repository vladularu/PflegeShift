# VG-02/VG-03: Datierter Grundbetrag

## Task-Vertrag

- Ziel: Die bereits erarbeiteten datierten Monatsperioden und den Grundvergütungsrechner in den aktuellen master integrieren: eigene persönliche Monatsvergütung, eigener Stundenlohn mit ausdrücklich bestätigter Abwesenheit und TVöD-P-Tabellenbetrag.
- Nicht-Ziele: Zuschläge, vollständiges Brutto, weitere Tarifadapter, Datenbankmigration, UI, native Änderungen oder OTA.
- Plattform: Gemeinsamer Offline-TypeScript-Kern, Expo ~57.0.22; https://docs.expo.dev/versions/v57.0.0/.
- Scope: Kontext, Basisrechner/Test, Stundenlohn, Diensttage, Testfixture, unabhängige Stundenlohn-/Grenztests und dieser Beleg (acht Dateien).
- Freigabe: Umsetzung sämtlicher Restaufträge sowie geprüfte Git-Lieferung vom Nutzer erteilt.

## Integration

Die ursprünglichen Dateien bleiben im Gesamtcheckout erhalten. Der Lieferbranch verbindet in dieser Stufe eigene Vergütung und die bereits gelieferten TVöD-P-Verträge 1/2/3/11. Weitere Tarifverfahren erhalten anschließend ihren eigenen geprüften Adapter. Der neue Kontext darf für unbekannte oder fehlende Paketkennungen keine Ersatzwerte berechnen.

Bestehende unveränderliche Legacy-Pakete werden nicht umgeschrieben. Die TVöD-P-Referenztests verwenden den aktuellen gelieferten Quellstand 2026-05-r3. In einem eingebetteten historischen Paket fehlende Gruppen bleiben unverfügbar; die ausdrückliche alte TVöD-Kennung ist die einzige eingebettete Kompatibilitätszuordnung.

## Abnahme

- Jeder Monat ist lückenlos in datierte Profil-/Regelperioden aufgeteilt; Lücken bleiben sichtbar, Teilbetrag und vollständiger Grundbetrag sind getrennt.
- Profilbeginn wird nicht aus Erstellungszeit abgeleitet. Mehrdeutige oder unvollständige Auswahl bleibt unverfügbar.
- Persönliches Monatsgehalt wird nicht ein zweites Mal nach Teilzeit gekürzt. Eigene Teilmonate erfordern bestätigte Aufteilung.
- Stundengrundbetrag verwendet tatsächliche Dienstminuten, einschließlich Mitternacht/Monatsgrenzen/Sommerzeit. Bezahlte Abwesenheit erfordert aktuelle ausdrückliche Minutenbestätigung.
- Pause mit nur Dauer bleibt bei grenzüberschreitender Zuordnung als Schätzung erkennbar.
- Centbeträge werden HALF_UP gerundet; tatsächliche Quelle und datierte Profilrevision bleiben am Ergebnis.
- Gezielte Tests, verify:fast und sieben grüne PR-CI-Prüfungen. Vollständige Monatsvergütung sowie Datenbank-/UI-/iPhone-Abnahme folgen separat.

## Nachweis

Prüfergebnisse werden im Lieferbranch ergänzt. Der Grundbetrag ist kein Nachweis eines vollständigen Bruttos; die VG-Hauptaufträge bleiben offen.
