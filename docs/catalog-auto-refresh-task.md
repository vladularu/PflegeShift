# Automatische Tabellenaktualisierung

## Auftrag

Ziel: Die interne Preview-App prüft beim Start und beim Zurückkehren aus dem Hintergrund automatisch auf geprüfte Tabellen. Der Nutzer braucht dafür keine Aktion im Testlabor. Erfolgreiche Prüfungen haben 15 Minuten Abstand pro Gerät; nach Fehlern gilt eine Wiederholungssperre von 5 Minuten. Gleichzeitige automatische und manuelle Prüfungen teilen einen laufenden Vorgang.

Nicht-Ziele: neue Ansichten oder Einstellungen, Änderungen an Gehaltsregeln, Tarifwerten, Datenbankstruktur, nativen Abhängigkeiten oder Production-Verteilung.

Plattform: iPhone, interne Preview, Expo ~57.0.22. SDK-57-Dokumentation und AppState-Dokumentation für React Native 0.86 vor der Änderung geprüft. Basis ist der abgenommene einfache App-Stand nach PR #284 auf codex/tariff-table-app-base; master enthält weiterhin andere ältere UI-Arbeit und ist daher kein zulässiger App-Lieferstand.

Dateiscope: dieser Vertrag; RuleCatalogRuntimeProvider und seine Komponententests; Katalog-Kanalkonfiguration; Runtime-Port-Factory und ihre Tests; bestehender synchronisierter Zeitplan und seine Datenbanktests (acht Dateien).

Akzeptanz: Start/Foreground lösen einen automatischen Versuch aus, Hintergrund und doppelte active-Ereignisse nicht. Der persistierte 15-Minuten-Abstand gilt auch über Neustarts. Ein alter 24-Stunden-Zeitplan wird auf den neuen zulässigen Horizont begrenzt; fehlende Generation 6 erhält einen einmaligen Sofortversuch. Laufende Downloads blockieren die App nicht; Offline- und Signaturfehler behalten den letzten gültigen Katalog. Ohne neue Generation werden nur die zwei Manifestdateien geprüft. Kein Timer läuft bei geschlossener oder dauerhaft geöffneter App.

Prüfung: gezielte Lifecycle-, Parallelitäts-, Zeitplan- und Offline-Tests; verify:fast; PR-CI; kompatibler iOS-Export und Preview-OTA. Auf dem iPhone anschließend automatischen Download und Offline-Nutzung prüfen. Vorhandene Freigabe für Commit, Push, PR und interne Preview-Lieferung gilt; die neue Geräteabnahme wird getrennt erfasst.

## Last

Generation 6: Manifest 2.324 Bytes, normaler Versionscheck zwei Dateien bzw. 4.648 Bytes Nutzdaten; die vier Pakete umfassen 119.054 Bytes und werden nur beim Versionswechsel geladen. Beispielrechnung: 10.000 Geräte mit zehn tatsächlichen Prüfungen täglich erzeugen etwa 465 MB Manifest-Nutzdaten täglich (ohne HTTP-Overhead), nicht zehn Vollpaketdownloads pro Gerät. Das ist eine Größenrechnung, kein Lasttest. Öffentliche Storage-Dateien werden über das Supabase-CDN bereitgestellt; konkrete Kapazität und Kosten hängen vom Projektkontingent und Nutzungsverhalten ab.

## Lokaler Nachweis

21 gezielte Zeitplan-/Port-/Downloadtests und 12 Lifecycle-Komponententests sind grün. Der frisch über EAS Preview berechnete iOS-Fingerprint stimmt mit dem installierten Preview-Build 32 überein: `f2f4b99ba254b82ab22b99594d5228bd8c3774f7`. Die lokalen Quelländerungen betreffen ausschließlich die acht genannten Auftragsdateien.

Gesamtprüfung: `verify:fast` vollständig bestanden (7.597 Unit-Tests und 688 Komponententests); der interne iOS-Export in der EAS-Preview-Umgebung ist erfolgreich.
