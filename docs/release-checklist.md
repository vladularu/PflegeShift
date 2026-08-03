# MediShift Release-Checkliste

Diese Checkliste trennt lokale technische Qualität von signierten Store-Builds und realen Gerätetests. Ein JavaScript-Export allein ist noch keine Store-Abnahme.

## 1. Lokale Freigabe

- [ ] `npm.cmd ci`
- [ ] `npx.cmd expo install --check`
- [ ] `npx.cmd expo-doctor`
- [ ] `npm.cmd run release:check`
- [ ] `npm.cmd run lint -- --max-warnings 0`
- [ ] `npm.cmd run typecheck`
- [ ] `npm.cmd test`
- [ ] Web-, Android- und iOS-Export erfolgreich
- [ ] Arbeitsverzeichnis enthält nur beabsichtigte Release-Änderungen

## 2. Einmalige EAS-Einrichtung

- [ ] Mit dem vorgesehenen Expo-Konto anmelden
- [ ] `npx.cmd eas-cli@latest init` ausführen und die erzeugte `projectId` prüfen
- [ ] iOS-Zertifikate und Provisioning-Profil einrichten
- [ ] Android-Keystore erstellen oder den vorhandenen sicheren Schlüssel hinterlegen
- [ ] Keine Zugangsdaten oder Service-Account-Dateien committen

## 3. Signierte interne Builds

- [ ] iOS-Preview-Build erstellen und auf einem echten iPhone installieren
- [ ] Android-Preview-APK erstellen und auf einem echten Android-Gerät installieren
- [ ] Produktions-Builds erzeugen: iOS-Archiv und Android-AAB
- [ ] iOS zunächst intern über TestFlight verteilen
- [ ] Android zunächst im internen Play-Test-Track verteilen

## 4. Geräteabnahme

- [ ] Kleines und großes iPhone, Hell- und Dunkelmodus
- [ ] Mindestens ein aktuelles Android-Gerät, Hell- und Dunkelmodus
- [ ] Große Systemschrift, VoiceOver/TalkBack und 44-Punkt-Touchziele
- [ ] Safe Areas, Tastatur, native Zeitwahl und alle Form-Sheets
- [ ] Monatswechsel zwischen Kalender, Auswertung und Gehalt ohne Flickern
- [ ] Schnelleingabe, Mehrfachstempel, Bearbeiten und Löschen
- [ ] Neustart mit bestehenden Daten ohne Verlust oder sichtbaren Zwischenzustand
- [ ] Stresstest mit mindestens zwölf Monaten realistischer Dienstplandaten

## 5. Store-Angaben

- [ ] App-Name, Beschreibung, Kategorie, Screenshots und Support-URL
- [ ] Öffentliche Datenschutz-URL und korrekte Apple-App-Privacy-Angaben
- [ ] Korrekte Google-Play-Data-Safety-Erklärung
- [ ] Altersfreigabe, Export-Compliance und erforderliche Händlerangaben
- [ ] Hinweise zu unverbindlicher TVöD-/Gehalts- und Arbeitszeitberechnung sichtbar

## Freigaberegel

Ein Release Candidate ist erst freigegeben, wenn alle lokalen Prüfungen sowie mindestens ein signierter iOS- und Android-Gerätetest bestanden sind. Releasekritische Fehler werden vor neuen Funktionen behoben.
