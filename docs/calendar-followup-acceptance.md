# Kalender: schnelle Wischfolgen und Orientierung

## Scope / Freigabe

Ziel: Direkt aufeinanderfolgende einzelne Monatswischgesten ohne reguläre
Neuzentrierung; abgeschwächte Nachbardatumszahlen; rotes Jahr und tatsächlicher
aktueller Monat in der Jahresübersicht. Zielgerät: iPhone 14 Pro Max, iOS 26.6.1,
installierter interner Preview-Build 31.

Nicht-Ziele: freier Mehrmonats-Schwung, neue Animation, Datenbank-, Gehalts- oder
Feiertagsregeländerungen, native Abhängigkeiten. Nachbardaten dienen der
Orientierung, sind keine zusätzlichen Bearbeitungsflächen und behaupten keine
Feiertagsabdeckung. Luna-Akzent und Dienstfarben bleiben unverändert.

Dateiscope: Kalender-Pager, Canvas/Layout, Header, Szenen-Referenzmonat,
semantisches Farbtoken und zugehörige Tests. Freigabe für Implementierung,
Commit, Push, Preview-OTA und späteren Merge liegt vor. Merge erst nach grüner
CI und gemeinsamer Geräteabnahme.

## Ursache und Lösung

Der Drei-Slot-Pager sperrte nach jedem Monatswechsel die Gesten bis zur nativen
Bestätigung einer Rückpositionierung. Eine 200-ms-Wiederholung konnte diese
Sperre verlängern. Nun besitzen Monate feste Scrollpositionen im bestehenden
Monatsfenster. Nur fünf wiederverwendete Monatskörper plus leere Abstandshalter
werden gerendert. Reguläre Gesten brauchen weder scrollTo noch Bestätigung.
Die mittleren Datumsglyphen bleiben beim Jahreswechsel erhalten. Explizite
Sprünge (Heute/Jahresauswahl), Fenster- und Größenänderungen behalten ihren
Synchronisationsschutz; alte Momentum-Enden dürfen keinen Sprung überschreiben.

## Gemeinsame Geräteabnahme (noch offen)

1. OTA laden, vorhandene Daten bestätigen.
2. Fünf einzelne Wischgesten zügig vorwärts, direkt rückwärts: keine Wartepause,
   leeren Seiten oder falschen Monatsüberschriften.
3. Dezember/Januar und sofortiger Richtungswechsel; Heute während Navigation.
4. Jahresansicht ↔ Januar, September und Dezember, auch 2027: bestehende
   Animation ohne neue Ausblendungen, Sprünge oder verzögerten Inhalt.
5. Abgeschwächte Randdaten an Jahresgrenzen; rote Jahreszahl und aktueller
   Monat nur im tatsächlichen aktuellen Jahr, jeweils hell/dunkel.
6. Neustart: Dienste und Gehalt unverändert.

Automatisierte Tests prüfen Zustandsfolgen und Rendering-Invarianten; echte
Bildrate, native Scrollereignisse und visuelle Abnahme benötigen das Gerät.
