# TV-L/KR – datierter Monatskern

Stand: 2026-10-04. Expo ~57.0.22; Referenz: https://docs.expo.dev/versions/v57.0.0/.

## Ziel und Scope

Zwölf Dateien verbinden die bereits versionierten TV-L/KR-Pakete (Vertrag 12) mit der datierten Monatsberechnung: eigener Kontext, Zeitzuschläge und ausschließlich bestätigte auszahlbare Überstunden. Windows-Prüfung; vorhandene iOS-App-Schnittstelle ohne native oder visuelle Änderung.

Die unveränderten ursprünglichen positiven Monats- und Zeitzuschlagsfälle werden übernommen. Vollzeitbasis, Tabellenwechsel und Beschäftigtenkategorie stammen aus dem datierten Paket und Profil. Schichtarbeit am Samstag benötigt eine aktuelle ausdrückliche Bestätigung. Dienstart und Dienstname begründen keinen Anspruch.

## Abnahme

- Identität, KR-Gruppe und Stufe sowie Datum müssen exakt zur Quelle passen.
- Teilzeit, kalendertägliche Abgrenzung und Vollzeitänderung im selben Paket werden korrekt getrennt.
- Überstunden verwenden die Vollzeitbasis, tarifliche Stufenkappung und Zuschlagsreferenz.
- Nacht und Kalenderzuschlag folgen Quellenpolitik; Rundung erfolgt je zusammengehörigem Baustein.
- Fehlende Pflege-/Schichtzulagen bleiben sichtbar unverfügbar; daher kein vollständiges Monatsbrutto.
- Ursprüngliche fokussierte Tests und verify:fast müssen bestehen, anschließend sieben grüne PR-CI-Prüfungen.

## Quellenprüfung

Am 04.10.2026 erneut von der TdL geladen und mit den Katalogbelegen hashgleich:

- TV-L, ÄTV 14: https://www.tdl-online.de/fileadmin/downloads/TV-L/260812_TV-L__i.d.F._des_%C3%84TV_Nr._14_VT.pdf
  SHA-256: 05de64ee356df189690875a491e5d52d8ac8171328b43f7fd401d8b0c04f94f9.
- Anlage C, 01.04.2026–28.02.2027: https://www.tdl-online.de/fileadmin/downloads/TV-L/TV-L_Anlagen/Entgelttabelle_f%C3%BCr_Pflegekr%C3%A4fte__Anlage_C___g%C3%BCltig_vom_01.04.2026_bis_28.02.2027.pdf
  SHA-256: 8f35594396b5e27cc27726b2516e7ee6900d8eafb88d1a99cec0a575803353e1.

## Verbleibende Grenzen

Pflege-/Funktions-/Schichtzulagen, Jahreszusammenstellung und persönliche Eingabeoberflächen folgen in eigenen Paketen. Die vollständigen ursprünglichen Überstunden-Referenztests bleiben im erhaltenen Gesamtcheckout und werden zusammen mit ihrer Jahres-/Eingabeabhängigkeit geliefert. Keine DRAFT-Freigabe, OTA oder Produktionsveröffentlichung durch dieses Paket.
