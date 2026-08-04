# MediShift Release-Checkliste

Diese Checkliste trennt lokale technische Qualität von signierten Store-Builds und realen Gerätetests. Ein JavaScript-Export allein ist noch keine Store-Abnahme.

## 1. Lokale Freigabe

- [ ] `npm.cmd ci`
- [ ] `npx.cmd expo install --check`
- [ ] `npx.cmd expo-doctor`
- [ ] `npm.cmd run release:check`
- [ ] `npm.cmd run audit:production` (keine hohen oder kritischen Produktionsbefunde)
- [ ] `npm.cmd run lint -- --max-warnings 0`
- [ ] `npm.cmd run typecheck`
- [ ] `npm.cmd test`
- [ ] Web-, Android- und iOS-Export erfolgreich
- [ ] Release-Check bestätigt SQLCipher und deaktivierte Android-App-Datenbackups
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
- [ ] `.maestro/sqlcipher-persistence.yml` auf dem internen iOS- und Android-Build bestanden
- [ ] Update-Test von der letzten unverschlüsselten Beta: vorhandene Dienste bleiben sichtbar, zweiter Neustart funktioniert
- [ ] Nach erfolgreichem Update ist keine alte `medishift.db.plaintext*`-Datei mehr im App-Sandbox-Verzeichnis vorhanden
- [ ] Falscher/verlorener Schlüssel führt kontrolliert in den Fehlerzustand und überschreibt keine vorhandene Datenbank
- [ ] Stresstest mit mindestens zwölf Monaten realistischer Dienstplandaten

## 5. Store-Angaben

- [ ] App-Name, Beschreibung, Kategorie, Screenshots und Support-URL
- [ ] Öffentliche Datenschutz-URL und korrekte Apple-App-Privacy-Angaben
- [ ] Korrekte Google-Play-Data-Safety-Erklärung
- [ ] Altersfreigabe, Export-Compliance und erforderliche Händlerangaben
- [ ] Hinweise zu unverbindlicher TVöD-/Gehalts- und Arbeitszeitberechnung sichtbar

## Freigaberegel

Ein Release Candidate ist erst freigegeben, wenn alle lokalen Prüfungen sowie mindestens ein signierter iOS- und Android-Gerätetest bestanden sind. Releasekritische Fehler werden vor neuen Funktionen behoben.

## SQLCipher-Abnahmeprotokoll

Die automatisierten Unit-Tests prüfen Promotion, Integrität und Fail-closed-Verhalten isoliert. Der Maestro-Persistenzlauf prüft zusätzlich Schlüsselkontinuität in einem echten nativen Build. Die einmalige Klartext-Promotion benötigt einen Update-Test mit zwei installierten Builds und bleibt deshalb ein zwingender manueller Release-Gate:

1. Letzte unverschlüsselte Beta installieren, Beispieldienst und Notiz anlegen, App vollständig beenden.
2. Internen SQLCipher-Build ohne Deinstallation darüber installieren.
3. Datenbestand prüfen, App zweimal neu starten und anschließend einen neuen Dienst speichern.
4. Auf einem separaten Testgerät den Schlüsselverlust simulieren und bestätigen, dass kein leerer Datenbestand über die bestehende Datenbank geschrieben wird.
5. Datum, Plattform, Alt-/Neubuildnummer und Ergebnis im Release-Ticket dokumentieren.
