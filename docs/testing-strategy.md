# Teststrategie

LUNA Shift trennt schnelle Fachtests, React-Komponententests, native End-to-End-Flows und manuelle Geräteabnahme. Kein einzelnes Gate ersetzt eine andere Ebene.

`npm run verify:fast` bündelt das lokale Entwicklungs-Gate. `npm run verify:full` ergänzt Coverage, Produktionsaudit, Release-Konfiguration und alle Exporte. In GitHub Actions laufen die vollständigen Prüfgruppen parallel und werden im erforderlichen Statuscheck `quality-gates` zusammengeführt.

| Ebene                      | Befehl/Gate                         | Zweck                                                                    |
| -------------------------- | ----------------------------------- | ------------------------------------------------------------------------ |
| Fachlogik und Repositories | `npm run test`                      | Kalender, Arbeitszeit, TVöD, Gehalt, Migrationen, SQLCipher-Lebenszyklus |
| React-Komponenten          | `npm run test:components`           | Zustände, Navigation, Accessibility und Fehlerdarstellung                |
| Kernlogik-Coverage         | `npm run test:coverage`             | Mindestens 80 % Statements/Lines/Functions und 70 % Branches             |
| Statische Qualität         | `npm run typecheck`, `npm run lint` | TypeScript- und React-/Expo-Regeln                                       |
| Bundle                     | `npm run export:web/android/ios`    | Metro-/Hermes-Auflösung für alle Zielplattformen                         |
| Native E2E                 | EAS Workflows + Maestro             | Onboarding, Navigation, Dienst-Lebenszyklus, SQLCipher-Persistenz        |
| Geräteabnahme              | `docs/release-checklist.md`         | VoiceOver/TalkBack, reale Builds, Upgrade-/Promotion und Store-Risiken   |

Der instrumentierte Coverage-Lauf lässt nur den zeitkritischen Performance-Benchmark aus; dieser läuft weiterhin verpflichtend in `npm run test:all` ohne Instrumentierungs-Overhead. Die Coverage-Auswahl umfasst die fachliche Kernlogik und infrastrukturellen Sicherheitsfunktionen, während gerätespezifische native Adapter durch EAS/Maestro und die Release-Checkliste abgedeckt werden.
