# VG-06: Quellenabfrage für Caritas-Pflegezulagensätze

Stand: 25.09.2026. `lookupCaritasCareAllowanceRate` liest für Datum,
Anlage 31/32, Tarifgebiet und § 12 Abs. 3/4 genau einen datierten Monatssatz
aus einem validierten Caritas-DRAFT-Paket. Das Ergebnis nennt Paketversion,
Satzkennung, Vollzeit-Monatsbetrag in Cent und Quellenkennungen.

Die Abfrage prüft reale Kalendertage, Paketgültigkeit, Tarifauswahl und
Vertragsversion. Bei fehlendem oder mehrdeutigem Satz liefert sie
`MISSING_CARE_ALLOWANCE_RATE`; sie übernimmt keinen Wert aus einer anderen
Region, Anlage oder Periode. Für RK Ost, § 12 Abs. 4, Januar bis Juni 2025
bleibt das Ergebnis deshalb ausdrücklich nicht verfügbar.

Die Tests decken alle fünf West-Regionalkommissionen und die drei
RK-Ost-Tarifgebiete, beide Pflege-Anlagen, beide Vorschriften sowie die
Stichtage Juli 2025 und Februar 2026 ab. DRAFT und `UNSUPPORTED` bleiben
Pflicht.

Die Abfrage ermittelt keinen persönlichen Anspruch, keinen Teilzeitbetrag
und kein Monatsgehalt. Sie ist weder an die App-Auswertung angebunden noch
eine Katalogaktivierung oder OTA.
