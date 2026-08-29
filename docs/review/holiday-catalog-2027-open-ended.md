# Feiertagskatalog ab 2027 – Prüfdossier

## Ziel

`de-holidays/2027` beschreibt wiederkehrende gesetzliche Feiertage als Regeln und nicht als
Jahresliste. Der Stand beginnt am 1. Januar 2027 und hat kein vorab festgelegtes Enddatum. Das
bedeutet „gültig bis zur Ablösung durch einen geprüften neueren Regelstand“, nicht „Gesetze können
sich nie ändern“.

## Berechnungsumfang

- feste Monats- und Tageswerte, zum Beispiel Neujahr und Weihnachten;
- bewegliche Feiertage als Abstand zum Ostersonntag;
- Buß- und Bettag als berechneter Mittwoch vor dem 23. November;
- landesweite und ausgewählte regionale Zuordnungen aus dem bereits geprüften 2026-Regelstand.

Ein einmaliges Datum (`SPECIFIC_DATE`) darf weiterhin nur innerhalb seines ausdrücklich geprüften
Zeitraums gelten. Der offene Regelzeitraum ist deshalb erst ab Holiday Engine Contract 7 erlaubt.
Ältere App-Versionen lehnen einen solchen Katalogstand ab, statt Feiertage stillschweigend falsch
zu behandeln.

## Änderung eines Feiertagsgesetzes

Veröffentlichte Paketobjekte bleiben unveränderlich. Bei einer Gesetzesänderung wird daher eine
neue Paketversion mit neuem Pfad erstellt. Diese enthält die bis zum Stichtag geltenden Regeln mit
geschlossenem Enddatum und die neuen Regeln ab ihrem Wirksamkeitsdatum. Eine neue signierte
Kataloggeneration ersetzt den bisherigen offenen Snapshot atomar; beide überlappenden Snapshots
werden nie gemeinsam in demselben Resolver aktiviert. Bereits veröffentlichte Dateien werden nicht
überschrieben.

## Technische Abnahme vor Promotion

- Übergang `2026-12-31` auf `2027-01-01` ist eindeutig.
- Feste, Oster-basierte und regionale Feiertage werden für 2027 berechnet.
- Dieselben Regeltypen werden ohne Jahrespaket für 2035 berechnet.
- Feiertags-Caches sind je Resolvergeneration isoliert.
- Das veröffentlichte Generation-1-Eingabepaket bleibt byte-identisch.
- Ein offenes Regelende vor Engine Contract 7 wird abgelehnt.

## Status

Der Inhalt liegt bis zu seinem ersten Commit auf `DRAFT`. Danach folgt die Solo-Owner-Prüfung
gegen genau diesen Inhalts-Commit. Erst die getrennte Promotion auf `REVIEWED` erlaubt Aufnahme in
eine signierte Kataloggeneration.
