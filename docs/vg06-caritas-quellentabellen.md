# VG-06: Caritas-Pflege-Quellentabellen

Stand: 24.09.2026. Dieses isolierte Paket enthält ausschließlich transkribierte
P-Monatswerte als **DRAFT-Quellenbeleg**. Es aktiviert keinen Caritas-Tarif,
berechnet kein persönliches Gehalt und veröffentlicht keinen Regelkatalog.

## Primärquellen und Geltung

Die [korrigierte Bundeskommission-Fassung vom 05.06.2025](https://caritas-dienstgeber.de/fileadmin/Beschluesse/BK/02_BK_2025-02_Beschluss_Allgemeine_Tarifrunde_Caritas_2025_Teil_1_gezeichnet_korrigiert.pdf)
enthält die mittleren P-Werte ab 01.07.2025 und 01.02.2026 für Anlagen 31
und 32. Die fünf westlichen Regionalkommissionen übernahmen die mittleren
Werte samt Tabellenanhang: [Baden-Württemberg](https://caritas-dienstgeber.de/fileadmin/Beschluesse/RK_BW/2025-06-24_Beschluss_RKBW_Tarifrunde_2025_Teil1.pdf),
[Bayern](https://caritas-dienstgeber.de/fileadmin/Beschluesse/RK_Bayern/2025-06-26_RKBayern_Beschluss_allgemeineTarifrunde_Teil1_gez.pdf),
[Mitte](https://caritas-dienstgeber.de/fileadmin/Beschluesse/RK_Mitte/2025-06-26_Beschluss_RKMitte_Tarifrunde_2025gez.pdf),
[Nord](https://caritas-dienstgeber.de/fileadmin/Beschluesse/RK_Nord/2025-06-18-beschluss-tarifrunde_2025-teil1-rk-nord.pdf)
und [Nordrhein-Westfalen](https://caritas-dienstgeber.de/fileadmin/Beschluesse/RK_NRW/2025-06-27-beschluss-tarifrunde_2025-rk-nrw.pdf).

Für RK Ost gelten eigene gedruckte Tabellen:
[2025](https://www.caritas.de/cms/contents/caritas.de/medien/dokumente/arbeitsrechtliche-ko/beschluesse/beschluesse-regional/2023-07-05-langfassu1/2023-07-05_langfassungeckpunktebeschlussrkostbeschlussdez.2019_werte_2025_gez.pdf?d=a&f=pdf)
und [2026](https://www.caritas.de/cms/contents/caritas.de/medien/dokumente/arbeitsrechtliche-ko/beschluesse/beschluesse-regional/2025-06-26-langfassu/2025-06-26_langfassungeckpunktebeschlussrkostbeschlussdez.2019_werte_2026_gez.pdf?d=a&f=pdf).
2025 unterscheidet sich Anlage 32 im Tarifgebiet Ost von Anlage 31 und
Tarifgebiet West. Die 2026er P-Werte sind in diesen Kombinationen gleich.

## Übernommene Dateien und Integrität

Die drei CSV-Dateien wurden bytegleich aus dem älteren VG-06-Gesamtcheckout
übernommen; die dortigen Quellennotizen bleiben erhalten.

| Datei                                 | SHA-256 der CSV                                                    |
| ------------------------------------- | ------------------------------------------------------------------ |
| `caritas-p-mittelwerte-2025-2026.csv` | `53a799d6f1df7d1c52bf774949a42e9b8cb29f0281e2298cdc2f423b9e4a7ca0` |
| `caritas-p-ost-2025.csv`              | `a7d6bca8a96b71263f791f42353e8baced2ba2e97c8468c4272f891022b59300` |
| `caritas-p-ost-2026.csv`              | `8694712ee0bd5518726f27234201df756be9b98df488c25b0f2b3e772b8c694e` |

Je Tabelle gibt es P4, P6 und P7 bis P16, aber kein P5. P4/P6 haben
Stufen 1–6; P7–P16 haben Stufen 2–6. Eine leere Stufe ist nicht Null Euro.
Der Quellencheck prüft Gruppenfolge, 62 positive Werte pro Tabelle, die
2025er Ost-Abweichung und alle 62 West-Übergänge um 2,8 Prozent.

## Grenze dieses Teilpakets

Die CSV-Werte sind Vollzeit-Tabellenwerte. Regionale Vollzeitstunden,
Teilzeitquote, Zulagen, persönliche Ansprüche, Zeitzuschläge,
Jahressonderzahlung und Regelwerkswechsel 2027 sind nicht Teil dieses
Quellenpakets. Weitere VG-06-Arbeitspakete übernehmen erst den Regelvertrag,
danach West- und Ost-DRAFT-Kandidaten, dann isolierte Rechenpfade. Vor
App-Freigabe braucht es fachliche Prüfung und Geräteabnahme.
