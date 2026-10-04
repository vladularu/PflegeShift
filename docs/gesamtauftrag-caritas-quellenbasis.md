# Caritas: erhaltene Quellenfunktionen und kompatible Erzeugungsbasis

Stand: 2026-10-04. Sieben-Dateien-Teilpaket des erhaltenen Gesamtauftrags.

## Ziel und Scope

Vier vollständige ursprüngliche Quellenmodule für Bund, regionale Pflegezulage, Zeit-/Überstunden- und Jahresregeln; ein gesonderter Kompatibilitätsdatensatz für die zwölf bereits gelieferten Regionalpakete; zwei unabhängige Quellenfunktionsreferenzen und dieser Beleg. Plattformunabhängige Erzeugungsbasis. Regionale Pakete werden hier noch nicht verändert.

Der Kompatibilitätsdatensatz enthält ausschließlich die bisher gelieferten Quellenmetadaten, datierten Wochenzeitregeln, stabilen Pflegezulagen-IDs sowie bestehenden Zeitzuschlagssätze und Jahresregelstrukturen. Er enthält keine Tabellenwerte. Die ursprünglichen Quellen- und master-Tabellen sowie tatsächlichen Wochenzeiten werden vor Erzeugung des Datensatzes für alle zwölf Pakete exakt verglichen. Der folgende Generator muss weiterhin jeden Tabellenwert aus der ursprünglichen CSV berechnen und darf den Kompatibilitätsdatensatz nur für die ausdrücklich erhaltenen Strukturen verwenden.

## Abnahme

Die drei erzeugten 2026-Policies werden gegen die bereits erhaltene unabhängige Datenfixture verglichen. Alle drei ungeprüften 2027-Verlängerungen werden ausdrücklich abgewiesen. Pflichtcheck verify:fast und sieben grüne CI-Prüfungen vor Merge. Die drei aktuellen Primär-PDFs und SHA-256-Nachweise sind im Policy-Vertragsbeleg dokumentiert. Erhaltene historische Quellenmetadaten werden nicht als neue Fachprüfung ausgegeben.

## Grenzen

DRAFT und UNSUPPORTED bleiben verbindlich. Dieses Paket erzeugt keinen Katalog, aktiviert kein App-Gehalt und veröffentlicht keine OTA. West/Ost-Erzeugung, ursprüngliche vollständige Regionaltests und persönliche Monatsanschlüsse folgen als getrennte Teilpakete. Der Jahreswechsel 2027, Fachfreigabe und Geräteabnahme bleiben offen.
