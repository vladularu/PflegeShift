# LUNA Shift Marken- und Kompatibilitätsvertrag

## Sichtbare Marke

Der Produktname lautet in App, Systemanzeigen, Benachrichtigungen und Dokumentation exakt
`LUNA Shift`. Die Bildmarke ist die Mondsichel als `U` in Graphit `#111315`, warmem Creme
`#F6F3EC` und Petrol `#2E766F`.

Die Laufzeitbilder werden reproduzierbar mit `npm.cmd run assets` erzeugt. Die verbindliche
visuelle Referenz liegt unter `assets/brand/lunashift/lunashift-approved-reference.png`.

## Beibehaltene technische Identitäten

Diese Werte bleiben zur Update- und Datenkontinuität absichtlich unverändert:

- Expo-Slug und URL-Schema `pflegeshift`
- iOS-/Android-ID `com.pflegeshift.app` sowie die interne Variante
- EAS-Projekt-ID und Update-URL
- npm-Paketname `pflegeshift`
- SQLCipher-Dateinamen und SecureStore-Service-Namen
- native Modul-, TypeScript- und Regelkatalog-Bezeichner mit `PflegeShift`
- bestehende Operator-Secret-Pfade unter `%LOCALAPPDATA%\PflegeShift`
- GitHub-Repository-URL bis zu einer separat freigegebenen Repository-Umbenennung

Diese Namen sind keine sichtbare Produktmarke. Sie dürfen nicht ohne einen eigenen Migrations-,
Build- und Rollback-Plan geändert werden.
