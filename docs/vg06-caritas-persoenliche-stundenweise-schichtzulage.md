# VG-06: persönliche stundenweise Caritas-Schichtzulage (DRAFT)

Stand: 29.09.2026. Der isolierte Teilrechner verwendet ausschließlich
extern bestätigte, einem konkreten Leistungsdatum zugeordnete **volle
vergütungspflichtige Stunden** nichtständiger Wechsel- oder Schichtarbeit.
Er leitet weder die nichtständige Tätigkeit noch die Anzahl der
vergütungspflichtigen Stunden aus dem Dienstplan ab. Eine zugleich bezogene
monatliche Zulage wird hier nicht addiert.

Der [korrigierte Bundeskommissionsbeschluss vom 05.06.2025](https://caritas-dienstgeber.de/fileadmin/Beschluesse/BK/02_BK_2025-02_Beschluss_Allgemeine_Tarifrunde_Caritas_2025_Teil_1_gezeichnet_korrigiert.pdf)
setzt ab Juli 2025 nach § 6 Abs. 5/6 der Anlagen 31/32 die Stundenwerte:
1,49 € für Wechselschicht in Anlage 31, 1,47 € in Anlage 32 und
0,59 € für Schichtarbeit in beiden Anlagen. Die geltenden regionalen
DRAFT-Sätze und Quellen werden über die
[datierte Satzabfrage](vg06-caritas-schichtzulagensatzabfrage.md) gelesen.
RK Ost vor Juli 2025 bleibt mangels belegtem Satz nicht verfügbar.

Der Rechner multipliziert den in Cent hinterlegten Stundensatz nur mit
einer positiven ganzen Stundenzahl von höchstens 24 am angegebenen Datum.
Bruchteile von Stunden, unbestätigte Stunden oder unbekannte Berechtigung
bleiben ausdrücklich nicht verfügbar, bis die fachliche Zuordnung und
Rundung geklärt sind. Das Ergebnis enthält Satz-, Paket- und Quellenkennung
sowie `completeGross: false`.

Vier gezielte Tests prüfen alle fünf westlichen Regionalkommissionen,
beide Anlagen und Zeiträume, drei Ost-Tarifgebiete, beide Stundenarten,
fehlende Sätze und ungültige Eingaben. Keine Monatsaggregation,
App-Anbindung, Katalogaktivierung oder OTA.
