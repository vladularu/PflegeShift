# VG-06: persönlicher Pflegezulagen-Teilbetrag (DRAFT)

Stand: 25.09.2026. Die Fachfunktion berechnet einen einzelnen
Pflegezulagen-Teilbetrag nach § 12 Abs. 3 oder 4 der AVR-Anlagen 31/32.
Sie verwendet den belegten, datierten Vollzeit-Satz und die vergleichbare
Vollzeitwochenzeit aus dem jeweiligen regionalen DRAFT-Paket.

Die [Caritas-Dienstgeber-Erläuterung zu Dienstbezügen und Teilzeit](https://caritas-dienstgeber.de/detail-news/avr-erklaert-teil-7-dienstbezuege/)
beschreibt die anteilige Zahlung nach § 12a der Anlagen 31 und 32 sowie für
monatliche Zulagen. Der Betrag wird mit den vereinbarten Wochenminuten
quotiert und auf Cent gerundet.

Der Aufrufer muss den Anspruch **für jede der beiden Vorschriften getrennt**
als `CONFIRMED` übergeben. `UNKNOWN` oder `NOT_ENTITLED` erzeugen keinen
Betrag. Die Funktion leitet einen Anspruch weder aus einer P-Gruppe noch aus
der Existenz eines Tabellensatzes ab. Im RK-Ost-Paket bleibt § 12 Abs. 4
für Januar bis Juni 2025 auch bei bestätigtem Anspruch ohne belegten Satz
nicht verfügbar.

Jedes Ergebnis nennt Satz-, Tabellen- und Arbeitszeitregelkennung sowie
deren Quellen. Es ist ausdrücklich kein vollständiges Brutto, keine
Monatsauswertung und keine App-Aktivierung. Anspruchsnachweise,
untermonatige Beschäftigung, weitere Zulagen und Zuschläge bleiben für
getrennte Fachpakete offen. Keine Katalogaktivierung oder OTA.
