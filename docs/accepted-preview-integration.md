# Gemeinsamen abgenommenen Preview-Stand integrieren

## Ziel und Freigabe

Der gemeinsame iOS-Preview-Stand wird nach der ausdrücklichen Freigabe „github commit push pr und merge“ in GitHub gesichert und über eine PR nach `master` integriert. Basis ist `df6dc528df172c62e1d6999a60617665cd35b6fa` (PR #287), vor der Lieferung live abgeglichen. Branch: `codex/work-profile-one-handed`.

Der Dateiscope umfasst die 74 bisher uncommitteten, gemeinsam geprüften Dateipfade sowie diesen Integrationsnachweis. Unabhängige Änderungen in Hauptcheckout und anderen Worktrees bleiben unberührt. Es werden keine Fotoanhänge, Exportpakete, Zugangsdaten oder ignorierten Artefakte committet.

## Integrierte Arbeitspakete

1. Kalenderbild und Darstellung: vier Zusatzthemen entfernt; LUNA Standard/Hell/Dunkel/System; lokales Foto mit drei Sichtbarkeitsstufen, Entfernen/Rückgängig und bestätigtem Reset; gemeinsame echte Kalenderdarstellung, vollflächiger Kalenderhintergrund und kompakte Zwei-Wochen-Vorschau. Bestehende Schichtfarben und gespeicherte Präferenzen erhalten. Vorhandene native Bildmodule und Fotoberechtigung sind bereits in Preview-Build 33 enthalten.
2. Datenladen und Gehaltsgrundlage: Fehlercodes im Snapshot-Laden und kompatible Behandlung mehrfach gespeicherter Gehaltsgrundlagen. Gespeicherte Tarifentwürfe bleiben erhalten; ein Konflikt aktiviert kein Gehalt automatisch und wird erst durch eine ausdrücklich gespeicherte gültige Auswahl aufgelöst.
3. Arbeitsprofil: Übersicht mit gespeicherten Zusammenfassungen; normale persönliche, Arbeitszeit- und Gehaltsseiten; lokale Entwürfe, gemeinsames validiertes Speichern und Rückkehrschutz; kategorisierte Auswahlseiten mit Suche/Haken; feste untere Zurück-Aktionen mit Rückkehrziel und ein gemeinsamer Einstieg für Name/Arbeitgeber.

Keine Änderungen an Tarifberechnung, Zuschlagslogik, Feiertagsberechnung oder Dienstplanprüfung. Keine neue Datenbankschema-Migration. Die vorhandenen Profil-/Präferenzschlüssel werden weiterverwendet; Fotos bleiben lokal und außerhalb des JSON-Backups.

## Technische Nachweise

- `verify:fast` auf dem endgültigen App-Code bestanden: 400 Unit-Suiten / 7.656 Tests und 105 Komponentensuiten / 748 Tests, TypeScript, Lint ohne Warnungen, Formatierung und zusätzliche Projektgates.
- 22 gezielte Arbeitsprofil-/Footerfälle und echte SQLite-Persistenzprüfungen im vollständigen Testlauf bestanden.
- Lokaler interner iOS-Export erfolgreich. Die ausgelieferte OTA ist SHA-256-identisch mit diesem Export: `dab46276eb029aba0688dcebc39c896365dc17a35c35570bd97a705ff6bc82ec`.
- Preview-Build 33: `8deae8f8-679b-4284-978a-a07f74fa6719`, `com.pflegeshift.app.internal`; Runtime/Fingerprint `03d174d668f0ea5f757958dccf853632762c554d` live abgeglichen.
- Aktuelle iOS-Preview-OTA vom 6. Oktober 2026, 23:50 Uhr (Europe/Berlin): Gruppe `333f95b0-39c3-4fba-b589-ce4ef10c2d78`, Update `01a11332-6894-7880-a383-9f1ba7033093`. Preview-Kanal, neueste Gruppe, Manifest und tatsächlich heruntergeladenes App-Paket geprüft.
- Der vollständige Integrationslauf und die sieben GitHub-CI-Checks werden vor dem Merge geprüft; Ergebnisse stehen in der PR. Lokale Nachweise bleiben unter dem ignorierten `artifacts/`-Verzeichnis.

## Geräteabnahme und Grenzen

Die Kalender-/Darstellungsänderungen wurden anhand der iPhone-Screenshots korrigiert und anschließend vom Nutzer bestätigt („sieht amazing aus“). Die neuen Arbeitsprofil-Seiten wurden anhand der nächsten drei iPhone-Screenshots geprüft und um feste Footer/einen gemeinsamen persönlichen Einstieg ergänzt. Nach der finalen Footer-OTA bestätigt der Nutzer „ok passt“ und erteilt anschließend die GitHub-Lieferfreigabe.

Dies dokumentiert die Nutzerabnahme des sichtbaren iPhone-Flows im internen Preview-Build. Gerätetyp und iOS-Version wurden nicht angegeben. Dynamic Type, VoiceOver und das geöffnete Keyboard wurden nicht einzeln durch Gerätenachweise protokolliert; Android-Geräteabnahme steht aus. Exporte und CI ersetzen diese zusätzlichen Geräteprüfungen nicht.

## Detailnachweise

- [Kalenderbild und Ladefehler](calendar-custom-background.md)
- [Darstellung, Variante 3 und Korrekturen](appearance-variant-3.md)
- [Arbeitsprofil-Flow](work-profile-flow.md)
- [Einhändige Rückkehr und gemeinsame persönliche Bearbeitung](work-profile-one-handed.md)
