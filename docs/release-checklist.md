# LUNA Shift Release-Checkliste

Diese Checkliste trennt lokale technische Qualität von signierten Store-Builds und realen Gerätetests. Ein JavaScript-Export allein ist noch keine Store-Abnahme.

## 1. Lokale Freigabe

- [ ] `npm.cmd ci`
- [ ] `npx.cmd expo install --check`
- [ ] `npx.cmd expo-doctor`
- [ ] `npm.cmd run verify:fast`
- [ ] `npm.cmd run release:check`
- [ ] `npm.cmd run export:ios`
- [ ] Produktionsaudit enthält keine nicht freigegebenen hohen oder kritischen Befunde
- [ ] Release-Check bestätigt SQLCipher und deaktivierte Android-App-Datenbackups
- [ ] Release-Check bestätigt die effektive iOS-Fingerprint-Policy für `internal` und `production`, einschließlich dynamischer App-Konfiguration
- [ ] Tarifstand für Auswertungsmonate ab April 2027 ergänzt oder der betroffene Zeitraum in der App kontrolliert gesperrt
- [ ] Arbeitsverzeichnis enthält nur beabsichtigte Release-Änderungen

## 2. EAS-Verknüpfung und Zugangsdaten

- [ ] Mit dem vorgesehenen Expo-Konto anmelden
- [ ] `npx.cmd eas-cli@latest whoami` ausführen und die bestehende `projectId` `010fe78f-de53-42b8-9635-a73ea099b5fc` prüfen
- [ ] iOS-Zertifikate und Provisioning-Profil einrichten
- [ ] Android-Zugangsdaten erst bei ausdrücklicher Wiederaufnahme der Android-Arbeit prüfen
- [ ] Keine Zugangsdaten oder Service-Account-Dateien committen

## 3. Signierte interne Builds

- [ ] iOS-Preview-Build erstellen und auf einem echten iPhone installieren
- [ ] iOS-Produktionsarchiv erst nach erfolgreicher Preview-Abnahme erzeugen
- [ ] iOS zunächst intern über TestFlight verteilen

Android bleibt technisch im Repository, ist aber pausiert. APK, AAB und Play-Test-Track sind keine Freigabebedingung für den aktuellen iOS-Kandidaten. Vor einer Wiederaufnahme müssen Datenbank-Bootstrap, Kartenkonfiguration und reale Android-Geräteabnahme separat erfolgreich sein.

### iOS-Runtime und OTA-Kompatibilität

iOS verwendet die gemeinsame `runtimeVersion: { "policy": "fingerprint" }` aus
`app.json`. Eine plattformspezifische Runtime hat laut
[Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/config/app/#runtimeversion-1)
Vorrang; feste Werte oder andere Policies dürfen den Fingerprint deshalb weder
in `app.json` noch in `app.config.ts` überschreiben. `release:check` prüft die
statische sowie beide aufgelösten App-Varianten; `test:runtime-policy` sichert
diesen Vertrag auch in `verify:fast` ab.

Build 27 und ältere September-Builds verwenden noch `ios-2026.09.1`, obwohl
Build 27 mit `expo-document-picker` ein zusätzliches natives Modul enthält.
Die Umstellung auf Fingerprints benötigt daher einen neuen nativen Preview-Build.
Sie kann nicht per OTA auf Build 27 übertragen werden. Den neuen Build über die
bestehende interne App installieren, ohne diese zu löschen; anschließend Dienste,
Gehalt, JSON-Dateiauswahl und Datenerhalt nach einem Neustart prüfen. Die App-ID,
EAS-Projekt-ID, Datenbank und Schlüssel bleiben unverändert.

Vor jedem späteren iOS-Preview-OTA:

- `APP_VARIANT=internal` ausdrücklich setzen und die EAS-Umgebung `preview` verwenden.
- Den aufgelösten Runtime-Wert mit dem installierten Zielbuild vergleichen;
  `npx.cmd expo-updates runtimeversion:resolve --platform ios` dient als lokale
  Vorprüfung. Maßgeblich sind die EAS-Metadaten aus derselben Build-/Update-Umgebung.
- Bei abweichender Runtime einen neuen Build erstellen. Den Wert niemals auf
  `ios-2026.09.1` zurücksetzen oder einen Fingerprint fest eintragen, um ein Update
  für einen alten Build passend erscheinen zu lassen.
- Erst nach gesonderter OTA-Freigabe veröffentlichen und anschließend die Runtime
  des veröffentlichten Updates sowie dessen Laden auf dem Zielgerät bestätigen.

Ein neuer Build aktualisiert bestehende Installationen erst nach Installation.
Künftige Updates mit der neuen Runtime erreichen die alten September-Builds nicht.

Der native Tab-Patch verändert beim Prebuild genau
`node_modules/react-native-screens/ios/tabs/host/RNSTabBarController.mm`.
`fingerprint.config.js` verwendet für diese Datei beim Hashen dieselbe idempotente
Patch-Funktion. Damit werden vor und nach Prebuild die tatsächlich kompilierten
Inhalte berücksichtigt. Andere Dateien werden unverändert gehasht; weder das
Paket noch der Patch werden ausgeblendet. Die Fingerprint-Konfiguration selbst
ist ebenfalls eine Hash-Quelle.

Bei Build 28 wurde der Build wegen unterschiedlicher Hashes dieses Pakets vor
und nach dem Patch abgebrochen. Der zusätzlich in den Logs aufgeführte generierte
`ios`-Ordner hatte `hash: null` und ging bereits nicht in den Gesamt-Hash ein.
Die bestehenden CNG-Ausschlüsse bleiben ausreichend; native Quellen in `modules/`
und `plugins/` müssen weiterhin berücksichtigt werden.

`npm.cmd run test:runtime-policy` prüft die Hash-Transformation auch unter Windows.
Die CI führt zusätzlich `npm run test:runtime-prebuild` unter Linux im frischen
Checkout aus: echter iOS-Prebuild ohne Pod-Installation, aktivierter Tab-Patch und
Vergleich der vollständigen Runtime davor und danach. Dieser Check erzeugt `ios/`
und verändert die installierte native Quelldatei; lokal nur in einer separaten
Prüfkopie unter Linux/macOS ausführen. Expo unterstützt den vollständigen
iOS-Prebuild unter Windows nicht. Der Check ersetzt keinen signierten EAS-Build.

## 4. Geräteabnahme

Das ausführliche, ausfüllbare Prüfprotokoll steht unter [`docs/iphone-acceptance.md`](iphone-acceptance.md).

- [ ] Kleines und großes iPhone, Hell- und Dunkelmodus
- [ ] Große Systemschrift, VoiceOver und 44-Punkt-Touchziele
- [ ] Safe Areas, Tastatur, native Zeitwahl und alle Form-Sheets
- [ ] Monatswechsel zwischen Kalender, Auswertung und Gehalt ohne Flickern
- [ ] Schnelleingabe, Mehrfachstempel, Bearbeiten und Löschen
- [ ] Neustart mit bestehenden Daten ohne Verlust oder sichtbaren Zwischenzustand
- [ ] `.maestro/sqlcipher-persistence.yml` auf dem internen iOS-Build bestanden
- [ ] Update-Test von einem signierten unverschlüsselten PflegeShift-Build mit derselben App-ID und `pflegeshift.db`: vorhandene Dienste bleiben sichtbar, zweiter Neustart funktioniert
- [ ] Nach erfolgreichem Update sind `pflegeshift.db` samt WAL-/SHM-/Journal-Dateien und `pflegeshift-secure-v1.tmp.db` nicht mehr vorhanden
- [ ] Falscher/verlorener Schlüssel führt kontrolliert in den Fehlerzustand und überschreibt keine vorhandene Datenbank
- [ ] Stresstest mit mindestens zwölf Monaten realistischer Dienstplandaten

## 5. Store-Angaben

- [ ] App-Name, Beschreibung, Kategorie, Screenshots und Support-URL
- [ ] Öffentliche Datenschutz-URL und korrekte Apple-App-Privacy-Angaben
- [ ] Korrekte Google-Play-Data-Safety-Erklärung
- [ ] Altersfreigabe, Export-Compliance und erforderliche Händlerangaben
- [ ] Hinweise zu unverbindlicher TVöD-/Gehalts- und Arbeitszeitberechnung sichtbar

## Freigaberegel

Ein aktueller iOS-Release-Candidate ist erst freigegeben, wenn alle lokalen Prüfungen sowie mindestens ein signierter iPhone-Gerätetest bestanden sind. Android erhält nach der ausdrücklichen Wiederaufnahme eine unabhängige Freigabe. Releasekritische Fehler werden vor neuen Funktionen behoben.

## SQLCipher-Abnahmeprotokoll

Für die neue iOS-Produktions-ID `com.lunashift.app` ist zusätzlich eine frische Installation
mit JSON-Wiederherstellung aus der internen Preview und anschließendem Neustart zu prüfen.
Apple-Registrierung, Signierung und App-Store-Connect-Zuordnung müssen genau diese ID verwenden.
Keine Übernahme des bisherigen Datencontainers oder Schlüsselbunds voraussetzen. Der folgende
historische Update-Test gilt nur zwischen Builds mit identischer alter App-ID; er belegt
keine Migration von `com.pflegeshift.app` nach `com.lunashift.app`.

Die automatisierten Unit-Tests prüfen Promotion, Integrität und Fail-closed-Verhalten isoliert. Der Maestro-Persistenzlauf prüft zusätzlich Schlüsselkontinuität in einem echten nativen Build. Die einmalige Klartext-Promotion benötigt einen Update-Test mit zwei installierten Builds und bleibt deshalb ein zwingender manueller Release-Gate:

1. Einen signierten unverschlüsselten PflegeShift-Baseline-Build mit `com.pflegeshift.app` und `pflegeshift.db` installieren, Beispieldienst und Notiz anlegen, App vollständig beenden. Der MediShift-Tag `v0.1.0-beta.1` ist wegen `com.medishift.app` und `medishift.db` keine gültige Basis.
2. Einen signierten SQLCipher-Build mit derselben App-ID ohne Deinstallation darüber installieren. Das `preview`-Profil mit `.internal`-ID ist dafür nicht geeignet.
3. Datenbestand prüfen, App zweimal neu starten und anschließend einen neuen Dienst speichern.
4. Auf einem separaten Testgerät den Schlüsselverlust simulieren und bestätigen, dass kein leerer Datenbestand über die bestehende Datenbank geschrieben wird.
5. Datum, Plattform, Alt-/Neubuildnummer und Ergebnis im Release-Ticket dokumentieren.
