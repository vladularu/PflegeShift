# VG-06: gesperrter Caritas-Pflege-Tabellenvertrag

Stand: 24.09.2026. Dieses Teilpaket ergänzt den gemeinsamen App-/Backend-Vertrag
um Engine-Vertragsversion 14 für datierte P-Monatstabellen. Es enthält keine
regionalen Kandidatenpakete, persönliche Berechnung, UI-Änderung oder
Veröffentlichung.

## Geltungsgrenze

- Sechs ausdrückliche Paketkennungen für Baden-Württemberg, Bayern, Mitte,
  Nord, Nordrhein-Westfalen und Ost; zwei Varianten für Anlagen 31 und 32.
- Ost trennt Tarifgebiet Ost, Berlin und Hamburg. Jede Kombination verweist
  ausdrücklich auf eine P-Tabelle. Eine gemeinsam verwendete Tabelle ist nur
  eine bewusste Zuordnung, kein pauschaler West-/Ost-Gleichstand.
- Zulässige Zeiträume: West 01.07.2025–31.01.2026 und
  01.02.2026–31.12.2026; Ost 01.01.–31.12.2025 und 01.01.–31.12.2026.
  Ab 2027 sind gesonderte Regeltexte und regionale Beschlüsse erforderlich.
- Jede Tabelle hat genau 62 positive Werte: P4 und P6 in Stufen 1–6,
  P7–P16 in Stufen 2–6. P5 ist in diesen Caritas-Pflege-Tabellen nicht
  enthalten.
- Alle Berechnungsfähigkeiten bleiben `UNSUPPORTED`; der Status muss `DRAFT`
  bleiben. Fremde Tarifformeln und Entgeltbestandteile sind gesperrt. Die
  Remote-Engine-Allowlist enthält Version 14 weiterhin nicht.

Die Quellenwerte selbst liegen im getrennten
`codex/vg06-caritas-quellen`-Paket. Maßgeblich sind der
[korrigierte Bundesbeschluss 2025](https://caritas-dienstgeber.de/fileadmin/Beschluesse/BK/02_BK_2025-02_Beschluss_Allgemeine_Tarifrunde_Caritas_2025_Teil_1_gezeichnet_korrigiert.pdf)
und die gedruckten Tabellen der RK Ost für
[2025](https://www.caritas.de/cms/contents/caritas.de/medien/dokumente/arbeitsrechtliche-ko/beschluesse/beschluesse-regional/2023-07-05-langfassu1/2023-07-05_langfassungeckpunktebeschlussrkostbeschlussdez.2019_werte_2025_gez.pdf?d=a&f=pdf)
und [2026](https://www.caritas.de/cms/contents/caritas.de/medien/dokumente/arbeitsrechtliche-ko/beschluesse/beschluesse-regional/2025-06-26-langfassu/2025-06-26_langfassungeckpunktebeschlussrkostbeschlussdez.2019_werte_2026_gez.pdf?d=a&f=pdf).

## Abnahme und nächster Schritt

Die Schema-/Vertragstests müssen Annahme aller sechs regionalen Identitäten,
beide Anlagen, die Ost-Zuordnung und Ablehnung von P5, fehlenden Werten,
impliziter Tabellenwahl, vorzeitigen Fähigkeiten und Fremdregeln zeigen.
`npm.cmd run verify:fast` und PR-CI sind vor einer Übernahme erforderlich.
Anschließend folgen regionale DRAFT-Pakete mit ihren Quellen, dann
Arbeitszeit-/Grundentgeltregeln und fachliche Referenzfälle. Eine
Gehaltsanzeige oder Preview-Lieferung folgt erst nach Fachreview.
