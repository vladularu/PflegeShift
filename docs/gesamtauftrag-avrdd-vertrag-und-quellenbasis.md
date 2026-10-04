# AVR.DD: Originalvertrag und Quellenbasis

## Task-Vertrag

Ziel: Den erhaltenen AVR.DD-Vertrag 15 mit vollständiger semantischer Prüfung und unveränderten Originaltests auf aktuellem master liefern.
Nicht-Ziele: Persönliche Berechnung, App-Anbindung, Aktivierung, native Änderungen oder Veröffentlichung.
Plattform: Plattformunabhängige Regelverträge; späterer Zielfluss iPhone Preview.
Dateiscope: Paket- und Manifest-Schema, zwei generierte Artefakte, Validierungsanschluss, vollständiger AVR.DD-Validator und Originaltest, vier CSV-Quellentabellen sowie dieser Beleg (12 Dateien).
Abnahme: Unabhängiger PDF-Zellenabgleich, Originalvertragsfälle, rules:generate, verify:fast und sieben erfolgreiche PR-CI-Prüfungen. Version 15 bleibt außerhalb der unterstützten Katalogverträge.

## Originalerhalt

Der vollständige Validator und alle Originaltestfälle stammen aus dem erhaltenen Gesamtcheckout. Nur Version 15 und die sieben AVR.DD-Definitionen/-Felder werden in das aktuelle Schema aufgenommen. Keine künftigen Tarifverträge werden vorgezogen.
Die allgemeinen TVöD-Wochenzeit-/Stundenformelpflichten und der Überstunden-Pflichtvertrag werden für den gesonderten DRAFT-Vertrag 15 ausgenommen; dessen eigene Regeln prüft der AVR.DD-Validator.

## Frischer Quellenabgleich am 04.10.2026

- AVR.DD Stand 01.01.2026: https://www.arkdd.de/avr/avrdd_20260101.pdf
  SHA256: 6dbe45ec4234ea189da4635521ea2265d359c35666aec0ef2858a499f0561ad7
  Anlage 2, gedruckte Seite 129; Anlage 9, Seite 172: gültig ab 01.03.2025.
- Rundschreiben 11.07.2025: https://www.arkdd.de/rs/rs_20250711.pdf
  SHA256: 9518d677c23229ee33301b44124e394f159382deebf4667ca88e6f1a32f1304c
  Anlage 2, Seite 9; Anlage 9, Seite 10: gültig ab 01.09.2026.
- Die offizielle Fassungsübersicht nennt inzwischen auch die Gesamtfassung 01.09.2026: https://www.arkdd.de/avr.php . Auch diese aktuelle PDF wurde neu geladen (SHA256 a1fcdca0b6dc58c0f9bb1a1a437f5012c476a9a8df8c9d2c1ceace36699b8591). Alle 144 Geldzellen der Tabellen ab September 2026 stimmen unabhängig mit den CSV-Dateien und dem Rundschreiben überein.

Beide Original-PDFs wurden neu geladen; ihre SHA256 stimmen exakt mit den erhaltenen Quellenmetadaten überein.
Alle 288 Geldzellen wurden unabhängig aus den PDF-Texten mit den vier Original-CSV-Dateien abgeglichen: je Stand 53 Monatswerte und 91 Anlage-9-Werte, jeweils 13 Entgeltgruppen. Zusätzlich stimmen alle 80 Laufzeitzellen mit den PDF-Tabellen überein. Fehlende Stufen bleiben fehlend.

## Grenzen

Die Vertragsprüfung gewährleistet Struktur, Herkunftsverweise, Stufenzuordnung, datierte Zulagenzeiträume und die DRAFT-Sperre. Sie ersetzt keine unabhängige Fachprüfung und keine Geräteabnahme.
Die Originalfixture ist synthetisch. Reale Satzdaten, Generator und deren vollständige Referenztests werden als eigenes Paket geliefert.
