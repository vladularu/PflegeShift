# Abhängigkeitssicherheit unter Expo SDK 57

LUNA Shift verwendet die in `package.json` deklarierte Expo-57-Abhängigkeitsbasis. Sicherheitskorrekturen müssen innerhalb dieser kompatiblen Paketfamilie bleiben; ein Wechsel der Expo-Hauptversion ist ein eigenes Arbeitspaket mit nativer Geräteabnahme.

## Automatisches Gate

`npm run audit:production` prüft den installierten Produktionsbaum und bricht bei neuen Schwachstellen der Stufen `high` oder `critical` ab. Die CI führt diesen Check bei jedem Pull Request und Push nach `master` aus.

Gepinnte transitive Overrides dürfen nur innerhalb kompatibler APIs aktualisiert werden. Nach jeder Override-Änderung müssen Unit-/Komponententests, `expo install --check` sowie Web-, Android- und iOS-Export bestehen.

`npm audit fix --force` wird nicht verwendet, weil es unkontrollierte Hauptversionswechsel und damit native Inkompatibilitäten auslösen kann. Aktuelle Befunde werden durch `npm run audit:production` bewertet und nicht als dauerhafte Momentaufnahme in diesem Dokument gepflegt.

## Lokale image-size-Absicherung (Arbeitspaket 8A-2)

Metro verwendet `image-size@1.2.1` ausschließlich in der Node-Build-Werkzeugkette.
`scripts/image-size-guard.cjs` sperrt die nicht benötigten ICNS-, HEIF- und
Container-JXL-Parser vor ihrer Validierung. HEIC und AVIF gehören zum HEIF-Parser
und werden ebenfalls nicht unterstützt. Der separate JXL-Codestream-Parser bleibt
unverändert. App-Oberfläche, Datenbank, Geräte-Fotobibliothek und native Bilddecoder
werden nicht verändert.

- `npm ci` / `npm install` wenden den Schutz über `postinstall` an. Keine neue
  Abhängigkeit, kein Hauptversionswechsel und keine globale Laufzeit-Manipulation.
- Der Schutz steht in den installierten Parser-Dateien und gilt damit auch in
  frischen Node-Prozessen und Metro-Workern. Er beruht nicht auf Dateiendungen.
- Exakte Version, Lockfile-Kopien, Metro-Auflösung und SHA-256 der ursprünglichen
  Parser werden geprüft. Unbekannte Quellen werden nicht überschrieben. Der
  ursprüngliche Code bleibt hinter einem CommonJS-Modul-`return` unerreichbar
  erhalten, damit wiederholtes Anwenden exakt prüfbar ist.
- Metro prüft vor dem Laden seiner Konfiguration, ob der Schutz vorhanden ist.
  Nach `npm ci --ignore-scripts` muss `npm run security:patch` explizit laufen;
  andernfalls bricht Metro ab. Bereits laufende Metro-Prozesse neu starten.
- `npm run security:check` prüft ohne Änderungen. `npm run test:image-size-guard`
  prüft Wiederholbarkeit, unbekannte Quellen/Versionen, manipulierte Bilder in
  begrenzten Kindprozessen, Dateipfade, Callback-API, Metro, Worker und vorhandene
  PNG-Assets. Die Tests sind Bestandteil von `verify:fast` und damit der PR-CI.

Dies ist eine lokale kompensierende Maßnahme, keine korrigierte Upstream-Version.
Die beiden Ausnahmen in `scripts/audit-production.mjs` bleiben unverändert und
laufen am **15. September 2026 um 00:00 UTC** ab. `npm audit` kann die Advisories
weiter melden. Eine Verlängerung oder andere Audit-Policy braucht eine separate
Entscheidung. Bei einer korrigierten kompatiblen Upstream-Version: Abhängigkeit
gezielt aktualisieren, Sperre und Ausnahmen nach erneutem Nachweis entfernen.

Vor Auslieferung sind `verify:fast`, Expo-Kompatibilitätsprüfung, alle drei
Plattform-Exporte und die Runtime-Fingerprint-Prüfung erforderlich. Keine OTA
aufgrund der Bezeichnung „build-only“ als kompatibel annehmen.

### Lokaler Prüfnachweis vom 6. September 2026

- `verify:fast`: 575 Vitest-, 190 Jest- und alle zusätzlichen Skripttests bestanden,
  einschließlich 12 Tests der Parser-Sperre. Expo-Abhängigkeiten kompatibel;
  Web-, Android- und iOS-Export sowie Release-Konfigurationsprüfung bestanden.
- Das Produktions-Audit besteht weiterhin nur mit den zwei unveränderten,
  befristeten Ausnahmen; es ist kein schwachstellenfreier Audit-Befund.
- Ein normales `npm ci` scheiterte auf diesem Windows-Rechner bei
  `better-sqlite3` an der C++-/Windows-SDK-Erkennung, vor dem Root-Postinstall.
  Die saubere Installation mit `npm ci --ignore-scripts --no-audit --no-fund`
  und anschließendem `npm run postinstall` gelang. Vor diesem Postinstall
  erkannte `security:check` die fehlende Sperre korrekt. Diese lokale Alternative
  ersetzt nicht den noch ausstehenden regulären `npm ci`-Nachweis in der Linux-PR-CI.
- Der lokale interne iOS-Fingerprint änderte sich von
  `bb21016c87646fbd117d5aecad30cd9eb389cb74` auf
  `eac302484061dfb3fa63e2a74b8618ff6000861c`; die Paket-Skripte sind eine
  Fingerprint-Quelle. Kein Ausschluss zur künstlichen Beibehaltung der Runtime.
  Linux-Prebuild-Vergleich, EAS-Runtime und eine eventuelle Geräteabnahme sind
  damit nicht belegt. Kein Build und keine OTA wurden gestartet.

## Upgrade-Regel

1. Expo-Zielversion als eigenes Arbeitspaket festlegen und deren versionierte Dokumentation lesen.
2. Abhängigkeiten ausschließlich mit `npx expo install` ausrichten.
3. SQLCipher-Konfiguration, Datenbank-Promotion und SecureStore-Kontinuität auf den beauftragten Plattformen testen.
4. Alle lokalen Gates, EAS/Maestro und die Geräte-Release-Checkliste abnehmen.
5. Erst danach die neue Expo-Hauptversion als Projektbasis dokumentieren.
