# Arbeitsprofil: einhändige Rückkehr

## Scope und Abnahme

Branch `codex/work-profile-one-handed`, auf dem zuletzt ausgelieferten gemeinsamen Preview-Stand. Expo SDK 57 (`~57.0.22`), vorhandene Komponenten und Tokens. Bestehende Änderungen sind in `artifacts/work-profile-one-handed-before.json` abgesichert. Die drei iPhone-Screenshots der Arbeitsprofil-OTA vom 6. Oktober 2026 bestätigen die Ausgangsdarstellung; der Nutzer bittet um eine leichter erreichbare Rückkehr und einen eindeutigen Einstieg für Name/Arbeitgeber.

Zielplattform: iOS/iPhone. Ziel: feste untere Rückkehr auf Übersicht, Bearbeitungs- und Auswahlseiten; Ziel der Rückkehr wird im Button genannt. Ein gemeinsamer Einstieg „Name & Arbeitgeber“ zeigt beide gespeicherten Werte und öffnet die bestehende gemeinsame Bearbeitung. Kein zusätzlicher Speicherbutton auf der Übersicht oder in Auswahllisten.

Nicht-Ziele: Tarif-/Schicht-/Feiertagsberechnung, Prüfannahmen, Speicherverträge, native Integration, übrige App-Seiten. Keine Migration und keine Rücksetzung gespeicherter Werte. Der Implementierungsauftrag enthielt keine Veröffentlichung. Anschließend wurde das iOS-Preview-OTA durch „ota“ ausdrücklich freigegeben und wie unten dokumentiert veröffentlicht; kein Commit oder Push.

Dateiscope: `src/ui/sheet-back-footer.tsx` (optionaler Zieltext), neue `src/features/settings/profile-page.tsx` (fester Footer, Safe Area, bestehendes Formular), `work-profile-screen.tsx`, `settings-editor-screen.tsx`, `profile-selection.tsx`, Test-Helfer und drei gezielte Komponentensuiten sowie diese Dokumentation.

Abnahmekriterien: Rückkehr ohne Scrollen erreichbar; mindestens 44 pt Touchfläche und Abstand zum Home-Indikator; eindeutiger Rückkehrtext; Auswahl-Abbruch verändert den Elternentwurf nicht; Zurück aus einem geänderten Editor nutzt die vorhandene Verwerfen-Rückfrage; laufendes Speichern sperrt Rückkehr; Name/Arbeitgeber bleiben gemeinsam bearbeitbar, Werte und Persistenz unverändert.

## Umsetzung und Prüfungen

- Übersicht: ein gemeinsamer Einstieg „Name & Arbeitgeber“ mit beiden gespeicherten Werten. Die vorhandene persönliche Bearbeitung und deren gemeinsames Speichern bleiben erhalten.
- `ProfilePage`: vorhandenes `FormScreen` mit separatem, festem Footer; Abstand zum Home-Indikator über vorhandenen Safe-Area-Kontext, mindestens 48 pt Buttonhöhe. Bestehender `SheetBackFooter` unterstützt optionalen Zieltext und umbrechende Beschriftungen.
- Übersicht: „Zurück zu Mehr“. Bearbeitung: „Zurück zum Arbeitsprofil“. Auswahllisten: Rückkehr zur jeweils geöffneten Arbeitszeit-/Gehaltsseite, ohne den Wert zu übernehmen. Der Rückkehrtext wird aus der Elternseite in den temporären Auswahlkontext übernommen und nicht persistiert.
- Editor-Rückkehr nutzt `router.back()` und damit den bestehenden Schutz bei ungespeicherten Änderungen; während der gemeinsamen Speicherung ist sie gesperrt. Der Footer schließt bei Betätigung die Tastatur. Das vorhandene Verhalten zum Scrollen/Dismissen der Tastatur bleibt erhalten.
- 22 gezielte Komponentenfälle bestanden, einschließlich unverändertem/ungespeichertem Entwurf, Auswahl-Abbruch, gemeinsamem persönlichen Einstieg, Footer außerhalb des Scrollbereichs, Safe Area und Speichersperre.
- `npm.cmd run verify:fast` erfolgreich (Exit 0): 400 Unit-Suiten mit 7.656 Tests; 105 Komponenten-Suiten mit 748 Tests; TypeScript, Lint ohne Warnungen, Formatierung und alle übrigen Projektgates bestanden. Protokoll: `artifacts/work-profile-one-handed-verify-fast.log`.
- Lokaler iOS-Export erfolgreich (Exit 0), interne Variante: `dist/ios-work-profile-one-handed`; Protokoll: `artifacts/work-profile-one-handed-ios-export.log`. Kein nativer Build; das anschließend separat freigegebene OTA ist unten dokumentiert.
- Graft-Kontextgraph aktualisiert. 64 vorher vorhandene Dateien außerhalb des freigegebenen Scopes bleiben SHA-256-identisch. Hauptcheckout und ursprünglicher Kalenderbild-Checkout bleiben unberührt.
- Keine Datenmigration, keine Änderungen an Profil-/Foto-Speicherung oder Berechnung.

Referenz der verwendeten SDK-Version: [Expo Router Stack, SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/router/stack/) und [Safe Area, SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/safe-area-context/).

## Noch auf dem iPhone abnehmen

1. Footer auf Übersicht, allen drei Editoren und Arbeitszeit-/Tarif-Auswahllisten ohne Scrollen erreichbar; korrekter Rückkehrtext und Abstand zum Home-Indikator.
2. Geänderter Entwurf: „Weiter bearbeiten“ erhält Eingaben, „Änderungen verwerfen“ kehrt zurück; Auswahl-Abbruch erhält den Elternentwurf. Speichern, Abbrechen und Neustart weiterhin prüfen.
3. Lange Werte/Buttontexte, kleine Displays, Dynamic Type, VoiceOver, Hell-/Dunkelmodus und geöffnetes/geschlossenes Keyboard; bei geöffnetem Keyboard das Dismiss-/Scrollverhalten auf dem Gerät prüfen.
4. Der gemeinsame Einstieg zeigt Name und Arbeitgeber, öffnet genau eine Bearbeitung und aktualisiert nach erfolgreichem Speichern beide Werte.

Kandidatennachweis: `artifacts/work-profile-one-handed-candidate-proof.json`. Die Nachweise der vorherigen OTA bleiben als historische Prüfstände erhalten.

## Preview-OTA vom 6. Oktober 2026

Durch „ota“ ausdrücklich freigegeben und am 6. Oktober 2026 um 23:50 Uhr (Europe/Berlin) veröffentlicht. Der bereits geprüfte Export aus `dist/ios-work-profile-one-handed` wurde ohne erneutes Bundling mit `APP_VARIANT=internal`, Branch/Kanal `preview`, Plattform `ios` und EAS-Umgebung `preview` hochgeladen. Die bisherigen Kalenderbild-, Darstellungs- und Arbeitsprofiländerungen bleiben im gemeinsamen Paket enthalten.

- Update-Gruppe: `333f95b0-39c3-4fba-b589-ce4ef10c2d78`.
- iOS-Update: `01a11332-6894-7880-a383-9f1ba7033093`.
- [EAS-Veröffentlichung](https://expo.dev/accounts/vladularu/projects/pflegeshift/updates/333f95b0-39c3-4fba-b589-ce4ef10c2d78).
- Runtime/Fingerprint: `03d174d668f0ea5f757958dccf853632762c554d`, identisch mit dem live geprüften internen iOS-Build 33 (`8deae8f8-679b-4284-978a-a07f74fa6719`) und dem aktuell unter Preview berechneten Fingerprint.
- Preview-Kanalzuordnung und neueste iOS-Update-Gruppe live geprüft. Das ausgelieferte Manifest passt zu Update-ID, Runtime und internem Bundle-Identifier. Der heruntergeladene Hermes-Export ist SHA-256-identisch mit dem geprüften Paket: `dab46276eb029aba0688dcebc39c896365dc17a35c35570bd97a705ff6bc82ec` (7.800.824 Byte).
- Nachweis: `artifacts/work-profile-one-handed-ota-delivery-proof.json`. Der ursprüngliche Kandidatennachweis bleibt als historischer Prüfstand erhalten. App-Code und die 64 geschützten bisherigen Dateien sind unverändert.

OTA-Auslieferung bestätigt; die iPhone-Abnahme bleibt offen. App vollständig schließen, öffnen und etwa 15 Sekunden warten, erneut schließen und öffnen. Anschließend Footer, Rückkehrziele, Entwurfsschutz und den gemeinsamen Einstieg für Name/Arbeitgeber auf dem Gerät prüfen.
