# Abhängigkeitssicherheit unter Expo SDK 57

LUNA Shift verwendet die in `package.json` deklarierte Expo-57-Abhängigkeitsbasis. Sicherheitskorrekturen müssen innerhalb dieser kompatiblen Paketfamilie bleiben; ein Wechsel der Expo-Hauptversion ist ein eigenes Arbeitspaket mit nativer Geräteabnahme.

## Automatisches Gate

`npm run audit:production` prüft den installierten Produktionsbaum und bricht bei neuen Schwachstellen der Stufen `high` oder `critical` ab. Die CI führt diesen Check bei jedem Pull Request und Push nach `master` aus.

Gepinnte transitive Overrides dürfen nur innerhalb kompatibler APIs aktualisiert werden. Nach jeder Override-Änderung müssen Unit-/Komponententests, `expo install --check` sowie Web-, Android- und iOS-Export bestehen.

`npm audit fix --force` wird nicht verwendet, weil es unkontrollierte Hauptversionswechsel und damit native Inkompatibilitäten auslösen kann. Aktuelle Befunde werden durch `npm run audit:production` bewertet und nicht als dauerhafte Momentaufnahme in diesem Dokument gepflegt.

## Metro-Sicherheitskorrektur vom 13. September 2026

Der gezielte Override `metro@0.84.4 -> 0.84.5` entfernt den verbleibenden
`image-size`-Abhängigkeitspfad der React-Native-Werkzeugkette. Expo verwendet
Metro 0.84.5 bereits über seinen eigenen Pfad. Upstream nennt den Ersatz durch
eigene Parser ausdrücklich als CVE-Korrektur:
[Metro 0.84.5](https://github.com/react/metro/releases/tag/v0.84.5).

Die beiden Audit-Ausnahmen wurden entfernt, nicht verlängert. Ebenso entfallen
die lokale Parser-Manipulation, ihr Postinstall und der Metro-Start-Hook.
`test:build-dependencies` prüft alle gelockten Metro-Kopien und deren installierte
Metadaten, das Fehlen von `image-size` im Lockfile sowie die Dimensionen der
PNG-Assets mit den Upstream-Parsern. Beide früher freigegebenen Advisories
blockieren das Audit jetzt ohne Datums-Ausnahme.

Lokaler Zwischenstand: Produktions-Audit ohne High-/Critical-Befunde und ohne
Ausnahmen; sieben fokussierte Tests bestanden. Die Online-Prüfung
`expo install --check` meldet inzwischen einen neueren SDK-57-Patchsatz
(Expo 57.0.22 und native Begleitpakete). Dieser native Patchsatz ist ein
getrennt abzugrenzender Release-Schritt; er wird nicht durch Ausschlüsse oder
eine Offline-Prüfung als erledigt dargestellt. Keine OTA-Kompatibilität oder
Store-Freigabe aus diesem Zwischenstand ableiten.

Weitere lokale Nachweise: `verify:fast` bestanden (729 Unit-Tests, 335
Komponententests und sämtliche Skripttests), Release-Konfiguration sowie iOS-,
Android- und Web-Export bestanden. Der interne iOS-Fingerprint lautet jetzt
`51374d7acdeb4924d103336218eaa54ea61f4717`, abweichend von der installierten
Preview-Runtime `eac302484061dfb3fa63e2a74b8618ff6000861c`. Daher keine OTA für
Build 31. Linux-CI, frisches `npm ci`, nativer Patchsatz und Geräteabnahme sind
für diesen Kandidaten noch offen. Die alten Parser-Skripte sind über Git
wiederherstellbar; keine Nutzerdaten wurden entfernt.

## Historie: lokale image-size-Absicherung (Arbeitspaket 8A-2)

Die folgende Beschreibung dokumentiert den früheren Stand. Die Sperre und die
befristeten Ausnahmen wurden durch die oben beschriebene Korrektur entfernt.

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
