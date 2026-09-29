# VG-06: bekannte Monatsbestandteile mit bestätigter Schichtzulage (DRAFT)

Stand: 29.09.2026. Diese zusätzliche Fachfunktion setzt den bestehenden
[bekannten DRAFT-Monatsteilbetrag](vg06-caritas-bekannte-monatsbestandteile-draft.md)
mit genau einer [persönlichen monatlichen Schicht- oder Wechselschichtzulage](vg06-caritas-persoenliche-monatliche-schichtzulage.md)
zusammen. Die bisherige Funktion und ihr Ausschluss von Schichtzulagen bleiben
unverändert. Für die neue Variante muss der Anspruch auf die monatliche Zulage
für den ganzen Monat extern bestätigt sein; auch die vereinbarte Wochenzeit
muss für den ganzen Monat feststehen.

Jede Position behält ihre Quellenkennung. Die Schichtposition trennt zusätzlich
Satz- und Arbeitszeitquellen. Der Centbetrag wird erst nach der individuellen
Rundung jeder Position addiert. Das Ergebnis heißt
`draft-known-monthly-components-with-shift`, trägt `completeGross: false` und
bezeichnet nur einen bekannten Teilbetrag. Andere Schichtzulagen, Zeitzuschläge,
Überstunden, Jahreszahlung und örtliche Entgeltbestandteile bleiben offen.
Die [Caritas-Dienstgeber-Erläuterung](https://caritas-dienstgeber.de/detail-news/avr-erklaert-teil-7-dienstbezuege/)
ordnet Schichtzulagen als zusätzliche unständige Bezüge ein und beschreibt die
Teilzeitquote für Anlage 31/32.

Fünf gezielte Tests prüfen West und RK Ost, Voll- und Teilzeit, beide monatlichen
Zulagenarten, Quellenpositionen, fehlende Ost-Sätze, unbestätigten Anspruch,
unstabile Wochenzeit und manipulierte Pakete. Eine unbekannte Berechtigung,
Teilmonate und fehlende Quellen liefern kein Ergebnis. Die App ist nicht
angebunden; es gibt keine Katalogaktivierung oder OTA.
