# LUNA Shift Arbeitsregeln

## Expo-Version

Vor jeder Codeänderung:

1. Die installierte Expo-Hauptversion aus `package.json` lesen.
2. Die exakt passende versionierte Expo-Dokumentation verwenden.
3. Dokumentation älterer SDK-Versionen nur für ausdrücklich beauftragte Migrationen heranziehen.

Aktueller Stand: Expo SDK 57. Referenz: https://docs.expo.dev/versions/v57.0.0/

## Verbindlicher Ablauf

1. Aufgabe zunächst read-only untersuchen.
2. Ziel, Nicht-Ziele, Plattform, Dateiscope und Abnahmekriterien festhalten.
3. Bei erwarteten Änderungen in mehr als 15 Dateien oder über UI, Fachlogik und native Integration hinweg die Aufgabe in getrennte Arbeitspakete teilen.
4. Änderungen auf einem kurzlebigen Branch `codex/<thema>` umsetzen.
5. `npm.cmd run verify:fast` und die aufgabenspezifischen Tests ausführen.
6. Native und visuelle Änderungen auf dem Zielgerät abnehmen. EAS-Metadaten, Exporte und Komponententests ersetzen keinen Screenshot- oder Gerätenachweis.
7. Erst nach erfolgreicher Pull-Request-CI nach `master` mergen.

Commit, Push, EAS Build, EAS Update und Store-Veröffentlichung benötigen jeweils eine ausdrückliche Freigabe. Unabhängige Änderungen im Arbeitsverzeichnis bleiben unberührt.

Einmal pro Checkout wird `npm.cmd run workflow:setup` ausgeführt. Der versionierte Pre-Push-Hook blockiert direkte lokale Pushes nach `master`.

Die ausführliche Arbeitsweise und Task-Vorlage stehen in `WORKFLOW.md`.
