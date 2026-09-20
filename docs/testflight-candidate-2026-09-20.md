# TestFlight-Lieferkandidat – 20.09.2026

## Auftrag und Grenzen

Ziel: reproduzierbarer Lieferstand, Runtime-/Kanalabgleich und begrenzter Abnahmeplan.
Branch `codex/testflight-candidate`, Basis `4f61b77cee2efe54f0de1eea01aa994c3618c0eb`.
Eigener Checkout `.worktrees/testflight-candidate`, eigene node_modules via npm ci.
Keine Junction. Expo aus package.json: ~57.0.22; SDK-57-Dokumentation verwendet.
Erlaubter Dateiscope: diese Notiz, docs/roadmap.md und nach gesonderter Freigabe
src/features/analysis/annual-core-report.test.ts. App-Code, Lockfile, native
Konfiguration und Runtime-Policy bleiben unverändert. Keine Git-Veröffentlichung,
kein EAS-Build, OTA oder Submit freigegeben. Lokale Exporte sind Prüfartefakte.

## Live-Referenz und Lieferunterschied

- TestFlight: 0.1.0, Build 3; VALID, intern/extern IN_BETA_TESTING, nicht abgelaufen.
- EAS-Build `36411a19-5bc0-422c-b476-9809cb310142`, FINISHED/STORE.
- Build-Quellcommit `16e29878976b10ff0b53ee79ece2b4bc2f659075`.
- Production-Runtime `5c6b8d9c5d2f87516fa1911dbd1f979daad133e8`.
- Bundle-ID `com.lunashift.app`, ASC-App `6811463563`.
- Aktiver Kanal production (`01a05f98-6a8a-79af-98cb-066676fbfa75`) zeigt eindeutig
  auf Branch production (`01a05f98-6981-7ccc-80d2-4e53064e13b3`), keine Update-Gruppen.
- Gegenüber Build-Quellcommit: 69 geänderte Dateien, JS/UI, Assets, Tests und Docs.
  package.json, package-lock.json, app.json, app.config.ts, eas.json, Module, Plugins
  und fingerprint.config.js sind unverändert. Einschließlich Onboarding, Farben,
  Arbeitszeitstandard, GT/Vorschau, Tastatur, Theme- und Schriftkorrekturen.

## Runtime-Befund

Eigene Installation: Fingerprint `ce1a81255d76c70e624ae9ef17bdc45fad568aae`.
EAS fingerprint:compare mit Build 3 und environment production bestätigt genau
eine abweichende Quelle: .gitignore. Alle übrigen Quellen stimmen überein.

- Aktuelle .gitignore: LF, SHA1 `bcb5d333344fff0c1db3484c20df6bf4099d6d04`.
- Derselbe Text in CRLF: SHA1 `ea2fb5d722cbabb6bd989a3726eb91f2d12c0ed2`;
  exakt der von Build 3 gespeicherte Quellenhash.
- Kein inhaltlicher Unterschied und keine native Funktionsänderung daraus ableitbar.
- Trotzdem ist der unveränderte Kandidat nicht runtime-kompatibel mit Build 3.
  Keine feste Runtime und keine Fingerprint-Ausnahme zur Umgehung setzen.
  .gitignore wurde nicht verändert, um die Kompatibilität zu erzwingen.

Lieferentscheidung: Für diesen unveränderten, reproduzierbaren Master-Kandidaten
einen neuen nativen Build empfehlen. Das ist eine konservative Lieferentscheidung,
kein Nachweis neuer nativer Funktionen. Ein Build-3-kompatibler OTA-Kandidat wäre
ein getrennt zu prüfender Reproduktionsauftrag der historischen Paketierung;
einfaches Veröffentlichen dieses Kandidaten auf production erreicht Build 3 nicht.

## Prüfstand

Historischer Erstlauf: `verify:full` scheiterte in der Unit-Coverage reproduzierbar am
5-Sekunden-Limit von annual-core-report.test.ts:141 (5244 ms, Wiederholung 5283 ms).
Die Probe berechnet mehrfach Jahresberichte mit/ohne Cache für Änderungen,
Ergänzungen, Löschungen, Monatsgrenzen und Profilwechsel. Keine fachlich falsche
Assertion wurde gemeldet. Der Sammeltest bündelte viele Jahresberechnungen in einer
Probe; seine Aufteilung beseitigt die Überschreitung des Testlimits. Der Befund
allein beweist weder App-Fehlfunktion noch ausreichende Geräteperformance.

- verify:fast bestanden: 738 Unit-Tests, 410 Komponententests und Skriptprüfungen.
- Unit-Coverage: 736 von 737 Tests bestanden, ein Timeout; zweimal gleiches Ergebnis.
- Produktionsaudit bestanden: keine nicht freigegebenen hohen/kritischen Advisories,
  keine befristeten Ausnahmen.
- Release-Konfiguration konsistent.
- Komponenten-Coverage separat bestanden: 77 Suites, 410 Tests, bestehende Grenzwerte.
- Web-, Android- und iOS-Export separat erfolgreich unter APP_VARIANT=production.
  iOS-Bundle: entry-3e8e2ca543110a543301774cd4f2850e.hbc.
- Keine Timeout-/Coverage-Grenzwerte verändert und keine Tests ausgeschlossen.

Freigegebene Korrektur: Der gebündelte Cache-Test wurde in vier unabhängige
Szenarien geteilt: unveränderte Einträge/Änderungen, Ergänzungen/Löschungen/Jahresgrenze,
Datum/Profilwechsel und Wechsel der Regelabdeckung. Jede Probe erhält einen eigenen
Cache und Resolver; die Mutation-Sequenz bleibt innerhalb ihrer Probe erhalten.
Alle bisherigen Assertions und der Vergleich mit frisch berechneten Berichten
bleiben enthalten. Keine Produktionsänderung, kein zusätzlicher Timeout und keine
Coverage-Ausnahme. Ziel ist zuverlässige Verifikation, keine App-Beschleunigung.
Akzeptanz: Unit-Coverage und verify:full bestehen bei unveränderten Grenzwerten.
Erster korrigierter Unit-Coverage-Lauf: 740 Tests bestanden, 91,23 % Statements,
84,45 % Branches, 94,70 % Functions und 93,25 % Lines.

Abschließender Neulauf am 20.09.2026: `npm.cmd run verify:full` mit Exit 0.
Enthalten: verify:fast (741 Unit-Tests, 410 Komponententests und Skriptprüfungen),
Unit-Coverage (740 Tests; bestehender Performance-Test-Ausschluss unverändert),
Komponenten-Coverage (410 Tests), Audit, Release-Konfiguration sowie Web-, Android-
und iOS-Export. Unit-Coverage damit nach Korrektur zweimal bestanden.
Der iOS-Bundlename ist gegenüber dem Kandidaten vor der Testkorrektur unverändert.
Geändert sind nur diese Notiz, Roadmap und die Testdatei. Kein Commit, Push,
EAS-Build, OTA, Submit oder Merge ausgeführt. Git-Integration ist der nächste
separat freizugebende Schritt; danach erst eine Build-Freigabe erwägen.
Keine signierte Geräteabnahme dieses Kandidaten behauptet.

## Abnahme und sichere Lieferfolge

1. Vor einem Release eine aktuelle JSON-Sicherung erstellen und sicher ablegen.
   Bestehende Installation nicht deinstallieren und keine Originaldaten testweise ersetzen.
2. Falls neuer Build freigegeben: nur Build erstellen; Submit und Tester-Verteilung
   separat freigeben. Neue Build-Runtime anhand EAS-Metadaten bestätigen.
3. Im Zielbuild vorhandene Daten prüfen, zweimal neu starten, im Flugmodus
   einen separaten Testdienst anlegen/bearbeiten/löschen und Auswertung kontrollieren.
4. Frischen Erststart und JSON-Wiederherstellung ausschließlich in einer sicheren
   Testinstallation mit Sicherung prüfen. Preview und Production haben verschiedene
   App-IDs und Datencontainer; keine automatische Datenübernahme versprechen.
5. Große/normale Schrift, Hell/Dunkel und Header-Wechsel sowie Tastatur in einem
   kompakten Durchlauf prüfen. VoiceOver und kleineres iPhone sind separat offen.
6. Noch fehlende native P0-Nachweise aus iphone-acceptance.md gezielt zuordnen:
   Erinnerungen/Berechtigungen, Serien und Datenpersistenz. Alte leere Checkboxen
   nicht als neue Fehler ausgeben; vorhandene Belege zuerst anrechnen.

Rollback: kein Production-OTA als bisherige Rückfallgruppe vorhanden. Vor einer
Verteilung Rückkehr zum bisherigen Build 3 auf TestFlight und Datenkompatibilität
prüfen; kein Löschen der App als Standard-Rollback. Ein Runtime-Wechsel wird nicht
durch Rückveröffentlichung einer inkompatiblen OTA-Gruppe aufgehoben.

Android-Veröffentlichung bleibt pausiert; ein Android-Export ist keine Abnahme.
