# Kalender: schnelle Wischfolgen und Orientierung

> Abgeschlossen: Geräteabnahme und Merge von PR #60 am 10.09.2026.
> Die nachfolgenden Abschnitte dokumentieren frühere Zwischenstände.
> Maßgeblicher abgenommener Endstand: [9C – Ausgangsstand 9B-B](arbeitspaket-9c-tagesaktionen.md#abgeschlossener-ausgangsstand-9b-b).

## Ergänzung nach Geräteprüfung

601196b zeigte leere Seiten bei erneuten Wischgesten vor dem Einrasten. Die
fünf Renderseiten müssen dem sichtbaren Monat bereits in onScroll folgen,
während der fachliche Datenmonat erst beim Einrasten aktualisiert wird.
Regression: mindestens sechs Monate ohne Momentum-Ende, sofort rückwärts,
danach Einrasten sowie Heute während einer unbestätigten Vorschau.

Zusätzlich freigegeben: farbige Dienstmarkierungen in Jahresminiaturen,
Kachelradius 4 und kompakte Abstände wie 626cd1e, weiße Dienst-/Uhrzeittexte
ohne Änderung der Farben und keine Umrandung für Heute oder ausgewählten Tag.
Weiße Schrift auf hellen Flächen unterschreitet bewusst den bisherigen
Kontraststandard; der Nutzer hat dies ausdrücklich verlangt und prüft die
Lesbarkeit selbst. Keine pauschale Barrierefreiheitsfreigabe. Tageszahlen
behalten ihre Markierung, leere Stempelfelder bleiben separate Bedienelemente.
Freigabe bis einschließlich Preview-OTA; Merge weiterhin nach Geräteabnahme.

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
