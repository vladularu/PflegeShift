# Blueprint-Onboarding als regulärer Einstieg

## Ziel und Scope

Das freigegebene LUNA-Onboarding ersetzt den bisherigen Inhalt der Route `/onboarding`. Zielplattform ist zuerst iOS im internen Preview-Build. Der Scope umfasst die Route, Onboarding-Komponenten und Tests, deren lokale Palette und drei eingebettete Markenbilder sowie den internen Testeinstieg in den Einstellungen.

Keine Änderungen an nativer Konfiguration, Abhängigkeiten, Migrationen oder Launcher-/Splash-Assets. Die separate App-Icon-Aktivierung bleibt für einen späteren Build vorgemerkt.

## Verhalten und Abnahme

- Neue Nutzer ohne Profil durchlaufen die fünf Schritte und speichern ihre Angaben lokal; danach öffnet sich der Kalender.
- Der Prozentregler steht ausschließlich bei der Arbeitszeit. Direkte Stundeneingabe und eine kompakte Vollzeitbasis bleiben verfügbar.
- Gehalt, Tarif, Feiertagsregionen und Bearbeitung der Zusammenfassung behalten ihre Validierung.
- Der interne Testeinstieg schreibt keine Daten und ersetzt kein bestehendes Profil.
- Fester Aktionsbereich, modalbezogene Safe Area, Icons und kleine Auswahldialoge folgen dem freigegebenen Blueprint.

## Nachweise und Grenzen

Das UI wurde bereits als iOS-Preview-OTA `af509a9a-b89d-40a9-96e5-e1014d1bff95` für Runtime `eac302484061dfb3fa63e2a74b8618ff6000861c` veröffentlicht. Der Nutzer hat die Übernahme dieses Stands freigegeben. Browserprüfung der tatsächlichen Komponenten und automatisierte Tests liegen vor; ein neuer nativer Screenshot nach der Korrektur wurde nicht angehängt.

Der PR übernimmt ausschließlich JS-/UI-Dateien und eingebettete Bilder auf den aktuellen master. Das Onboarding selbst benötigt keinen neuen Build. Neuere, unabhängig integrierte Änderungen an Runtime oder Bundle-ID auf master sind keine Voraussetzung für das bereits ausgelieferte Onboarding-OTA; dieses wird nicht durch einen Export von master überschrieben.

Prüfung für den PR: `npm.cmd run verify:fast` im isolierten Checkout sowie vollständige GitHub-PR-CI vor dem Merge.
