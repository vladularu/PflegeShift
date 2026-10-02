# node-forge: überprüfte lokale RSA-Härtung

Stand: 02.10.2026.

## Task-Vertrag

- Ziel: den reproduzierten DigestAlgorithm-Parserfehler in der Expo-Werkzeugkette durch den exakt begrenzten vorgeschlagenen Upstream-Patch beheben und den installierten Fix vor jeder Produktions-Auditbewertung verbindlich nachweisen.
- Nicht-Ziele: Expo-SDK-Migration, neue native Funktionen, EAS-/OTA-/Store-Lieferung, allgemeine Audit-Ausnahmen oder Änderung einer upstream veröffentlichten Versionsnummer.
- Scope: genau sieben Dateien: package.json, package-lock.json, scripts/node-forge-hardening.mjs, dessen Testdatei, scripts/audit-production.mjs, dessen bestehende Testdatei und dieses Dokument.
- Plattform: Node-Installations-/CI-Werkzeuge; Expo bleibt ~57.0.22, [SDK 57](https://docs.expo.dev/versions/v57.0.0/) geprüft. Kein App-/Native-Code geändert; Release-/Runtime- und Geräteabnahme bleiben separate Gates.
- Abnahme: kontrollierte RSA-Reproduktion vor dem Fix, manipulierte Strukturen danach abgewiesen, gültige Signaturen mit/ohne ASN.1-NULL und übliche Node-Signaturen akzeptiert; Paket-/Datei-/Auflösungsintegrität und negative Auditfälle; Produktions-Audit, release:check, verify:fast und sieben PR-CI-Gates grün.
- Git-Lieferung durch dauerhafte Freigabe des laufenden Gesamtauftrags gedeckt. Caritas-PR #145 bleibt separat und wird anschließend mit dem gemergten Sicherheitsstand neu geprüft.

## Befund und Herkunft

[GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv), am 01.10.2026 aktualisiert, betrifft auch die neueste veröffentlichte Version 1.4.0. Zum Prüfzeitpunkt gibt es keine als behoben veröffentlichte Paketversion.

Vorgeschlagener Fix: [digitalbazaar/forge PR #1152](https://github.com/digitalbazaar/forge/pull/1152), Commit `ceba34402e329f0365134f23fe19898756527d65`. Der PR ist noch offen und nicht vom Upstream gemergt. Diese lokale Übernahme ist deshalb ausdrücklich ein geprüfter eigener Backport, keine Behauptung einer offiziellen 1.4.1-Veröffentlichung.

Der Patch prüft zusätzlich zur äußeren DigestInfo-Struktur die Kinderzahl der inneren DigestAlgorithm-Struktur: nur OID und gegebenenfalls NULL sind erlaubt. Ein kontrolliert mit einem Testschlüssel erzeugter RSA-Block mit zusätzlichem innerem ASN.1-Element wurde auf der unveränderten installierten 1.4.0 als gültig angenommen. Der Regressionstest prüft die Abweisung nach dem Patch und gültige Kontrollsignaturen.

Version und npm-Archivintegrität bleiben unverändert. Die veränderte rsa.js entspricht bytegenau dem festen Upstream-PR-Postimage:

- Original rsa.js SHA-256: `fd4740238145ec26470eb3f06a627c72039538ce1307dbdce40521f94dfd0a50`.
- Gehärtete rsa.js SHA-256: `acc22e5d36e27832c34e02dd3933aad7977d45b047eead5016520735efedc9c5`.

## Installation und Audit

`postinstall` wendet den einmaligen idempotenten Patch an. Andere Versionsstände, zusätzliche Lockfile-Kopien, unbekannte Originaldateien, ein Ziel außerhalb des Checkouts oder andere tatsächliche Parent-Auflösungen werden gesperrt. Der eigene Checkout besitzt ein normales node_modules-Verzeichnis; fremde Hauptcheckout-Abhängigkeiten werden nicht verändert.

Das Audit verifiziert die tatsächliche Installation synchron nach dem npm-Report. Nur ein vom Integritätsprüfer erzeugter und intern registrierter Nachweis kann exakt diese Advisory als technisch mitigiert markieren. Er muss zu genau dem auditierten node-forge-Knoten passen. Ein Dateihash, Versionsstring, Flag, JSON-Objekt oder eine Umgebungsvariable allein gilt nicht als Nachweis. Andere Advisory-URLs, kritische Schweregrade, neue Reportformen und zusätzliche Knoten bleiben blockiert.

Die npm-Datenbank meldet weiterhin die upstream ungepatchte Versionsnummer; der Bericht nennt diese verbleibenden Metadaten und den geprüften lokalen Backport ausdrücklich. Es wird keine pauschale Freigabeliste und keine fingierte Versionsnummer verwendet. `evaluateAuditReport(report)` ohne installierten Nachweis blockiert den Befund weiterhin.

## Wartung und Grenzen

Sobald eine verifizierte korrigierte Upstream-Version erscheint, müssen Pin, Installationspatch und Sonderbewertung in einem eigenen geprüften Dependency-PR entfernt werden. Jede unerwartete Paket-/Dateiänderung sperrt bis zur Prüfung. Andere Kryptofehler werden durch diesen einzelnen Parserfix nicht als erledigt behauptet.

## Prüfung

- Frische npm-ci-Installation: automatische postinstall-Härtung erfolgreich, SHA-256 exakt geprüft.
- Keine Abhängigkeitsversion oder Archivintegrität im Lockfile verändert; nur Root-Metadatum hasInstallScript ergänzt.
- 18 Audit-/Härtungstests grün: gültige Kontrollsignaturen, manipulierte ASN.1-Strukturen, Versions-/Hash-/Auflösungsabweichungen, zusätzliche Paketkopien und Checkout-Junction-Grenze.
- verify:fast vollständig grün: 1.275 Unit-, 472 Komponententests, 17 gültige Regelpaketkandidaten und bestehende Script-Suites.
- Produktions-Audit grün mit explizitem Nachweis des lokalen Backports; npm meldet weiterhin sechs hohe Meta-Pakete zur upstream ungepatchten Version.
- release:check grün; sieben Pull-Request-CI-Gates müssen vor Merge ebenfalls erfolgreich abgeschlossen sein.
