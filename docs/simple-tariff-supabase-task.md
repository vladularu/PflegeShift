# Neue Tariftafeln im Supabase-Preview-Katalog

## Auftrag und Abnahme

Der Nutzer hat die zentrale Hinterlegung und Nutzung gepruefter Tabellenaktualisierungen in der App beauftragt. Quelle der ersten Lieferung ist der bereits auf dem iPhone abgenommene einfache Tarifstand `22aebac2b20d8dc6bde471f59e0827adea30541c` (Expo ~57.0.22, SDK-57-Dokumentation geprueft).

Ziel: TVoed VKA E, TV-L KR, TV-H KR, TV-UK Pflege, TVAoed Pflege und TVA-L Pflege als signierte, datierte Tabellen. Die App verwendet diese nach erfolgreicher Katalogpruefung und speichert sie im bestehenden Offline-Katalog. Ohne Download bleiben die vorhandenen Tabellen nutzbar.

Plattform: interne iOS Preview, installiertes Build 32. Die vorhandenen Gehaltsansichten und Einstellungen sind verbindlich. Fachregeln und Zulagen werden durch einen Tabellen-Download nicht geaendert. Keine Production- oder Store-Veroeffentlichung.

## Getrennte Pakete

A. Katalogvertrag 19: optionaler, streng validierter Tabellenbestand im bestehenden TVoed-P-Katalogpaket. Vorhandene P-Regeln bleiben erhalten. Keine Freischaltung der verworfenen historischen DRAFT-Flows oder der Vertraege 12/13/16. Scope: zwei Schemas, zwei generierte Dateien, Engineunterstuetzung, semantische Validierung, Tabellenvalidator/Layout, reproduzierbarer Generator, Quellenpaket, Veroeffentlichungsanfrage, Tests und dieser Vertrag (hoechstens 15 Dateien). Eigener Branch von master.

B. App-Anbindung auf dem abgenommenen UI-Stand: Resolver liefert den verifizierten Tabellenbestand; sechs bestehende Rechenadapter verwenden ihn fuer Grundentgelt und die daraus abgeleiteten Stundenbetraege. Offline-Rueckfall, historische Gueltigkeit, Teilzeit, Stufen, Jahresansicht und Cachewechsel werden geprueft. Keine neuen Eingaben oder Untermenues. Eigenes Folgepaket.

C. Lieferung: signierter Prepare/Dry-run, sieben gruene CI-Pruefungen, runtimekompatible Preview-OTA mit Katalogvertrag 19, iPhone-Abnahme, danach Supabase-Aktivierung und oeffentliche Ruecklesepruefung. Alte installierte Clients duerfen unbekannten Vertrag 19 ablehnen und ihren zuletzt gueltigen Offline-Stand erhalten.

Akzeptanz: dieselben Betraege vor und nach dem ersten Download; neue Datumsperioden nur aus geprueften Quellen; unvollstaendige, doppelte oder ueberlappende Tabellen werden abgelehnt; fehlerhafte Signatur und Netzwerkfehler ersetzen den aktiven Katalog nicht; keine Netzwerkanfrage im Gehalts-Rechenkern. Commit, Push, PR und interne Preview-Lieferung sind durch die bestehende Freigabe und den aktuellen Auftrag autorisiert. Der Supabase-Schreibschritt benoetigt technisch den dedizierten Operator-Schluessel; er wird nicht in die App oder das Repository aufgenommen.

## Paket A: lokaler Nachweis

Sechs Tarifarten, 21 datierte Tafeln und 998 Werte aus dem abgenommenen Quellcommit. Die vorhandenen P-Regeln und die sichtbare Paketbezeichnung bleiben exakt erhalten. Der Vertrag ergaenzt lediglich den Tabellenbestand. 76 gezielte Tests, verify:fast (7.286 Unit-, 562 Komponententests) und Produktions-Audit sind gruen. source-map-js wird im getrennten Ein-Datei-PR #282 korrigiert. Supabase ist noch nicht beschrieben worden.
