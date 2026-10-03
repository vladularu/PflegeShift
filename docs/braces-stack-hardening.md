# braces: begrenzte Verschachtelung, GHSA-vfj7-8cjw-p6xm

## Task-Vertrag

- Ziel: Den neuen Produktions-Audit-Blocker durch einen überprüften Installations-Backport beheben, bevor das getrennte Caritas-Paket geliefert wird.
- Plattform: Node/Expo-Buildwerkzeuge; Expo ~57.0.22, versionierte SDK-57-Dokumentation geprüft.
- Scope: genau sieben Dateien: Paketmanifest (Lockfile unverändert), Härtungsskript und MIT-Quellenmanifest, Härtungstests, Audit-Skript/-Tests sowie dieser Beleg.
- Nicht-Ziele: neue Expo-/Native-Version, pauschale Audit-Ausnahme, Version einer unveröffentlichten Korrektur behaupten, App-Aktivierung, EAS/OTA/Store.
- Abnahme: exakte Original-/Postimage-Hashes, frisches `npm ci`, manipulierte Versionen/Dateien/Lockdaten/Installationspfade, alle öffentlichen Methoden bei tiefen Eingaben und ASTs, strengere/fractionale Grenzen und Elternzyklen; normales Globverhalten, `verify:fast`, Audit/Release und sieben grüne PR-Prüfungen.
- Git-Lieferung: bestehende ausdrückliche Freigabe. Separater vorhandener sauberer Worktree; keine Caritas-Dateien in diesem Branch.

## Geprüfte Quellen und Stand 03.10.2026

- [GitHub Advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm): `braces <=3.0.3`, hohe Schwere; keine korrigierte veröffentlichte Version angegeben.
- [Upstream-Issue #70](https://github.com/micromatch/braces/issues/70): unkontrollierte Rekursion in AST-Verarbeitung bei tiefen Mustern.
- [Offener Upstream-PR #72](https://github.com/micromatch/braces/pull/72), exakter Commit `28d440b5dd449dbf1fe6f3506cf94ecca4d02660`: Grenze 100, Parse-/Compile-/Expand-/Stringify-Prüfungen, fractional `maxDepth`, Stringify-Kompatibilität und Zyklusprüfung in Expand.
- npm meldet weiterhin `3.0.3` als veröffentlichte Version. Der vorgeschlagene PR ist nicht gemergt und wird hier ausdrücklich als lokaler Backport verwendet.

## Integrität und Audit

Das Quellenmanifest enthält Originale und exakte Upstream-Postimages samt Hashes sowie MIT-Lizenz. Die npm-Dateien wurden bytegenau mit dem Originaltag 3.0.3 verglichen. Fünf Dateien werden geändert; `index.js` und `lib/utils.js` bleiben als zusätzliche Auflösungs-/Integritätsanker enthalten.

Der Postinstall-Schritt akzeptiert ausschließlich den festen Paket-Pin 3.0.3, die originale npm-Archivintegrität, genau eine Lockfile-Kopie und bekannte Original-/Postimage-Dateien. Alle Dateien werden vor Schreibzugriff geprüft. Unbekannte oder teilweise gepatchte Installationen bleiben gesperrt. Dateipfade müssen vollständig im Checkout liegen; alle im Lockfile erfassten direkten Eltern müssen auf diese Installation auflösen.

Der Produktions-Audit prüft den tatsächlich installierten Backport. Nur der exakte Advisory-Fund (Paket, Source-ID, Schwere, URL, Titel, Bereich und Installationspfad) erhält mit einem nicht fälschbaren, an genau diesen Checkout gebundenen Nachweis den Status mitigiert. npm-Meldungen bleiben sichtbar; unbekannte/geänderte und andere hohe/kritische Funde bleiben blockierend. Die bestehende node-forge-Härtung bleibt separat erhalten.

Normale Muster bleiben kompatibel. Tiefe Muster/ASTs werden kontrolliert über begrenzte Prüfungen abgewiesen; eine allgemeine Gewähr gegen sämtliche Ressourcenangriffe wird nicht behauptet. Der Backport ist zu entfernen, sobald eine geprüfte veröffentlichte Korrektur eingesetzt wird.

## Verifikation

- Frisches `npm.cmd ci --no-audit --no-fund`: erfolgreich; beide Postinstall-Härtungen angewendet.
- `npm.cmd run test:audit-policy`: 52 Tests bestanden, einschließlich 29 braces-Härtungsfällen und fünf zusätzlichen Audit-Fällen.
- `npm.cmd run verify:fast`: bestanden; 1.606 Unit- und 472 Komponententests sowie alle eingebundenen Vertrags-/Operatorprüfungen.
- `npm.cmd run audit:production`: bestanden; zwei exakt geprüfte installierte Backports, keine unbehobenen hohen/kritischen Advisories.
- `npm.cmd run release:check`, Format und `git diff --check`: bestanden.
- Sieben erfolgreiche PR-Prüfungen bleiben das verbindliche Merge-Gate; CI-Nachweis im zugehörigen Pull Request.
