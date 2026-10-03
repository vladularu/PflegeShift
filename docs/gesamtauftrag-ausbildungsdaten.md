# AZ-01/AZ-02: Datierte Ausbildungs- und Jugendangaben

## Task-Vertrag

- Ziel: Vorhandene Ausbildungsdaten, bestätigte Schul-/Prüfungs-/Pausenintervalle und Jugendangaben in den aktuellen master integrieren; weitere Rechenadapter verwenden später denselben Vertrag.
- Nicht-Ziele: Rechtsprüfung oder Tarifberechnung aktivieren, native Module, UI, Datenbank, OTA.
- Plattform: Gemeinsame TypeScript-Fachverträge, offlinefähige Expo-57-App. Expo ~57.0.22; https://docs.expo.dev/versions/v57.0.0/.
- Scope: Drei Domain-Module, drei bestehende Tests, unabhängiger Domain-Testfixture und dieser Beleg (acht Dateien).
- Freigabe: Nutzer hat alle Restaufträge und die Git-Lieferung freigegeben.

## Abnahme

- Alter, Ausbildung, Vollzeitschulpflicht und tarifliches Ausbildungsjahr bleiben unabhängige ausdrücklich bestätigte Angaben.
- Keine Rückdatierung oder automatische Fortschreibung des Ausbildungsjahres; datierte Auswahl ist eindeutig.
- Unbekannte Pausen/Wege bleiben unbekannt; bestätigte Null und leere Pausenliste sind eigene Zustände.
- Echte Zeitpunkte schützen vor geratenen Uhrzeiten beim Sommerzeitwechsel. Schul-/Prüfungsintervalle und Pausen sind minutengenau und überschneidungsfrei.
- Dienst- und Pausenbindung umfasst Revision, Datum, Inhalt und Zeitzone. Historische Bestätigungen bleiben lesbar, werden nach Änderungen nicht ungeprüft angewendet.
- Versionen 1/2/3 bleiben lesbar; keine impliziten neuen Felder in älteren Versionen.
- Fokussierte Tests, verify:fast und sieben erfolgreiche PR-CI-Prüfungen; Rechtsquellen, Jugend-Rechenadapter und spätere iPhone-Abnahme bleiben eigenständige Gates.

## Nachweis

03.10.2026: 59 gezielte Tests und verify:fast mit Exit 0 (2.131 Unit-/Integrationstests, 472 Komponententests; alle Script-Gates). Quellcommit 756c4b7 auf dem gemergten master 3a89a49 integriert. Doppelte Profilbeginne einschließlich zukünftiger Dubletten und fehlerhafte gespeicherte Metadaten werden zusätzlich abgewiesen; die Auswahl liefert eine unabhängige eingefrorene Kopie. AZ-01/AZ-02 bleiben bis zur Datenbank-/UI-Anbindung und Abnahme offen.
