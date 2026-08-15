# Abhängigkeitssicherheit unter Expo SDK 57

PflegeShift verwendet die in `package.json` deklarierte Expo-57-Abhängigkeitsbasis. Sicherheitskorrekturen müssen innerhalb dieser kompatiblen Paketfamilie bleiben; ein Wechsel der Expo-Hauptversion ist ein eigenes Arbeitspaket mit nativer Geräteabnahme.

## Automatisches Gate

`npm run audit:production` prüft den installierten Produktionsbaum und bricht bei neuen Schwachstellen der Stufen `high` oder `critical` ab. Die CI führt diesen Check bei jedem Pull Request und Push nach `master` aus.

Gepinnte transitive Overrides dürfen nur innerhalb kompatibler APIs aktualisiert werden. Nach jeder Override-Änderung müssen Unit-/Komponententests, `expo install --check` sowie Web-, Android- und iOS-Export bestehen.

`npm audit fix --force` wird nicht verwendet, weil es unkontrollierte Hauptversionswechsel und damit native Inkompatibilitäten auslösen kann. Aktuelle Befunde werden durch `npm run audit:production` bewertet und nicht als dauerhafte Momentaufnahme in diesem Dokument gepflegt.

## Upgrade-Regel

1. Expo-Zielversion als eigenes Arbeitspaket festlegen und deren versionierte Dokumentation lesen.
2. Abhängigkeiten ausschließlich mit `npx expo install` ausrichten.
3. SQLCipher-Konfiguration, Datenbank-Promotion und SecureStore-Kontinuität auf den beauftragten Plattformen testen.
4. Alle lokalen Gates, EAS/Maestro und die Geräte-Release-Checkliste abnehmen.
5. Erst danach die neue Expo-Hauptversion als Projektbasis dokumentieren.
