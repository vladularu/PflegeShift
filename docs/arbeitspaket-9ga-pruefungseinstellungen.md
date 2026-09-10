# 9G-A – Prüfungseinstellungen

Ziel: Mehr → Prüfung bietet einen dauerhaft gespeicherten Schalter für freiwillige Planungshinweise. Default true erhält das bisherige Verhalten. Die Seite kennzeichnet ausdrücklich, dass die Anwendung auf Auswertungen erst in 9G-B folgt.

Nicht-Ziele: Filterung, neue Rechts- oder Tarifregeln, Score, Gehalt, Kalender, native Integration. Kein gesetzlicher Abschaltschalter.

Scope: neue Route/Seite und Tests, Einstellungen-Einstieg, preferences-repository, Backup-Validierung und Restore-Tests. Bestehende app_preferences-Tabelle, keine Migration oder native Abhängigkeit. SQLite gemäß Expo SDK 57: https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/.

Backup: neuer boolescher Allowlist-Schlüssel check_show_planning_hints, Export und transaktionaler Restore über vorhandenen Pfad. Alte Backups ohne Schlüssel setzen auf Default true zurück. Ältere App-Versionen können Backups mit neuem Schlüssel ablehnen; für diese die vor dem Update angelegte Sicherung behalten.

Abnahme auf iPhone 14 Pro Max: Seite in Hell/Dunkel lesbar, Schalter aus/ein, nach Schließen und Neustart wiederhergestellt. Neue Sicherung exportieren und Vorschau prüfen; Restore nur mit aktueller Sicherung. Dienste/Gehalt und Auswertung unverändert. Geräteabnahme vor Merge. OTA nur bei passender Preview-Runtime, kein neuer Build.

9G-B bleibt getrennt: Einstellung in Monats-/Jahresprüfung und Zählern anwenden, gesetzliche Hinweise und Abdeckung unabhängig sichtbar halten.
