# VG-06: bekannte Caritas-Monatsbestandteile (DRAFT)

Stand: 25.09.2026. Diese isolierte Fachfunktion setzt für einen vollständigen
Kalendermonat die bereits geprüfte persönliche Tabellenbasis und, bei jeweils
bestätigtem Anspruch, die Pflegezulagen nach § 12 Abs. 3 und 4 zusammen.
Sie verwendet nur validierte DRAFT-Pakete, die regionale Wochenzeit und
datierte Quellensätze. Jeder Bestandteil behält seine Quellenkennungen.

Ein Ergebnis heißt ausdrücklich `draft-known-monthly-components` und trägt
`completeGross: false`. Der bekannte Teilbetrag enthält **keine**
Schichtzulagen, zeitabhängigen Zuschläge, Überstunden, Jahreszahlung oder
abweichenden örtlichen Vereinbarungen. Die
[Caritas-Dienstgeber-Erläuterung](https://caritas-dienstgeber.de/detail-news/avr-erklaert-teil-7-dienstbezuege/)
unterscheidet monatliche Dienstbezüge von weiteren Entgeltbestandteilen und
beschreibt die Teilzeitquote nach § 12a der Anlagen 31/32. Deshalb darf der
bekannte Teilbetrag nicht als vollständiges Monatsbrutto angezeigt werden.

Die Funktion verlangt Bestätigung des durchgehenden Arbeitsverhältnisses
und des vollen monatlichen Tabellenanspruchs. Für beide Zulagen braucht sie
jeweils eine Entscheidung `CONFIRMED` oder `NOT_ENTITLED`; bei
`UNKNOWN` wird kein Teilbetrag ausgegeben. Untermonatige Regelwechsel,
Teilmonate, ungültige Auswahl und fehlende Quellensätze bleiben nicht
verfügbar. Das gilt insbesondere für RK Ost § 12 Abs. 4 vor Juli 2025.

Die App ist nicht angebunden. Es erfolgt weder Katalogaktivierung noch OTA.
Als eigene Folgepakete sind Schichtzulagen, zeitabhängige Zuschläge,
Überstunden und weitere Monatspositionen zu prüfen.
