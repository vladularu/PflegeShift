# VG-06: persönliche monatliche Caritas-Schichtzulage (DRAFT)

Stand: 29.09.2026. Dieser isolierte Teilrechner nimmt ausschließlich
eine extern bestätigte, für den ganzen Monat bestehende Berechtigung
für ständige Wechselschichtarbeit oder ständige Schichtarbeit an.
Er ermittelt nicht selbst, ob Dienstplan und Tätigkeit die Voraussetzungen
des § 6 Abs. 5 oder 6 der Anlagen 31/32 erfüllen. Teilmonate, wechselnde oder unbestätigte vertragliche Wochenzeit und
unbekannte Berechtigungen bleiben nicht verfügbar.

Aus dem [Schichtzulagensatz-Lookup](vg06-caritas-schichtzulagensatzabfrage.md)
wird nur der zutreffende monatliche Vollzeitwert gelesen. Die vereinbarte
Wochenarbeitszeit und die regionale Vollzeit-Wochenzeit bestimmen den
persönlichen Betrag nach § 12a. Die [Caritas-Erläuterung zu Dienstbezügen
und Teilzeit](https://caritas-dienstgeber.de/detail-news/avr-erklaert-teil-7-dienstbezuege/)
bestätigt diese anteilige Behandlung der Schicht- und
Wechselschichtzulage in Anlage 32. Die datierten Satzquellen für
[West](vg06-caritas-west-schichtzulagensätze.md) und
[RK Ost](vg06-caritas-ost-schichtzulagensätze.md) bleiben am Ergebnis
nachvollziehbar.

Der Teilrechner prüft die vollständige Monatsabdeckung durch dasselbe
Satz- und Arbeitszeitregelwerk, die DRAFT-Paketvalidierung und gültige
Wochenminuten. Er liefert einen gerundeten Centbetrag mit Paket-,
Satz- und Arbeitszeitquellen. Fünf Tests umfassen West und RK Ost,
beide Anlagen, Voll- und Halbzeit, Bestätigung, Lücken und
Regelwechsel innerhalb eines Monats.

Nichtständige Zulagen pro Stunde, tatsächliche anspruchsberechtigte
Stunden, Kombination mehrerer Zulagen, Teilmonate und ein vollständiges
Brutto bleiben außerhalb dieses Pakets. Keine App-Anbindung, Katalog-
Aktivierung oder OTA.
