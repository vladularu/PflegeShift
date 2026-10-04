# TVöD Anlage A: vollständiger Originalvertrag und datierte Tabellen

## Task-Vertrag

Ziel: Den erhaltenen Anlage-A-Vertrag 16, beide datierten Originalpakete und vollständige Referenzen reproduzierbar liefern.
Dateiscope: Paket-/Manifest-Schema, zwei generierte Artefakte, Validierungsanschluss, vollständiger Validator und Originaltest, Generator, zwei CSV-Dateien, zwei JSON-Pakete und dieser Beleg (13 Dateien).
Plattform: Plattformunabhängige Vertrags-/Tarifvorbereitung für den späteren iPhone-Fluss.
Abnahme: Frischer Primärquellenabgleich, vollständige Originalreferenzen, Erzeugung plus unverändernder --check, rules:generate, verify:fast und sieben grüne PR-CI-Prüfungen.
Nicht-Ziele: Persönliche Berechnung, App-Anbindung, native Änderung, Remote-Aktivierung oder Veröffentlichung.

## Frischer Primärquellenabgleich am 04.10.2026

- BT-K: https://vka.de/wp-content/uploads/2026/04/250406_TVoeD_Krankenhaeuser_TV-Aerzte-VKA.pdf
  SHA256 00e831fefffb833b689c1355c58e87cf25bdd6c585ab4693f41a187604b0ef6e.
  Gedruckte Seiten 67/68, PDF-Seiten 68/69.
- BT-B: https://vka.de/wp-content/uploads/2026/04/250406_TVoeD_Pflege_u_Betreuungseinrichtungen.pdf
  SHA256 0240e0d5430f94756f31e0ccc2ac2b7833ad1d1dae8a0911d21ea61ddcf26fd8.
  Gedruckte Seiten 65/66, PDF-Seiten 66/67.

Beide PDFs wurden neu geladen; ihre Hashes stimmen exakt mit den erhaltenen Quellen überein. Je Zeitraum 2025-04 und 2026-05 wurden alle 101 tatsächlichen Geldzellen unabhängig aus beiden PDFs mit den Original-CSV-Dateien abgeglichen: insgesamt 404 PDF-Zellenvergleiche.
Die 17 Entgeltgruppen einschließlich EG9a/9b/9c bleiben erhalten. EG1 besitzt keine Stufe1; fehlende Zellen werden nicht als Nullwerte erfunden.

## Originalerhalt und Grenzen

Vollständiger Originalvalidator, alle Originalreferenzassertionen und unveränderte CSV-/JSON-Daten bleiben erhalten. Der Generator bekommt nur einen unverändernden --check; er erzeugt denselben Originalinhalt.
Nur die beiden Anlage-A-Richtlinien und Vertrag 16 werden in das aktuelle Schema aufgenommen. Allgemeine TVöD-Pflichtfelder werden für diesen eigenständigen DRAFT-Vertrag durch seinen eigenen Validator geprüft.
BT-K und BT-B behalten ihre getrennten Quellenzuordnungen, Zeiträume und Sonderregelverweise. Zuschlags-/Überstundenrichtlinien sind datiert und geprüft, begründen hier noch keine Berechnung.
Alle Fähigkeiten bleiben UNSUPPORTED, Vertrag 16 bleibt außerhalb des ausführbaren Remote-Katalogs. Unabhängige Fachprüfung, persönliche Integration und Geräteabnahme bleiben separate offene Gates.
