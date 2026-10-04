# TVöD SuE BT-B: erhaltener Originalvertrag und Quellentabellen

## Task-Vertrag

Ziel: Den vollständigen SuE-Vertrag 18, beide datierten Originaltabellen, den vollständigen Validator und alle ursprünglichen Paketreferenzen reproduzierbar liefern.
Dateiscope: Zwei Schemas, zwei generierte Artefakte, Validierungsanschluss, Validator, Originaltest, Quellenhelfer, Generator, zwei CSVs, zwei JSONs und dieser Beleg (14 Dateien).
Plattform: Plattformunabhängige Vorbereitung für den späteren iPhone-Fluss.
Abnahme: Unabhängiger Primärquellenabgleich, unveränderter vollständiger Originalumfang, reproduzierbare Erzeugung/--check, rules:generate, verify:fast und sieben grüne PR-CI-Prüfungen.
Nicht-Ziele: Persönliche Berechnung, App-Oberfläche, native Integration, Fachfreigabe, Aktivierung und OTA.

## Primärquellen am 04.10.2026

VKA-Lesefassung BT-B: https://vka.de/wp-content/uploads/2026/04/250406_TVoeD_Pflege_u_Betreuungseinrichtungen.pdf
SHA256: 0240e0d5430f94756f31e0ccc2ac2b7833ad1d1dae8a0911d21ea61ddcf26fd8.
Die in diesem Lauf frisch geladene Quelle stimmt mit dem Originalhash überein. Anlage C steht auf Druckseiten 94/95, physischen PDF-Seiten 95/96. Alle 192 Geldzellen wurden unabhängig aus dem PDF gelesen und mit den beiden Original-CSV-Dateien verglichen: identisch.
Die jeweils 16 tatsächlichen Gruppen besitzen sechs Stufen. S10, S6 und S5 sind unbesetzt und werden nicht als Nulltabellen ergänzt. Die Grenze 31.03.2027 bleibt ausdrücklich eine Produktgrenze.
Die Zulagenbänder sind zusätzlich in §52(6), Druckseite 86 / PDF-Seite87 geprüft: 130 Euro für die erfassten Gruppen S2 bis S11a, 180 Euro für S11b/S12/S14 und S15 ausschließlich Fallgruppe6. Die Teilzeit- und Umwandlungstagsgrenzen bleiben eigene fachliche Bedingungen.

## Originalerhalt und Generatorabgleich

Validator, sämtliche ursprünglichen Referenzassertionen, Quellenhelfer, CSVs und datierte JSONs bleiben vollständig erhalten. Das gesamte künftige Schema wird nicht übernommen; nur Vertrag18 und die ursprüngliche SuE-Zulagenpolicy werden ergänzt.
Der erhaltene Generator bildet noch den älteren Tabellenstand ohne die inzwischen im Originalpaket vorhandene Zulagenpolicy ab. Die kompatible Lieferung ergänzt deshalb exakt diese ursprüngliche Policy und einen unverändernden --check. Beide erzeugten JSON-Dateien müssen anschließend mit den vollständigen erhaltenen Originalpaketen übereinstimmen.
Alle Fähigkeiten bleiben UNSUPPORTED, Vertrag18 bleibt außerhalb des ausführbaren Remote-Katalogs. Persönliche Integration, unabhängige Fachprüfung und Geräteabnahme sind weitere offene Gates.
