# Abhängigkeitssicherheit unter Expo SDK 54

MediShift bleibt bis zu einer eigenen Migrations- und Geräteabnahme auf Expo SDK 54. Sicherheitskorrekturen dürfen diesen SDK-Rahmen nicht stillschweigend überspringen.

## Automatisches Gate

`npm run audit:production` prüft den installierten Produktionsbaum und bricht bei neuen Schwachstellen der Stufen `high` oder `critical` ab. Die CI führt diesen Check bei jedem Pull Request und Push nach `master` aus.

Gepinnte transitive Overrides aktualisieren `brace-expansion` und `postcss` innerhalb ihrer kompatiblen APIs. Nach jeder Override-Änderung müssen Unit-/Komponententests, `expo install --check` sowie Web-, Android- und iOS-Export bestehen.

## Bekannte SDK-Befunde

Am 4. August 2026 meldet `npm audit --omit=dev` keine hohen oder kritischen Befunde. Verbleibende moderate Meldungen stammen aus dem Expo-54-Konfigurations-/Buildpfad (`@expo/cli`, Config Plugins, Xcode/UUID und abhängige Expo-Pakete). Der von npm angebotene automatische Fix würde einen nicht kontrollierten SDK-Wechsel auslösen und wird deshalb nicht mit `npm audit fix --force` angewendet.

Diese Befunde verarbeiten keine nicht vertrauenswürdigen Inhalte innerhalb der ausgelieferten Offline-App. Sie bleiben dennoch im Release-Risiko-Register, bis eine geplante Expo-Migration mit nativen Builds, SQLCipher-Promotion und realen Gerätetests abgeschlossen wurde.

## Upgrade-Regel

1. Expo-Zielversion als eigenes Arbeitspaket festlegen und deren versionierte Dokumentation lesen.
2. Abhängigkeiten ausschließlich mit `npx expo install` ausrichten.
3. SQLCipher-Konfiguration, Datenbank-Promotion und SecureStore-Kontinuität auf iOS und Android testen.
4. Alle lokalen Gates, EAS/Maestro und die Geräte-Release-Checkliste abnehmen.
5. Erst danach die bekannten moderaten SDK-Befunde aus diesem Register entfernen.
