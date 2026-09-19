# UX-01 – rote Farbgestaltung in App und Onboarding

Stand: 19.09.2026. Entwicklungsbasis: bdc632e13a0a23f7e176e1a33414433a049f1e4d.
Branch: codex/ux01-red-theme-ota.

## Ergebnis und Freigabe

Markenaktionen verwenden in beiden Modi #C93443 mit weißer Beschriftung.
Auch Jahreszahl und tatsächlicher aktueller Monat der Jahresübersicht sind rot.
Andere Monatsnamen, die normale Monatsansicht und die Heute-Markierung bleiben
unverändert. Kleine eigenständige Aktionstexte bleiben im Dunkelmodus hell.
App und Onboarding teilen die funktionalen Farbrollen.

Der Nutzer hat nach dem zweiten Preview-OTA am 19.09.2026 mit
„funktioniert. wie gehts weiter“ die Farbkorrektur auf seinem iPhone bestätigt.
Ziel ist die von ihm ausgewählte Preview-App, Build 31. Gerätemodell und iOS-Version
wurden nicht erhoben. Ein Vorher-Screenshot der Jahresübersicht liegt in der
Aufgabenunterhaltung vor; ein Nachher-Screenshot wurde nicht bereitgestellt.
Diese Rückmeldung ist die Nutzerabnahme der Farbkorrektur, keine vollständige
Abnahme aller App-Funktionen, Safe Areas oder Dynamic-Type-Zustände.

Commit, Push, PR und Merge nach grüner CI wurden anschließend ausdrücklich
freigegeben. Für diesen Git-Abschluss sind kein weiterer Build und kein weiteres
OTA beauftragt.

## Scope und Teilpakete

### A – App-Palette und gemeinsame Aktionen (14 Dateien)

- src/theme/palette-values.ts
- src/theme/color-contrast.test.ts
- src/ui/design-system.tsx
- src/ui/form-controls.tsx
- src/ui/loading-view.tsx
- src/ui/brand-actions.component.test.tsx
- src/navigation/app-tabs.native.tsx
- src/navigation/app-tabs-js.tsx
- src/features/day-editor/appointment-recurrence-overlay.tsx
- src/features/day-editor/shift-notification-overlay.tsx
- src/features/day-editor/entry-options.tsx
- src/features/salary/salary-screen.tsx
- src/features/calendar/calendar-header.component.test.tsx
- src/features/calendar/calendar-prototype-canvas.component.test.tsx

### B – Onboarding-Farbrollen (4 Dateien; nach A)

- src/theme/onboarding.ts
- src/features/onboarding/onboarding-controls.tsx
- src/features/onboarding/percentage-slider.tsx
- src/features/onboarding/onboarding-screen.component.test.tsx

Dieses Dokument ist die gemeinsame Liefernotiz. Nicht enthalten sind Änderungen
an Onboarding-Ablauf, Fachlogik, Daten, nativen Icons/Splash, SDK oder Dependencies.
Die unabhängigen Änderungen im ursprünglichen Checkout bleiben unberührt.
Die native Build-31-Basis wird nicht in den Entwicklungsbranch zurückübertragen.

## Prüfungen

- Regeln, TypeScript, ESLint ohne Warnungen und Prettier: erfolgreich.
- Unit-Tests: 104 Dateien / 731 Tests erfolgreich.
- Komponententests: 73 Dateien / 359 Tests erfolgreich.
- Neun weitere Script-Testgruppen: erfolgreich.
- git diff --check: erfolgreich.
- verify:fast wurde ausgeführt. Die unveränderte Jest-Testsuche unter dem lokalen
  Windows-Pfad findet keine Tests; sämtliche Komponententests wurden deshalb mit
  npm.cmd run test:components -- --testMatch '**/src/**/*.component.test.tsx'
  ausgeführt. Die nachfolgenden Script-Gruppen wurden separat vollständig geprüft.
  Der lokale Sammelbefehl selbst ist nicht grün; keine Tests oder Gates wurden
  entfernt oder abgeschwächt. Vor Merge muss die unveränderte Linux-PR-CI samt
  abschließendem quality-gates-Job erfolgreich sein.
- Konkrete Farbwert-Assertions schützen beide Modi, den realen aktuellen Monat
  und einen neutralen September im Folgejahr.
- Onboarding-Test bestätigt, dass Wochenstunden beim Moduswechsel erhalten bleiben
  und die Vorschau keine Profildaten speichert.
- Preview-Liefercheckout zusätzlich: 40 Farbtests, 17 Kalender-Komponententests
  und lokaler iOS-Bundle-Export erfolgreich.

Kontrastgrenze: #C93443 auf #111315 erreicht rund 3,60:1. Für die kleinen
Monatsüberschriften wird keine pauschale AA-Kleintext-Konformität behauptet.
Weiße Aktionsbeschriftungen und allgemeine Textrollen besitzen eigene Kontrasttests.

## Bereits gelieferte Preview-OTAs

Ziel: preview / iOS / Build 31, APP_VARIANT=internal, EAS-Umgebung preview.
Build-ID: 90712c7a-2744-42d2-991e-c2cfeee05865.
Runtime: eac302484061dfb3fa63e2a74b8618ff6000861c.

- 19.09.2026, 21:02:23 UTC: Gruppe 76d9392b-2706-4297-b54b-6da7e27d86e0
  (Farbgestaltung App und Onboarding).
- 19.09.2026, 21:12:10 UTC: Gruppe 7384006e-221f-453e-963a-55fa65358a7f,
  iOS-Update 01a0bb83-28fa-7822-9c85-3db0e9e33acf
  (zusätzlich Jahreszahl und aktueller Monat rot).
- Beide Veröffentlichungen wurden nach ausdrücklicher Freigabe ausgeführt und
  anschließend per update:list auf Branch, Plattform und Runtime verifiziert.
- Kein neuer nativer Build, kein Production-/TestFlight-Update.

Der getrennte Lieferbranch codex/ux01-preview31-red basiert auf ef3f429 und
bewahrt die installierte native Basis sowie den vorherigen OTA-JavaScript-Stand.
485 App-/Source-/Asset-Dateien wurden gegen den Entwicklungsstand verglichen;
die vier Dateien der anschließenden Kalenderkorrektur sind ebenfalls bytegleich.
Die ursprünglichen CRLF-Zeilenenden von .gitignore sind Teil dieser Lieferbasis:
LF erzeugt trotz gleichem Text einen anderen Fingerprint. Es wurde keine Runtime
erzwungen oder Fingerprint-Regel verändert.

Geprüftes finales iOS-Bundle:
dist/ios/_expo/static/js/ios/entry-5198a78399830afe1028c2bb49e618ad.hbc.
SHA256: ACF63FD5317C773F83D4A334A4A1B62AD7514B014E0AD33D14378CFE8572D2F4.
Der Liefercheckout und seine vollständige Release-Notiz bleiben lokal erhalten.
