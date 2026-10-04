# DRK-Tabellen-Grundbeträge (VG-09)

## Task-Vertrag

- Ziel: drei Ausbildungs-DRAFTs mit ihrem vollständigen ursprünglichen Vertragsreferenztest und die getrennten DRK-Grundbeträge für Mitarbeiter und Ausbildung erhalten.
- Nicht-Ziele: vollständiges Brutto, Zulagen, Zuschläge, Teilmonate, Bereitschaft, automatische Anspruchsermittlung, Tarifaktivierung und OTA.
- Plattform: gemeinsame TypeScript-Fachlogik; keine native oder sichtbare UI-Änderung.
- Scope: exakt neun Dateien (drei Ausbildungspakete, Vertragsreferenztest, zwei Rechner samt ursprünglichen Tests und dieser Beleg).
- Abnahme: alle ursprünglichen Referenzfälle; Monats- und Stufengrenzen; explizite Anwendbarkeit, Anlagen-/Kategoriezuordnung und persönlicher Vollmonatsanspruch; keine Promotion von DRAFT; verify:fast und sieben grüne CI-Prüfungen.

## Quellen und Berechnungsgrenzen

Die Ausbildungspakete enthalten die 24 unabhängig aus dem aktuellen offiziellen PDF bestätigten Beträge. Mitarbeiter benutzen ausschließlich den bestätigten Vollzeit-Tabellenwert und das bestätigte Verhältnis individueller zur vergleichbaren Vollzeit-Wochenzeit. Beide Rechner geben ausdrücklich completeGross: false zurück. Die Ausbildungskomponente verlangt volle Monate und Vollzeitausbildung; Teilzeit und Teilmonate bleiben nicht verfügbar.

Quelle: [DRK-Bundestarifgemeinschaft, RTV Stand 52. Änderung](https://btg.drk.de/fileadmin/user_upload/Bundestarifgemeinschaft/05_grundlagen_news/DRK-RTV_idF_52.AETV_14.AETV-TVUE_durchgeschriebene_Fassung.pdf), § 29 sowie Anlagen 3/3a. Dokumenthash, Tabellenstände und konkrete Quellenreferenzen bleiben erhalten. Profil- und Speicheradapter folgen separat.
