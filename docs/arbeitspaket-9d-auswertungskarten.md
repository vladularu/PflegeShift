# 9D – Ruhige Auswertungskarten

## Ergänzung: Tab-Wechsel (freigegeben bis Preview-OTA)

Ziel: Nach einem Monatswechsel in Auswertung zeigt Kalender sofort den passenden
Monat. Prüfung und Gehalt sind nach Verlassen und Rückkehr geschlossen.

Der Kalender abonniert externe Monatsänderungen im Hintergrund und positioniert
seinen bestehenden Pager vor der Rückkehr. Nur der Kalender-Tab wird dafür nicht
eingefroren; die übrigen Tabs behalten ihre bisherige Einstellung. Eigene
Kalendergesten bleiben führend, ohne neue Animation oder Pager-Neumontage.
Die Auswertung setzt beim Fokusverlust ausschließlich den Aufklappzustand zurück.

Zusätzlicher Scope: CalendarScreen, AnalysisScreen, AppTabs und Regressionstests.
Nicht-Ziele: Daten, Berechnungen, native Abhängigkeiten, Kalendergestaltung,
Heute-Rücksprung und Jahreszoom. Plattform und Freigabegrenzen bleiben wie unten.

Gemeinsame Geräteabnahme nach OTA:

1. In Auswertung mehrere Monate wechseln, dann Kalender öffnen: kein alter Monat.
2. Prüfung öffnen, Kalender besuchen und Monat wechseln, Auswertung öffnen:
   neue Daten, geschlossene Karten. Mit Gehalt wiederholen.
3. Kalender schnell scrollen, Heute-Rücksprung und Jahreszoom kurz gegenprüfen.

## Vertrag

Ziel: Prüfung und Gehalt ohne überlappende Kacheln öffnen, schließen und wechseln,
auch bei schnellem wiederholtem Tippen.
Zielgerät: iPhone 14 Pro Max, iOS 26.6.1, interner Preview-Build 31.
Freigabe: Umsetzung, lokale Tests, Commit, Push, PR, CI und Preview-OTA.
Merge erst nach Geräteabnahme.

Nicht-Ziele: Kalender, globale Motion-Tokens, Farben, Datenhaltung, Gehalts- und
Prüfberechnungen, Kartenintegration sowie Ladezeit der Jahresauswertung.

## Befund und Lösung

Der bisherige äußere LinearTransition und die separaten Eintritts-/Austritts-
Animationen der Details liefen unabhängig. Der Endzustand des Layouts und die
noch sichtbaren Übergangsansichten konnten deshalb auseinanderliegen.

Jetzt gibt es nur einen animierten Detailbereich mit tatsächlicher Layout-Höhe.
Sein Inhalt wird unabhängig von der sichtbaren Höhe gemessen und bleibt montiert.
Der Bereich schneidet überstehenden Inhalt ab; folgende Karten werden durch
dasselbe Layout verschoben, nicht durch eigene Layout-Animationen.
Neue Tippeingaben ändern das Ziel der laufenden Höhenanimation ohne Warteschlange
oder zeitgesteuertes Unmount. Breiten-, Schrift- und Inhaltsänderungen liefern
eine neue gemessene Höhe. Reduzierte Bewegung folgt der Systemeinstellung.
Geschlossene Details sind für Touch und Screenreader gesperrt.

Scope: AnalysisCardDetails, ExpandableHighlightCard, fokussierte Komponententests
und dieses Dokument. Keine neue Abhängigkeit und keine native Änderung.

## Geräteabnahme – offen

1. OTA laden, Daten vorhanden.
2. Prüfung öffnen/schließen, Gehalt öffnen/schließen.
3. Mindestens zehn schnelle Wechsel; keine Überlappung, kein Flackern,
   kein hängen gebliebener Zwischenstand.
4. Bei gescrollter Auswertung wechseln; kein zusätzlicher programmatischer
   Scrollsprung (am Inhaltsende bleibt die natürliche Scrollbegrenzung).
5. Hell/Dunkel sowie große Schrift: Inhalte vollständig lesbar und erreichbar.
6. Reduzierte Bewegung: keine ausgedehnte Höhenanimation.
7. Beträge und Prüfhinweise unverändert; Detailaktionen und Rückkehr funktionieren.

Automatisierte Tests prüfen Zustände und Animationseigenschaften, nicht die
native Framerate. Erst der Gerätenachweis bestätigt die sichtbare Flüssigkeit.
