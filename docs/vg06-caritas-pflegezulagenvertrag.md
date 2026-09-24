# VG-06: Vertrag für datierte Caritas-Pflegezulagensätze (DRAFT)

Stand: 25.09.2026. `caritasCareAllowanceRates` erfasst künftig veröffentlichte
Monatssätze nach § 12 Abs. 3 und 4 der AVR-Anlagen 31/32 getrennt nach Anlage,
Tarifgebiet und Gültigkeitszeitraum. Ein Satz belegt keinen persönlichen Anspruch.
Dieses Paket enthält noch keine Satzdaten und keine Berechnung.

Der Schema-Vertrag verlangt für jeden Eintrag eine eindeutige Kennung, die
Vorschrift, Anlage, Region, zwei Datumsgrenzen, einen positiven Centbetrag und
Quellenkennungen. Sobald Sätze in einem Caritas-Paket stehen, prüft die
semantische Validierung:

- Vertrag 14 und die zugehörige Caritas-Identität;
- bekannte Anlagen, Tarifgebiete und Quellen sowie eindeutige Satzkennungen;
- Zeiträume innerhalb des Pakets ohne Lücken oder Überschneidungen für jede
  Kombination aus Vorschrift, Anlage und Tarifgebiet;
- bei § 12 Abs. 4 den [korrigierten Bundesbeschluss zur Tarifrunde
  2025](https://caritas-dienstgeber.de/fileadmin/Beschluesse/BK/02_BK_2025-02_Beschluss_Allgemeine_Tarifrunde_Caritas_2025_Teil_1_gezeichnet_korrigiert.pdf)
  und den jeweiligen Regionalbeschluss;
- bei § 12 Abs. 3 die [Erläuterung der Caritas-Dienstgeber zu regionalen
  Pflegezulagen](https://caritas-dienstgeber.de/detail-news/avr-erklaert-teil-5-zulagen-als-bestandteile-der-entlohnung/).

Für RK Ost beginnt die verlangte Abdeckung von § 12 Abs. 4 im Paket 2025 erst
am 01.07.2025. Januar bis Juni bleiben ohne belegten regionalen Satz; die
Validierung ergänzt dafür keinen geschätzten Betrag. Die §-12-Abs.-3-Sätze
müssen dagegen den gesamten Paketzeitraum abdecken.

Alle Caritas-Pakete bleiben `DRAFT`, und ihre Berechnungsfähigkeiten bleiben
`UNSUPPORTED`. Als nächste getrennte Schritte folgen die regionalen Sätze,
persönliche Anspruchsprüfung und erst danach mögliche Ergebnispositionen.
Keine App-Auswertung oder OTA verwendet diesen Vertrag.
