# VG-06: Bestätigte Monatszeitzuschläge im Teilbetrag (DRAFT)

Stand: 30.09.2026. Die Funktion ergänzt den
[bekannten Caritas-Monatsteilbetrag](vg06-caritas-bekannte-monatsbestandteile-draft.md)
um eine nichtleere Liste
[einzeln bestätigter Zeitzuschlagspositionen](vg06-caritas-persoenlicher-zeitzuschlag.md).
Jede Position erhält eine externe eindeutige Kennung, ein Dienstdatum im Monat,
eine fachlich bestätigte Zuschlagsart und bestätigte volle Stunden. Die
Gültigkeit der regionalen Tabelle, Wochenzeit und Prozentsätze wird für jedes
Dienstdatum getrennt geprüft; Quellenkennungen bleiben je Position erhalten.

Das Beispiel Oktober 2025 für BW, Anlage 31, P6/Stufe 1 addiert acht bestätigte
Nachtstunden und vier bestätigte Feiertagsstunden am 3. Oktober zur monatlichen
Tabellenbasis. Die [offizielle AVR-Tabellenbroschüre 2025 West](https://s3.eu-central-1.amazonaws.com/coverpubl-lam-01/20251/SP/AVR_Tabellen-Broschur_2025_West_WebPDF.pdf)
belegt die Stundenwerte; die [AVR-Regel zu Zeitzuschlägen](https://www.avr-online.de/lambertus/avr-online/start.xav?start=%2F%2F%2A%5B%40attr_id%3D%27avr-online_normText_AVR_anl31_par6__2025-07-01%27+and+%40outline_id%3D%27avr-online_normText_AVR%27%5D)
setzt Anspruch, Freizeitausgleich und Vorrang voraus. Die Funktion entscheidet
diese Fragen nicht und ermittelt keine Stunden automatisch aus Schichten.

Das Ergebnis ist weiter `completeGross: false`: weitere Zeitzuschläge,
Schichtzulagen, Überstunden, Jahreszahlung und lokale Bedingungen fehlen. Es
erfolgt keine App-Anbindung oder OTA; Caritas bleibt `UNSUPPORTED`.
