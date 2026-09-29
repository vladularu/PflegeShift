# VG-06: Bestätigter persönlicher Caritas-Zeitzuschlag (DRAFT)

Stand: 30.09.2026. Diese reine Funktion multipliziert **einen**
[quellengebundenen Zuschlagswert je Stunde](vg06-caritas-zeitzuschlags-stundenwerte.md)
mit extern bestätigten ganzen vergütungspflichtigen Stunden eines Dienstdatums.
Sie verlangt eine bestätigte Auszahlung, die fachlich geprüfte Zuschlagsart
einschließlich möglicher Überschneidungen und die bestätigte Stundenzahl.
Unbekannte oder verneinte Ansprüche liefern keinen Betrag.

[AVR Anlage 31 § 6 Abs. 1](https://www.avr-online.de/lambertus/avr-online/start.xav?start=%2F%2F%2A%5B%40attr_id%3D%27avr-online_normText_AVR_anl31_par6__2025-07-01%27+and+%40outline_id%3D%27avr-online_normText_AVR%27%5D)
bestimmt die Zuschläge je Stunde und die Vorrangregel bei gleichzeitigem
Sonntags-, Feiertags-, Vorfesttags- oder Samstagszuschlag. Die
[offizielle Tabellenbroschüre 2025 West](https://s3.eu-central-1.amazonaws.com/coverpubl-lam-01/20251/SP/AVR_Tabellen-Broschur_2025_West_WebPDF.pdf)
enthält die gegengetesteten P6-Stundenwerte. Die Funktion wählt weder
Zeitabschnitte aus einem Dienstplan noch entscheidet sie über Freizeitausgleich,
Zeitausgleich statt Auszahlung, Bereitschaftsdienst oder regionale und örtliche
Zusatzregeln. Die Stunden und der Anspruch müssen vorher fachlich geklärt sein.

Das Ergebnis ist eine DRAFT-Teilposition (`completeGross: false`) mit allen
Tabellen-, Wochenzeit- und Satzquellen. Ganze Stunden sind auf 1 bis 24 je
Dienstdatum begrenzt; Teilstunden und über mehrere Tage verteilte Dienste sind
nicht abgebildet. Keine App-Anbindung oder OTA; Caritas bleibt `UNSUPPORTED`.
