# Gesamtauftrag: Persönliche Bestätigungsverträge

## Task-Vertrag

- Ziel: Gemeinsame, streng validierte Verträge für bezahlte Abwesenheit, Tagesaufteilung bestätigter Überstunden, tarifgebundene Zulagenentscheidungen sowie tatsächliche und tarifliche Sonderzahlungen in aktuellen master integrieren.
- Nicht-Ziele: Neue Ansprüche/Satzdaten, Datenbankmigration, UI, Bruttoaktivierung, native Änderung oder OTA.
- Plattform: TypeScript, offlinefähige Expo-57-App. Expo ~57.0.22; Referenz https://docs.expo.dev/versions/v57.0.0/.
- Scope: Neun ursprüngliche Domain-Dateien, dieser Vertrag, ein unabhängiger Domain-Testfixture und direkte Vertragsregressionen (12 Dateien). Ursprüngliche Testimporte werden im Lieferbranch von späteren Rechenadaptern gelöst.
- Nutzerfreigabe: Umsetzung aller Restaufträge sowie Commit, Push, PR und Merge nach erfolgreicher CI.

## Abnahme

- Fehlende Bestätigung, bestätigte Null und Widerruf bleiben unterscheidbar.
- Eintragsrevision, Datum, Aktualisierung und Zeitzone binden Abwesenheit an den gespeicherten Eintrag; Änderungen erzwingen neue Bestätigung.
- Überstunden bleiben explizite Zuordnung; alte Dienste erzeugen keine neue Bestätigung.
- Zulagenentscheidungen sind an Tarif, Variante und Region gebunden und überlappen nicht.
- Sonderzahlungsangaben bleiben persönliche Angaben, getrennt von Tarifquellen und tatsächlicher Auszahlung. Unbekannte Angaben bleiben null.
- Alle Validatoren weisen unbekannte Felder, ungültige Zeiträume, Mehrdeutigkeit und unsichere Zahlen zurück; Ergebnisse sind unveränderliche Kopien.
- Fokussierte Vertragsfälle und verify:fast; sieben grüne CI-Prüfungen vor Merge. Die DB-/Backup-Anbindung folgt separat mit gesamter Datenbanksuite.

## Nachweis

03.10.2026: 81 fokussierte Vertragsfälle und verify:fast mit Exit 0 (2.072 Unit-/Integrationstests, 472 Komponententests; alle Script-Gates). Basis ist der gemergte Katalog-V2-Stand b619fac; Quellcommit 8352db0 wurde ohne Kopieren oder Zurücksetzen des ursprünglichen Checkouts integriert. Die VG-Hauptaufträge bleiben bis zur vollständigen Anbindung und fachlichen Abnahme offen.
