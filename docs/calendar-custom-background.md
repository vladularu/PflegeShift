# Eigener Kalenderhintergrund

## Ziel und Scope

Vier Zusatzthemen (Minzbrise, Lavendelruhe, Rosenleinen, Meeresluft) aus der Auswahl entfernen. LUNA Standard mit Hell/Dunkel/System bleibt. Eigenes Bild auswählen, Vorschau, ersetzen und entfernen. Zielgerät: iPhone; native Android-Auswahl ebenfalls implementiert, noch nicht auf Gerät geprüft. Web verwendet Standard.

Arbeitspakete: (1) Themenkatalog und bestehende Auswahl, (2) native Fotoauswahl mit lokalem Bildspeicher, (3) Vorschau und Monatsraster. Keine Änderung an Schichtfarben, Vergütung oder Kalenderinteraktion. Keine Cloud, keine Bildgalerie, kein freier Themeneditor. Commit, Push, Build, OTA und Merge nicht freigegeben.

## Speicherung und Kompatibilität

- Expo SDK 57: `expo-image-picker` und `expo-image-manipulator`, lokale Dateien mit `expo-file-system`.
- Fotoauswahl ohne Kamera und Mikrofon; Bildimport maximal 20 MB, JPEG mit maximal 1600 Pixeln an der längsten Seite.
- Dauerhafte Kopie in `Documents/calendar-backgrounds`; SQLite speichert nur einen validierten relativen Dateinamen unter `calendar_background_image`. Damit bleibt der Bezug bei geändertem iOS-Sandboxpfad auflösbar.
- Neue Datei wird erst nach erfolgreichem Speichern aktiviert; alte Datei erst danach gelöscht. Abbruch und Speicherfehler behalten das bisherige Bild. Fehlende Dateien ergeben Standard.
- Alte Themenkennungen bleiben für Backupvalidierung akzeptiert; Laden und Darstellung verwenden LUNA Standard. Der Hell/Dunkel/System-Modus bleibt erhalten.
- Das eigene Bild gehört zu diesem Gerät und ist nicht Bestandteil des bestehenden JSON-Backups. Keine Änderung an Backupformat oder Datenbankschema.
- Das Bild erscheint hinter dem Monatsraster, mit einer Schutzfläche für lesbare Kalenderbeschriftungen. Jahresansicht und andere Bildschirme behalten ihre bisherigen Flächen.

## Abnahme

- Nur LUNA Standard und Hell/Dunkel/System; vier Zusatzthemen nicht mehr auswählbar.
- Foto auswählen, ersetzen, entfernen; Abbruch und Schreibfehler ohne Verlust des bisherigen Bilds.
- Neustart sowie Appupdate mit geändertem Sandboxpfad: lokales Bild bleibt erreichbar.
- Alte Backups laden weiterhin; Legacythemen ergeben Standard.
- Kontrasttests für schwarze/weiße Bildflächen, Komponenten- und Speichertests, `npm.cmd run verify:fast`.
- Neuer nativer Preview-Build erforderlich. Auf iPhone Fotoauswahl (auch HEIC/iCloud), Monatswechsel, Hell/Dunkel, große Schrift, Neustart und Entfernen mit Screenshots abnehmen. Build und Geräteabnahme stehen aus.

## Lokale Prüfung am 05.10.2026

`npm.cmd run verify:fast` bestanden: Typprüfung, Lint ohne Warnungen, Formatprüfung, 6.542 Unit-Tests, 568 Komponententests und die zusätzlichen Operator-, Runtime- und Build-Abhängigkeitstests. `npm.cmd run export:ios` bestanden. `git diff --check` sauber. Der lokale Kontextgraph wurde mit `graft build` aktualisiert. Dies bestätigt keinen nativen Build und keine Geräteabnahme.

Separater Worktree: `C:\Users\veron\.codex\worktrees\calendar-custom-background\MediShift`, Branch `codex/calendar-custom-background`. Änderungen sind nicht committet, gepusht oder veröffentlicht.

## Zurückgestellt für gemeinsamen Build

Am 05.10.2026 ausdrücklich vom Nutzer beauftragt: „Speicher diese Änderung für weitere Änderungen als gemeinsamen Build um Builds zu sparen“.

Status: lokal umgesetzt und geprüft, für den nächsten gemeinsamen iOS-Preview-Build vorgemerkt. Jetzt keinen einzelnen Build und keine OTA starten. Das vollständige Paket bleibt in diesem Worktree erhalten und soll mit weiteren freigegebenen Änderungen zusammengeführt werden. Commit, Push und der spätere gemeinsame Build benötigen ihre jeweilige ausdrückliche Freigabe.

Die OTA-Prüfung ergab unterschiedliche iOS-Preview-Fingerprints: neuester Build 32 `f2f4b99ba254b82ab22b99594d5228bd8c3774f7`, dieses Paket `03d174d668f0ea5f757958dccf853632762c554d`. Build 32 enthält die beiden neuen Bildmodule nicht. Vor dem gemeinsamen Build den dann vollständigen Änderungsumfang, Tests und Fingerprint erneut prüfen. iPhone-Abnahme erst am gemeinsamen Build; bisherige Gerätezustände gelten nicht als Abnahme dieser Änderung.

## iOS-Preview-Build am 06.10.2026

Der Nutzer hat mit „preview build erstellen IOS“ den Preview-Build ausdrücklich freigegeben. Die vorherige Zurückstellung dieses Builds ist damit aufgehoben.

iOS-Preview-Build **33** ist erfolgreich abgeschlossen (FINISHED), EAS-ID 8deae8f8-679b-4284-978a-a07f74fa6719. Profil/Kanal preview, interne Verteilung, App-ID com.pflegeshift.app.internal, Expo SDK 57. Runtime/Fingerprint 03d174d668f0ea5f757958dccf853632762c554d entspricht dem geprüften Paket.

[Auf dem registrierten iPhone installieren](https://expo.dev/accounts/vladularu/projects/pflegeshift/builds/8deae8f8-679b-4284-978a-a07f74fa6719).

npm.cmd run verify:fast vor dem Upload erneut bestanden. Der Upload enthält den gespeicherten Themen-/Kalenderbild-Scope auf Basis von 7ff86afb9f9e11a10d5bbf132cb06c0bb90eecd1; die Änderungen wurden nicht committet oder gepusht. Keine OTA und keine Store-/TestFlight-Einreichung durchgeführt. Installation sowie Fotoauswahl, eigenes Bild, Hell/Dunkel, Monatswechsel, Neustart und Entfernen auf dem iPhone weiterhin mit Screenshots abnehmen.

Quellstand und ausgewählte EAS-Metadaten sind in dieser Aufgabe als ios-preview-build-2026-10-06-source.json und ios-preview-build-33.json im Ausgabeordner C:\Users\veron\.codex\visualizations\2026\10\05\01a10d4b-6730-7fa1-a4d5-b18ed7904ba3 gespeichert.

## Korrektur und gemeinsame Preview-Basis am 06.10.2026

### Ziel und Abgrenzung

Gemeldeten iPhone-Speicherfehler beheben und das freigegebene Kalenderbild-Paket mit dem aktuellen, bereits abgenommenen App-Stand zusammenführen. Zielplattform: iOS Preview, vorhandener Build 33. Kein neuer Tarif, keine fachliche Neuberechnung, kein Aktivieren unvollständiger DRAFT-Pakete. Keine Veröffentlichung, kein Commit oder Push ohne eigene Freigabe.

Arbeitspaket 1: `calendar-background-storage.ts` wartet auf die native, asynchrone `File.copy()`-Operation aus Expo SDK 57, bevor die temporäre Datei gelöscht und die Präferenz gespeichert wird. Regressionstests bilden verzögerten Erfolg und asynchronen Kopierfehler ab. Vor der Korrektur ist der neue Verzögerungstest reproduzierbar fehlgeschlagen; danach bestehen 11 Speichertests und 12 relevante Komponententests im ursprünglichen Themen-Worktree.

Arbeitspaket 2: Separater gemeinsamer Kandidat auf dem live abgeglichenen master `df6dc528df172c62e1d6999a60617665cd35b6fa` (PR #287). Enthält den zuvor abgenommenen Dateibaum `c4b9b03538b166933b58b56c33a2cba89b0dfe74`: TVöD-E, TV-L Pflege, TV-H Pflege, TV-UK Pflege, TVA-L Pflege, gruppierte Gehaltsauswahl, vereinheitlichte Auswahlfenster, kompakte Texte, automatische Tariftabellen-Aktualisierung und TV-H-Performancekorrektur. Darauf wurde ausschließlich der genaue 20-Dateien-Diff des Kalenderbild-Pakets angewandt; fremde Worktrees bleiben erhalten.

Dateiscope der zusätzlichen Fehlerkorrektur: Speicherimplementierung, Speicherregressionstest, dieser Nachweis. Gemeinsamer Dateiscope: die vorhandenen 20 Dateien des Kalenderbild-Pakets, unverändert abgegrenzt. Gesamtprüfung und iOS-Export im integrierten Kandidaten sind erforderlich.

Autoritativer gemeinsamer Kandidat: `C:\Users\veron\.codex\worktrees\preview-calendar-tariffs-fix\MediShift`, Branch `codex/preview-calendar-tariffs-fix`. Der ursprüngliche Themen-Worktree bleibt erhalten, enthält aber als Basis den älteren App-Stand und darf nicht erneut als vollständiger Preview-Kandidat verwendet werden.

### Ursache der fehlenden Änderungen in Build 33

Build 33 wurde vom älteren `7ff86af` plus Kalenderbild-Paket erstellt. Die neue native Runtime `03d174d668f0ea5f757958dccf853632762c554d` empfängt nicht die bisherigen Preview-OTAs für `f2f4b99ba254b82ab22b99594d5228bd8c3774f7`. Dadurch fehlen bereits ausgelieferte Tarif-/Auswahländerungen. Dies ist ein Fehler in der Build-Zusammenstellung, kein Verlust dieser Änderungen im Repository.

### Abnahmekriterien

- Asynchrones Kopieren muss vollständig abgeschlossen sein, bevor temporäre Dateien entfernt werden; ein Fehler erhält das vorhandene Bild.
- Gruppierte Gehaltsauswahl und alle bereits abgenommenen aktuellen Tarife müssen enthalten sein; ihre Quelltexte bleiben gegenüber master unverändert.
- `npm.cmd run verify:fast`, relevante Regressionstests und iOS-Export müssen bestehen.
- Runtime des gemeinsamen Exports gegen Build 33 prüfen. Nur bei Übereinstimmung ist eine kostenfreie Preview-OTA technisch möglich; sonst ist eine neue separate Build-Freigabe erforderlich.
- Geräteabnahme nach separater Lieferung: JPEG/HEIC/iCloud auswählen, Kalenderbild nach Neustart ansehen, ersetzen/entfernen, neue Gehaltsauswahl kontrollieren und TV-H-Monatswechsel prüfen. Lokale Tests ersetzen diese Abnahme nicht.

### Verifikation des gemeinsamen Kandidaten

`npm.cmd run verify:fast` bestanden: 7.611 Unit-Tests und 697 Komponententests sowie Typprüfung, Lint, Format- und sämtliche zusätzlichen Skript-Gates. `npm.cmd run export:ios` mit `APP_VARIANT=internal` bestanden. `git diff --check` sauber. Der Kontextgraph wurde mit `graft build` aktualisiert.

EAS-Fingerprint unter `preview` / `ios` / `APP_VARIANT=internal`: `03d174d668f0ea5f757958dccf853632762c554d`, exakt identisch mit dem live abgeglichenen Build 33. Der vollständige Kandidat kann somit per Preview-OTA für Build 33 geliefert werden; ein weiterer nativer Build ist dafür technisch nicht erforderlich. Diese OTA benötigt gemäß AGENTS.md eine ausdrückliche eigene Freigabe.

Lokale Nachweise im ignorierten artifacts-Verzeichnis: `calendar-tariffs-candidate-proof.json` mit exaktem 20-Dateien-Scope und SHA256-Dateihashes, `calendar-tariffs-verify-fast.log`, `calendar-tariffs-fingerprint.json`, `calendar-tariffs-ios-export.log`. Lokal korrigiert und integriert, weiterhin uncommittet und unveröffentlicht. Geräteabnahme des korrigierten Kalenderbilds und des gemeinsamen Gesamtstands steht aus.

### Freigegebene Preview-OTA am 06.10.2026

Der Nutzer hat die separate gemeinsame Preview-OTA mit "Ja" ausdrücklich freigegeben. Veröffentlicht auf `preview`, nur `ios`, EAS-Umgebung `preview` mit `APP_VARIANT=internal`. Das zuvor geprüfte iOS-Bundle wurde unverändert verwendet; kein weiterer nativer Build wurde erstellt.

- Update-Gruppe: `6dfe9337-8427-4d03-9466-4eb66ed9d0c3`.
- iOS-Update: `01a10fbf-599c-7c30-8de3-838719684f46`.
- Veröffentlichung: `2026-10-06T05:46:00.988Z`.
- Runtime: `03d174d668f0ea5f757958dccf853632762c554d`, identisch mit Build 33.
- `update:list` bestätigt diese Gruppe als neueste passende Preview-/iOS-Version.
- Der öffentliche Preview-Manifest-Endpunkt liefert genau die Update-ID und Runtime. Der Hash seines Launch-Bundles stimmt exakt mit dem lokal geprüften iOS-Bundle überein.
- Enthalten: Kalenderbild-Kopierkorrektur, Entfernung der vier Zusatzthemen und der aktuelle abgenommene Tarif-/Auswahl-/Performance-Stand von master.

Zusätzliche lokale Nachweise: `calendar-tariffs-published-update.json`, `calendar-tariffs-update-list.json`, `calendar-tariffs-prepublish-fingerprint.json`, `calendar-tariffs-served-manifest.json`. Der Kandidaten-Nachweis enthält `published: true`, `publishedRuntimeVerified: true`, `serverBundleHashVerified: true`, `deviceAccepted: false`.

Geräteabnahme ausstehend: Preview-App vollständig schließen, öffnen, etwa 15 Sekunden warten, wieder schließen und erneut öffnen. Danach Bild auswählen/ersetzen/entfernen, Kalender nach Neustart sowie aktuelle gruppierte Gehaltsauswahl prüfen und Screenshots bestätigen lassen. EAS und Manifest-Nachweise ersetzen diese Abnahme nicht. Änderungen bleiben uncommittet; Commit, Push und PR wurden nicht beauftragt.

### Gerätefehler nach der gemeinsamen OTA

Am 06.10.2026 zeigt der iPhone-Screenshot um 07:48 im Kalender "Daten konnten nicht geladen werden" / "Lokale Daten konnten nicht geladen werden. Bitte versuche es erneut." Der Nutzer bestätigt: "Fehler bleibt und bei allen Seiten ebenfalls"; der Diagnosebereich ist dadurch nicht zugänglich. Die Geräteabnahme ist gescheitert, trotz passender Runtime und identischem Bundle-Hash.

Der genaue Auslöser ist noch nicht bestätigt. Die Meldung stammt aus usePflegeShiftLoading beim Laden des zentralen Snapshots (Profil, Vorlagen, Kalendereinträge, monatliche Tarifentscheidungen oder Arbeitsmuster). Ein Schaden an Datenbank oder Verschlüsselung ist durch die Meldung allein nicht nachgewiesen. Zwischen dem eingebauten Build-33-Basisstand 7ff86af und dem aktuellen App-Stand sind migrations.ts, secure-database.native.ts und database-migration-marker.ts unverändert.

Eine ausschließlich auf preview / ios / Runtime 03d174d668f0ea5f757958dccf853632762c554d begrenzte Rückkehr zur eingebauten App von Build 33 ist vorbereitet. Sie erfordert keine Neuinstallation und enthält keinen lokalen Löschvorgang. Dabei sind die aktuellen Tarif-/Auswahländerungen und die Kopierkorrektur vorübergehend nicht aktiv. Die Funktion auf dem Gerät muss nach dem Rollback bestätigt werden; sie ist nicht vorweg zugesichert. Der Rückkehrplan liegt in artifacts/calendar-tariffs-incident-rollback-plan.json. Noch kein Rollback veröffentlicht; eigene Freigabe gemäß AGENTS.md erforderlich. Keine spekulative Datenreparatur durchführen.

### Freigegebener Rollback für Build 33

Am 06.10.2026 hat der Nutzer den gezielten Rollback mit "Ja" ausdrücklich freigegeben. Die betroffene gemeinsame OTA war vor der Aktion weiterhin die neueste kompatible Preview-Version. Der Rollback wurde ausschließlich auf preview / ios / Runtime 03d174d668f0ea5f757958dccf853632762c554d veröffentlicht; Rückkehr zum eingebauten App-Stand von Build 33.

- Rollback-Gruppe: `57254734-d7ff-4283-a658-fe9fc7a1b299`.
- iOS-Rollback-ID: `01a10fca-b81e-72d5-adb0-035a901289c3`.
- Veröffentlichung: `2026-10-06T05:58:26.078Z`.
- EAS bestätigt `isRollBackToEmbedded: true` und die identische Build-33-Runtime.
- Der öffentliche Preview-Endpunkt liefert mit der zuvor fehlerhaften Update-ID die Anweisung `rollBackToEmbedded`.
- Nachweise: `artifacts/calendar-tariffs-rollback-published.json`, `calendar-tariffs-after-rollback-list.json`, `calendar-tariffs-rollback-served-directive.json` und der aktualisierte Rückkehrplan.

Es wurde kein lokaler Daten-Löschvorgang, keine Neuinstallation und kein neuer nativer Build ausgeführt. Die aktuelle Tarifauswahl und die Bild-Kopierkorrektur sind damit vorläufig nicht aktiv; das vollständige lokale Paket bleibt erhalten. Commit, Push und PR weiterhin nicht beauftragt.

Am 06.10.2026 hat der Nutzer nach dem Rollback mit "Ja läd" bestätigt, dass die App wieder Daten lädt (`deviceRecovered: true`). Diese Bestätigung gilt für die wiederhergestellte eingebettete App von Build 33. Die gemeinsame Tarif-/Bild-OTA bleibt auf dem Gerät fehlgeschlagen; ihre Ursache ist noch offen. Keine spekulative Reparatur der Profildaten oder erneute Veröffentlichung des fehlgeschlagenen Kandidaten.

### Arbeitspaket 3: Diagnose des zentralen Datenstarts (lokal)

Ziel: Auf iOS einen festen, datensparsamen Fehlercode direkt im bestehenden Ladefehler anzeigen, um die auf dem iPhone noch unbekannte Ursache zu bestimmen. Nicht-Ziele: Gehaltsgrundlagen automatisch auswählen, gespeicherte Werte bereinigen, Daten löschen, native Konfiguration ändern oder ohne separate Freigabe eine weitere OTA veröffentlichen.

Dateiscope: neue domain/data-load-failure.ts samt Tests; application/pflegeshift-snapshot.ts samt Tests und pflegeshift-snapshot-reader.ts; application/use-pflegeshift-loading.ts; infrastructure/database/simple-salary-profile.ts und tvh-kr-profile.test.ts; application/pflegeshift-provider.notification.component.test.tsx. Das Kalenderbild- und Tarifpaket bleibt als eigener bereits vorbereiteter Umfang erhalten.

Abnahmekriterien: Ein reines TVöD-P-Profil lädt unverändert. Fünf Snapshot-Ladeschritte erhalten feste Codes, bestehende spezifische Gehaltscodes bleiben erhalten. Ungültige oder widersprüchliche zusätzliche Gehaltspräferenzen erhalten unterscheidbare Codes. Anzeige und Fehlerprotokoll enthalten keine rohen SQLite-, JSON- oder Personendaten. Kein neuer Daten-Schreibpfad. verify:fast und iOS-Export müssen bestehen; die eigentliche Ursache bleibt bis zu einem Gerätenachweis offen.

Read-only-Kompatibilitätsprobe in artifacts: drei Tests mit künstlicher SQLite-Datenbank bestanden. TVöD-P allein funktioniert mit altem und neuem Leser; der alte Leser ignoriert eine zusätzliche TV-H-Präferenz, während der neue Leser einen Widerspruch beziehungsweise eine ungültige Präferenz ablehnt. Dies ist eine lokale Reproduktion möglicher Zustände, kein Nachweis der tatsächlichen Geräteursache.

### Verifikation des Diagnosekandidaten am 06.10.2026

verify:fast vollständig bestanden: 7.622 Unit-Tests, 699 Komponententests sowie alle Projekt-/Skript-Gates. Die drei isolierten Alt-/Neu-Kompatibilitätsfälle ebenfalls erneut bestanden. Die Ladeschritte sind separat in pflegeshift-snapshot-reader.ts gekapselt, damit die bestehende Größengrenze des Snapshot-Moduls eingehalten wird. Abschließender iOS-Export mit APP_VARIANT=internal bestanden; EAS-Fingerprint erneut exakt 03d174d668f0ea5f757958dccf853632762c554d, identisch mit Build 33.

Das vorhandene 20-Dateien-Kalenderpaket und die neun Diagnose-Dateien ergeben den exakt geprüften 29-Dateien-Kandidaten. Nachweis: artifacts/calendar-tariffs-diagnostics-candidate-proof.json samt Dateihashes und iOS-Bundle-Hash; zugehörige verify:fast-/Export-/Fingerprint-Nachweise sind getrennt vom zuvor fehlgeschlagenen veröffentlichten Kandidaten gespeichert. Der Graph wurde aktualisiert. Quellcode weiterhin uncommittet; keine neue OTA, kein nativer Build, kein Push/PR.

Der Nutzer bestätigt als aktuell sichtbare Gehaltsgrundlage TVöD-P. Ob früher ein anderer Tarif gespeichert wurde, ist weiterhin unbeantwortet. Die tatsächliche Fehlerursache ist nicht bestätigt. Der Diagnosekandidat kann den bekannten Ladefehler erneut zeigen, zeigt dabei aber einen festen Code direkt im bestehenden Fehlertext. Eine Veröffentlichung erfordert eigene Freigabe nach AGENTS.md: ausschließlich preview/ios/Build-33-Runtime. Geräteabnahme und gezielte Ursachenbehebung folgen erst auf einen konkreten Fehlercode.

### Freigegebene Diagnose-OTA am 06.10.2026

Der Nutzer hat die separate Diagnose-OTA mit "Ja" ausdrücklich freigegeben. Das exakte bereits geprüfte iOS-Bundle wurde ohne erneutes Bundling mit APP_VARIANT=internal auf preview/ios in der EAS-Umgebung preview veröffentlicht. Build 33 wurde zuvor live abgeglichen; die Runtime stimmt in Build-Fingerprint, Build-Runtime, lokalem Kandidaten und veröffentlichtem Update überein.

- Update-Gruppe: `8b4036f1-350a-469f-80fa-751878b271ca`.
- iOS-Update: `01a10fea-bb6e-7cc5-9d22-af75071c7ed2`.
- Veröffentlicht: `2026-10-06T06:33:24.078Z`.
- Runtime: `03d174d668f0ea5f757958dccf853632762c554d`.
- update:list bestätigt die Diagnosegruppe als neueste passende Preview-/iOS-Version.
- Der öffentliche Preview-Server liefert exakt diese Update-ID und den unveränderten Hash des lokal geprüften iOS-Bundles.

Nachweise liegen in artifacts/calendar-tariffs-diagnostics-published-update.json, calendar-tariffs-diagnostics-after-update-list.json, calendar-tariffs-diagnostics-served-manifest.json und dem aktualisierten Diagnosekandidaten-Nachweis. `published: true`, `serverBundleHashVerified: true`, `deviceAccepted: false`, `rootCauseConfirmed: false`. Der zuvor bestätigte Rollback bleibt als historische Wiederherstellung dokumentiert; serverseitig ist jetzt die freigegebene Diagnose-OTA aktuell.

Nächster Geräteschritt: App vollständig schließen, öffnen, etwa 15 Sekunden warten, nochmals schließen und öffnen. Bei erneutem Ladefehler den sichtbaren Fehlercode oder einen Screenshot anfordern. Erst mit diesem Nachweis eine gezielte Ursachenbehebung bestimmen. Keine spekulative Datenreparatur; kein neuer nativer Build, kein Commit, Push oder PR ausgeführt.

### Gerätenachweis und Arbeitspakete 4/5: Gehaltskonflikt sicher auflösen

Der iPhone-Screenshot vom 06.10.2026 um 08:49 zeigt PROFILE_SALARY_CONFLICT. Damit ist die Diagnose-OTA auf dem Gerät angekommen und die aktive Fehlerursache bestätigt: mehr als eine gespeicherte Gehaltsgrundlage. Welche zusätzlichen Tarife konkret gespeichert sind und wie sie entstanden, ist nicht bekannt.

Ziel auf iOS: Kalender und übrige App trotz widersprüchlicher Gehaltsgrundlagen laden, die gespeicherten Werte für eine ausdrückliche Auswahl erhalten und bis dahin keine Gehaltsgrundlage aktivieren. Nicht-Ziele: einen Tarif anhand von Reihenfolge/Zeitstempel auswählen, beim Lesen Daten bereinigen, Backupschema/native Konfiguration ändern oder ohne neue Freigabe veröffentlichen.

AP4 (Daten/Profil, getrennt vom bestehenden Kalenderpaket): domain/types.ts; neue domain/salary-basis-conflict.ts mit Tests; infrastructure/database/simple-salary-profile.ts, profile-repository.ts, simple-app-profile.ts; neue salary-basis-conflict-recovery.test.ts und Anpassung der bisherigen Konfliktprüfungen in tvh-kr-profile.test.ts und tval-pflege-profile.test.ts. Ein nur zur Laufzeit vorhandener Konfliktzustand bewahrt die acht Gehaltswerte als Formulardrafts; die aktiven Gehaltsfelder bleiben leer. Der Leser schreibt keine Daten. Eine Profiländerung im Konfliktzustand muss ausdrücklich genau eine Gehaltsgrundlage setzen; die bestehende Transaktion entfernt erst dann die alternativen einfachen Tarifpräferenzen.

AP5 (bestehende Auswahl-UI): settings-form-values.ts samt Tests, settings-editor-screen.tsx samt passendem Komponententest und work-profile-summary.ts. Der Start der Gehaltsauswahl ist ungewählt; gespeicherte Gruppen/Stufen bleiben als Draft erhalten. Arbeitsprofil/Mehr zeigen Gehaltsgrundlage prüfen; die Gehaltsauswahl erklärt, dass die gespeicherten Angaben bis zur ausdrücklichen Auswahl erhalten bleiben.

Abnahme: reiner TVöD-P-Stand unverändert; alle Kombinationen widersprüchlicher Gehaltsgrundlagen laden in einen unberechneten Zustand; Rohdaten/Backupsnapshot beim Lesen unverändert; keine stille Gehaltsauswahl durch datierte Altprofile; Speichern ohne Auswahl verweigert ohne Teilwrites; ausdrückliche TVöD-P-Auswahl speichert atomar und lädt danach ohne Konflikt; Monatsberechnung bis dahin nicht verfügbar. Vollständige verify:fast- und Datenbanktests, iOS-Export und anschließende gesondert freigegebene Geräteabnahme.

Lokaler Umsetzungsstand des Konflikt-Fixes (06.10.2026): Der Profil-Leser liefert bei mehreren gültigen Gehaltsgrundlagen ein Arbeitsprofil mit inaktiven Gehaltsfeldern und erhaltenen Laufzeit-Drafts. Der Kalenderdatenstart erhält dadurch keinen Gehaltskonflikt-Fehler mehr. Ein datiertes Altprofil wird in diesem Zustand nicht als Ersatz aktiviert. Der bestehende Dialog startet mit „Bitte wählen“; eine ausdrückliche Auswahl übernimmt ausschließlich die dazu gespeicherten Werte. Mehr/Arbeitsprofil zeigen „Gehaltsgrundlage prüfen“. Erst eine gültige Auswahl wird in der vorhandenen Transaktion gespeichert und entfernt dann die alternativen einfachen Tarifpräferenzen. Unvollständige und fehlgeschlagene Speicherung lassen die gespeicherten Angaben unverändert. Ungültige Tarifdaten bleiben ausdrücklich als PROFILE_SALARY_INVALID blockiert.

Regressionen: 19 Tests mit echter lokaler SQLite-Datenbank prüfen erhaltene Kalenderschichten, Profil-/Präferenz-Snapshots vor und nach dem Laden, alle sechs zusätzlichen einfachen Tarifpräferenzen, jede der acht ausdrücklichen Gehaltswahlen, den datierten Fallback sowie den Rollback bei einem simulierten Schreibfehler. Der Komponententest prüft den ungewählten Einstieg, die Sperre ohne Auswahl und die korrekte P11/Stufe-5-Auswahl nach einem Wechsel über eine E-Tabelle mit anderer Stufe. Keine Datenbankmigration oder Änderung des Backupformats. Zusätzlicher lokaler Export unter dist/ios-recovery; der veröffentlichte Diagnoseexport unter dist/ios bleibt erhalten. Veröffentlichung dieses Fixes und Geräteabnahme stehen noch aus.

Abschließende lokale Abnahme (06.10.2026): npm.cmd run verify:fast erfolgreich mit 7.642 Unit-Tests und 700 Komponententests, einschließlich der übrigen Regel-/Audit-/Runtime-/Buildprüfungen und git diff --check. iOS-Export nach der letzten Codebereinigung erfolgreich unter dist/ios-recovery. Nativer Fingerprint unverändert: 03d174d668f0ea5f757958dccf853632762c554d, passend zu Build 33. Der öffentlich angefragte Preview-Endpunkt liefert weiterhin die Diagnose-OTA 01a10fea-bb6e-7cc5-9d22-af75071c7ed2. Der Konflikt-Fix ist lokal vorbereitet und weiterhin unveröffentlicht. Eindeutiger Kandidaten-Nachweis mit 40 Dateihashes und Bundlehash: artifacts/calendar-tariffs-recovery-candidate-proof.json. Keine Commits, Pushes oder neuen nativen Builds. Nächster Schritt nach gesonderter EAS-Update-Freigabe: diesen Export veröffentlichen; auf dem iPhone Laden aller Seiten, ausdrückliche TVöD-P-Auswahl samt Gruppe/Stufe, Speichern und erneuten Start prüfen. Kalenderbild anschließend separat auswählen und kontrollieren.

### Konflikt-Fix als genehmigte Preview-OTA veröffentlicht (06.10.2026)

Nach ausdrücklichem „ja“ des Nutzers: iOS-Update 01a1101a-bdcb-77aa-805b-371f76c85e61, Gruppe 1ea83958-3bb2-482d-81b3-fea3107fae71, veröffentlicht am 2026-10-06T07:25:50.411Z auf preview mit APP_VARIANT=internal und Runtime 03d174d668f0ea5f757958dccf853632762c554d. Export dist/ios-recovery unverändert veröffentlicht. Ziel-Build 33 live bestätigt; alle 40 freigegebenen Dateihashes und der Exporthash vor und nach Veröffentlichung identisch. EAS listet die neue Gruppe als neuesten kompatiblen iOS-Stand, und der öffentliche Preview-Endpunkt liefert genau diese Update-ID mit passender Runtime und passendem Launch-Asset-Hash. Zusätzlich wurde das App-Bundle protokollkonform vom Assetserver geladen: SHA256 stimmt mit dem freigegebenen lokalen Export überein, 7754064 Bytes. Asset-Download-Header werden gemäß den Expo-Updates-v1-Extensions verwendet; der zunächst anonyme Prüfdownload erhielt erwartungsgemäß HTTP 403. Die vorgesehenen Header ermöglichten HTTP 200. Headerwerte wurden im lokalen Diagnoseartefakt redigiert.

Geräteabnahme steht aus: App vollständig schließen, öffnen, etwa 20 Sekunden warten, nochmals vollständig schließen und öffnen. Kalender und weitere Seiten prüfen. Unter Mehr → Arbeitsprofil → Tarif & Gehalt ausdrücklich TVöD-P auswählen, die gespeicherte Gruppe/Stufe kontrollieren und speichern; anschließend erneut starten und prüfen. Kalenderbild danach getrennt testen. Keine Neuinstallation oder Datenlöschung. Kein neuer nativer Build, Commit, Push oder PR.

Nachweise im ignorierten artifacts-Verzeichnis: calendar-tariffs-recovery-candidate-proof.json; calendar-tariffs-recovery-published-update.json; calendar-tariffs-recovery-prepublish-build.json; calendar-tariffs-recovery-prepublish-fingerprint.json; calendar-tariffs-recovery-postpublish-updates.json; calendar-tariffs-recovery-served-manifest.json. published=true, deviceAccepted=false. Die vorherige Diagnose-OTA ist damit auf dem Server ersetzt; ihr Export und die ursprünglichen Nachweise bleiben erhalten.

Expo-Referenzen: https://docs.expo.dev/versions/v57.0.0/sdk/updates/ und https://docs.expo.dev/technical-specs/expo-updates-1/ (Asset-Request-Headers).

### Arbeitspaket 6: gespeichertes Bild im aktuellen Monatsrenderer anzeigen

Gerätenachweis 06.10.2026, 09:36: Auswahl gespeichert und eigenes Foto in der Darstellungsvorschau sichtbar, sowohl hell als auch dunkel. Nutzer meldet, dass das Foto im Kalender fehlt. Ursache im Code bestätigt: Kalenderbild nur im alten MonthCard eingebaut; der aktuelle CalendarScreen nutzt SharedCalendarScene/SharedCalendarMonth und CalendarStablePager, ohne MonthCard zu rendern.

Ziel/Plattform: lokales Kalenderbild im tatsächlichen Monatskalender von iOS Build 33 anzeigen. Scope: calendar-shared-scene.tsx, calendar-shared-scene.component.test.tsx, calendar-background.tsx (Bild-Testkennung) und diese Übergabe. Eine feste Hintergrundebene in CalendarSceneContent hinter den Monatsglyphen und Bedienelementen folgt dem bestehenden Monats-/Jahresfortschritt. Im Jahresmodus wird das Foto ausgeblendet. Bildwechsel/Entfernung aktualisieren denselben montierten Kalender; keine zusätzlichen Monatsbilder oder neuen Pager-Keys.

Nicht-Ziele: Dateiimport, 20-MB-Eingabegrenze, 1600-Pixel-JPEG-Verkleinerung, Kontrastüberlagerung, Gehalts-/Profildaten, native Konfiguration, Build oder Veröffentlichung ändern. Die 20-MB-Grenze ist eine Vorsichtsentscheidung der App für die Eingabedatei vor der Verkleinerung, keine iOS-Vorgabe.

Abnahme: Regression mit realem SharedCalendarScene und SharedCalendarMonth zeigt ohne Bild keinen Bildinhalt, nach Auswahl/Wechsel die korrekte lokale URI, nach Entfernen wieder den Standard. Monatsknoten und Datumsmarker bleiben dieselben Instanzen. Hintergrund fängt keine Touch-Ereignisse ab und verschwindet im Jahresmodus. Bestehende Kalender-/Pager-/Morph-/Stempeltests, verify:fast und iOS-Export bestehen. Anschließend gesonderte OTA-Freigabe und Screenshot des echten Monatskalenders auf dem iPhone nötig.

Lokale Prüfung AP6 (06.10.2026): Eine feste, nicht interaktive Bildschicht ist im aktuellen CalendarSceneContent unter den Monatsinhalten eingebaut. Sie nutzt dieselbe lokale Bildquelle wie die Vorschau und folgt dem bestehenden Animationsfortschritt (Monat 1, Jahr 0). Zwei Regressionen prüfen Auswahl, URI-Wechsel und Entfernung, erhaltene Monats-/Datumsmarker, bedienbare Tagesauswahl sowie die tatsächlichen animierten Styles nach dem Wechsel in beide Richtungen. 33 gezielte Kalender-/Pager-/Übergangs-/Stempeltests bestanden. Vollständiges npm.cmd run verify:fast bestanden: 7.642 Unit-Tests, 702 Komponententests und alle weiteren Gates. Der Graft-Graph wurde lokal deterministisch aktualisiert.

Separater iOS-Export dist/ios-calendar-background-fix erfolgreich. APP_VARIANT=internal; lokaler Fingerprint 03d174d668f0ea5f757958dccf853632762c554d stimmt mit dem live geprüften fertigen Preview-Build 33 (8deae8f8-679b-4284-978a-a07f74fa6719) überein. EAS listet weiterhin die bereits veröffentlichte Gehaltskonflikt-Recovery-Gruppe 1ea83958-3bb2-482d-81b3-fea3107fae71 als neuesten Preview-Stand. AP6 ist unveröffentlicht. Eindeutiger neuer Kandidaten-Nachweis: artifacts/calendar-background-visibility-candidate-proof.json mit aktuellem Dateiscope und Exporthashes. Die früheren Veröffentlichungsnachweise und Exporte bleiben unverändert als historische Nachweise erhalten. Keine Commits, Pushes oder neuen nativen Builds.

Die 20-MB-Grenze betrifft weiterhin die ausgewählte Quelldatei vor der Verarbeitung. Sie ist eine Vorsichtsgrenze der App, keine Vorgabe des iPhones. Die App verkleinert das Bild anschließend auf höchstens 1.600 Pixel an der längsten Seite und speichert eine JPEG-Kopie mit Qualität 0,8. Eine Änderung dieser Eingabegrenze ist ein getrenntes Arbeitspaket.

Nächster Schritt erst nach ausdrücklicher EAS-Update-Freigabe gemäß AGENTS.md: diesen geprüften Export als Preview-OTA für iOS Build 33 veröffentlichen. Danach gespeichertes Foto im echten Monatskalender in Hell/Dunkel, Monatsblättern, Jahreswechsel und Tagesauswahl auf dem iPhone kontrollieren. Geräteabnahme für AP6 steht aus; die vorhandenen Fotos zeigen nur die Einstellungsvorschau.

### AP6 als genehmigte Preview-OTA veröffentlicht (06.10.2026)

Nach ausdrücklichem „ja“ des Nutzers: iOS-Update 01a11043-cfd6-74fb-89c9-cf3930ec08fd, Gruppe 0721941a-20aa-42f9-a393-0c94cabe4131, erstellt am 2026-10-06T08:10:42.006Z (10:10 Uhr Europe/Berlin). APP_VARIANT=internal, Branch/Environment preview, Plattform ios, Runtime 03d174d668f0ea5f757958dccf853632762c554d passend zu Build 33. Der freigegebene Export dist/ios-calendar-background-fix wurde unverändert mit --skip-bundler veröffentlicht. Vorher alle 42 Dateihashes, 43 Exportassets, Metadaten und Bundle geprüft; live Build/Runtime/Kanal bestätigt. Bestehende Gehaltskonflikt-Recovery war weiterhin der neueste kompatible Stand und bleibt im neuen vollständigen JavaScript-Bundle enthalten.

Nach Veröffentlichung: EAS listet die neue Gruppe als neuesten kompatiblen iOS-Preview-Stand. Der öffentliche Preview-Endpunkt liefert die neue Update-ID und die passende Runtime. Zusätzlich wurde das tatsächliche Launch-Asset protokollkonform mit den vom Server gelieferten Asset-Request-Headers von assets.eascdn.net geladen (keine Weiterleitungen, keine Ausgabe von Headerwerten). 7.755.427 Bytes; SHA256 5d9ff67ac94f2fc9c88f9a895876d0c1a171675192a2d098518f388074916cdc stimmt exakt mit dem freigegebenen lokalen Bundle überein. Alle 42 freigegebenen Dateihashes waren bis einschließlich dieser Serverprüfung unverändert. Anschließend ausschließlich diese Übergabe um den Veröffentlichungsnachweis ergänzt; die freigegebenen historischen Hashes bleiben im Kandidatennachweis erhalten.

Geräteabnahme AP6 steht aus: App vollständig schließen, öffnen, etwa 20 Sekunden warten, erneut vollständig schließen und öffnen. Gespeichertes Foto im tatsächlichen Monatskalender in Hell/Dunkel prüfen; Monatsblättern, Wechsel zur Jahresübersicht und zurück sowie Tagesauswahl kontrollieren. Die vorhandenen Fotos zeigen nur die Darstellungsvorschau. Keine iPhone-Abnahme aus EAS-Metadaten oder Serverdownload abgeleitet. Kein neuer nativer Build, Commit, Push oder PR.

Nachweise im ignorierten artifacts-Verzeichnis: calendar-background-visibility-candidate-proof.json; calendar-background-visibility-published-update.json; calendar-background-visibility-prepublish-build.json; calendar-background-visibility-prepublish-fingerprint.json; calendar-background-visibility-postpublish-updates.json; calendar-background-visibility-served-manifest.json; calendar-background-visibility-response-summary.json. published=true, deviceAccepted=false, newOTAApprovalRequired=false. Frühere Exporte und Veröffentlichungsnachweise bleiben als historische Nachweise erhalten.

### Arbeitspaket 7: Bildsichtbarkeit in drei Stufen einstellen

Geräterückmeldung nach AP6-OTA 01a11043-cfd6-74fb-89c9-cf3930ec08fd: Foto erscheint nun im Kalender, wirkt aber stark verwaschen. Die vorhandene Überlagerung beträgt 0,90. Nutzer hat „Drei Stufen: dezent, mittel, kräftig“ ausdrücklich gewählt. AP6-Fotoanzeige damit auf dem Gerät bestätigt; die übrigen AP6-Detailprüfungen (Jahreswechsel, Hell/Dunkel, Tagesauswahl) sind nicht einzeln bestätigt.

Ziel/Plattform: Bildstärke direkt in Darstellung einstellen, lokal dauerhaft speichern und identisch in Vorschau und aktuellem iOS-Monatskalender anzeigen. Dezent: 10 % Bildsichtbarkeit (bisheriger Stand); Mittel: 25 %; Kräftig: 40 %. Standard ohne gespeicherte Stufe: Mittel. Schwächere neutrale Kalenderlabels erhalten bei Mittel/Kräftig die primäre Textfarbe; übrige App-Palette und Schichtfarben bleiben gleich. Der Jahresmodus blendet weiterhin das Foto aus.

Dateiscope (13 Dateien): neue theme/calendar-image.ts; theme/theme-catalog.test.ts; features/calendar/calendar-background.tsx, calendar-prototype-canvas.tsx und calendar-shared-scene.component.test.tsx; features/settings/calendar-background-context.ts, calendar-background-storage.ts mit Tests, calendar-background-preferences.tsx mit Komponententests, calendar-background-control.tsx und appearance-screen.component.test.tsx; diese Übergabe. Bestehender kurzlebiger Branch codex/preview-calendar-tariffs-fix wird für das gemeinsame Paket weiterverwendet.

Nicht-Ziele: 20-MB-Quelldateigrenze, Bilddatei/Verkleinerung, native Pakete/Runtime, Datenbankmigration, Gehalt, Backupformat oder Store verändern. Keine Veröffentlichung, kein Build, Commit oder Push ohne gesonderte Freigabe. Lokale Stufe in eigener app_preferences-Zeile calendar_background_strength; vorherige veröffentlichte Export-/Hash-Nachweise bleiben erhalten.

Abnahme: nur bei gespeichertem Bild sichtbare Auswahl mit ausgewählter Stufe und nutzbaren Touch-Zielen auch bei großer Schrift; Auswahl gilt nach erfolgreichem Speichern in Vorschau/Kalender und über Neustarts; Bildwechsel behält die Stufe; Speicherfehler hält die vorherige Auswahl und zeigt einen Hinweis; parallele Bild-/Stufenschreibvorgänge sind gesperrt. Fehlende/ungültige gespeicherte Stufe fällt auf Mittel zurück. Alle Stufen behalten mindestens 4,5:1 Kontrast für unverminderte neutrale Kalenderlabels über extrem hellem/dunklem Foto in Hell und Dunkel. Bestehende Kalenderknoten, Datumsmarker und Schichtfarben bleiben erhalten. verify:fast, gezielte Tests, separater iOS-Export und Runtime-Abgleich; danach eigene OTA-Freigabe und iPhone-Abnahme der Stufen.

Lokale Prüfung AP7 bestanden (06.10.2026): Dezent/Mittel/Kräftig sind unter Bildstärke sichtbar, sobald ein eigenes Bild gespeichert ist. Ohne gespeicherte Stufe startet Mittel. Nach erfolgreicher Speicherung aktualisieren sich Vorschau und tatsächlicher Monatskalender; Bildwechsel behält die Stufe. Große Schrift und schmale Ansichten erhalten gestapelte Auswahlen mit 48-Pixel-Touch-Zielen. Fehler beim Speichern lassen die alte Stufe und Bilddatei erhalten. Eine laufende Bild-/Stufenschreiboperation sperrt weitere Schreibaktionen; erneuter Druck auf die aktive Stufe schreibt nicht nochmals.

31 gezielte Unit-Tests und 37 Komponententests bestanden. Die Kontrastprüfung deckt die drei Stufen in Hell/Dunkel über extremen Fotofarben ab; beim tatsächlichen Monatsrenderer werden zusätzlich die verwendeten Overlay- und Wochentagsfarben geprüft. Monatsfoto und Datumsmarker bleiben während aller Stufenwechsel dieselben Instanzen. Vollständiges npm.cmd run verify:fast bestanden: 7.650 Unit-Tests, 711 Komponententests und alle weiteren Projekt-Gates. Der lokale Graft-Graph wurde deterministisch aktualisiert. Keine Kalenderfarben oder Gehaltsänderungen außerhalb des festgelegten Scopes; die vorherigen Gehalts-/Tarifquellen sind anhand ihrer veröffentlichten Dateihashes unverändert.

Separater iOS-Export dist/ios-calendar-image-strength erfolgreich. Mit APP_VARIANT=internal stimmt der native Fingerprint weiterhin mit dem live geprüften fertigen Preview-Build 33 überein: 03d174d668f0ea5f757958dccf853632762c554d. Der aktuell neueste kompatible Preview-Stand ist weiterhin die veröffentlichte AP6-Gruppe 0721941a-20aa-42f9-a393-0c94cabe4131. AP7 ist lokal vorbereitet und unveröffentlicht; kein neuer nativer Build, Commit, Push oder PR. Neuer freigegebener Kandidaten-Nachweis wird nach abschließender Prüfung unter artifacts/calendar-image-strength-candidate-proof.json abgelegt und enthält aktuelle Dateihashes, alle Exportassets, Metadaten- und Bundlehash. Frühere Export-/Veröffentlichungsnachweise bleiben unverändert erhalten.

Nächster Schritt nach ausdrücklicher EAS-Update-Freigabe gemäß AGENTS.md: diesen Export als iOS-Preview-OTA für Build 33 veröffentlichen. Dann auf dem iPhone Bildstärke auf Dezent/Mittel/Kräftig stellen, Sichtbarkeit/Lesbarkeit in Vorschau und echtem Monatskalender in Hell/Dunkel vergleichen, Neustart und Bildwechsel prüfen. Geräteabnahme AP7 steht aus. Expo-Referenz: https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/ .

### AP7 als genehmigte Preview-OTA veröffentlicht (06.10.2026)

Nach ausdrücklichem „ja“ des Nutzers: iOS-Update 01a1105d-7e4a-755c-b316-1b2526e0cc02, Gruppe d1f1de25-284a-40b6-b56e-e2b96ec28be9, erstellt am 2026-10-06T08:38:45.066Z (10:38 Uhr Europe/Berlin). APP_VARIANT=internal, Branch/Environment preview, Plattform ios, Runtime 03d174d668f0ea5f757958dccf853632762c554d passend zu Build 33. Der vorbereitete Export dist/ios-calendar-image-strength wurde mit --skip-bundler unverändert veröffentlicht. Vorher alle 44 Dateihashes, 43 Exportassets, Metadaten und Bundle geprüft; fertigen Build 33, nativen Fingerprint und bestehenden Preview-Stand live abgeglichen. Die bisherige Fotoanzeige und der Gehaltskonflikt-Fix bleiben im vollständigen JavaScript-Bundle enthalten.

Nach Veröffentlichung: EAS listet die neue Gruppe als neuesten kompatiblen iOS-Preview-Stand. Der öffentliche Preview-Endpunkt liefert genau die neue Update-ID und die passende Runtime. Das tatsächliche Launch-Asset wurde mit den protokollgemäßen Asset-Request-Headers von assets.eascdn.net ohne Weiterleitung geladen; Headerwerte wurden nicht ausgegeben. 7.761.979 Bytes; SHA256 32c8577990ebb9c4b9d0ba77644be63964dad14d7ca0ee6dab7c97925b1cf243 stimmt exakt mit dem freigegebenen lokalen Export überein. Alle 44 freigegebenen Dateihashes waren bis einschließlich dieser Serverprüfung unverändert. Danach ausschließlich diese Übergabe um den Veröffentlichungsnachweis ergänzt; die historischen freigegebenen Hashes bleiben erhalten.

Geräteabnahme AP7 steht aus: App vollständig schließen, öffnen, etwa 20 Sekunden warten, erneut vollständig schließen und öffnen. Unter Darstellung → Bildstärke die Stufen Dezent/Mittel/Kräftig testen. Ohne gespeicherte Stufe startet Mittel. Vorschau und echten Monatskalender in Hell/Dunkel vergleichen; Lesbarkeit, Neustart und Bildwechsel prüfen. Kein neuer nativer Build, Commit, Push oder PR. Die bereits bestätigte AP6-Fotoanzeige ersetzt keine Geräteabnahme der neuen Stufen.

Nachweise im ignorierten artifacts-Verzeichnis: calendar-image-strength-candidate-proof.json; calendar-image-strength-published-update.json; calendar-image-strength-prepublish-build.json; calendar-image-strength-prepublish-fingerprint.json; calendar-image-strength-postpublish-updates.json; calendar-image-strength-served-manifest.json; calendar-image-strength-response-summary.json. published=true, deviceAccepted=false, newOTAApprovalRequired=false. Frühere Exporte und Veröffentlichungsnachweise bleiben erhalten.

### Geräterückmeldung zu AP7 (06.10.2026)

Nach Veröffentlichung der Drei-Stufen-OTA 01a1105d-7e4a-755c-b316-1b2526e0cc02 bestätigt der Nutzer ausdrücklich: „ja funktioniert“. Die Grundfunktion der Bildstärken-Auswahl auf seinem iPhone ist damit vom Nutzer bestätigt. Ein gesonderter Vergleich aller drei Stufen in Hell/Dunkel sowie Speicherung nach erneutem Bildwechsel wurden in dieser Rückmeldung nicht einzeln bestätigt. Die allgemeine Bestätigung wird als deviceCoreFunctionAccepted=true dokumentiert; vollständige Detailabnahme wird daraus nicht abgeleitet. Keine weitere Codeänderung, Veröffentlichung oder neuer Build.
