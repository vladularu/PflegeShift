# Arbeitspaket 9B-B – Jahresanzeige und Ansichtswechsel

> Statusabgleich 12.09.2026: Paket abgenommen und über [PR #60](https://github.com/vladularu/PflegeShift/pull/60) integriert. Aktueller Status und verbleibende Prüfpunkte stehen in der [zentralen Roadmap](roadmap.md). Die folgenden Freigaben, offenen Abnahmen und Implementierungsbeschreibungen dokumentieren den damaligen Arbeitsstand; sie sind keine neuen Aufträge und kein Beleg für den heutigen Code. Fachliche Grenzen bleiben maßgeblich, soweit spätere Pakete sie nicht ausdrücklich ersetzen.

Ziel: Der Wechsel zwischen Monats- und Jahresansicht wirkt ruhig und die Orientierung
bleibt außerhalb des aktuellen Jahres eindeutig. Zielgerät ist ein iPhone 14 Pro Max
mit iOS 26.6.1 und dem installierten Preview-Build 31.

## Umsetzung

- Referenz ist das 3,57 Sekunden lange iOS-Kalender-Video vom 6. September 2026:
  September → Jahresübersicht → September. Die ausgewählten Tageszahlen bewegen sich
  zwischen tatsächlicher Mini-Monatsposition und großem Monatsraster; Wochenabstände
  und Schriftgröße verändern sich unabhängig voneinander. Die Referenz wurde in
  100-ms-Zwischenbildern geprüft. Die eingestellten 600 ms sind eine Annäherung an
  den beobachteten Verlauf, keine ermittelte interne Apple-Animationskonstante.
- Beide Kalenderansichten bleiben montiert. Vor dem Übergang werden der Mini-Monat,
  die Nachbarmonate und die Zielpositionen der Tageszahlen nativ im gemeinsamen
  Fensterkoordinatensystem gemessen. Zwei übereinstimmende Messungen warten laufende
  Scroll-/Layoutanpassungen ab. Fehlende Messwerte überspringen die Animation nach
  spätestens 900 ms; der Zielkalender bleibt dann direkt bedienbar.
- Ein gemeinsamer UI-Thread-Fortschritt steuert die einzelnen Tageszahlen und ihre
  Heute-Markierung. Die echten Nachbarmonate bewegen sich mit ihren Beschriftungen
  aus dem Bild bzw. zurück. Nur kleine Monatselemente werden skaliert; die vollständigen
  Kalenderlisten erhalten keine Skalierung. Der große Kalender blendet im letzten
  Teil des Hineinzoomens ein. Seine Dienste, Termine und Wochentage bleiben unverändert.
- Abschluss, Richtungswechsel, Tab-Verlassen, Hintergrundwechsel und Größenänderung
  setzen den Zustand zurück. Übergangsgrafiken verschwinden nach Abschluss und sind
  für Screenreader verborgen. Veraltete Mess- und Animationsantworten werden verworfen.
- Monats- und Jahresansicht verwenden eine durchgehende, kartenlose Kalenderfläche.
  Wochenzahlen und flächige Wochenendbänder entfallen. Die Jahresansicht zeigt zwölf
  kompakte Mini-Monate in einem 3-mal-4-Raster mit ausgeschriebenen Monatsnamen.
- Überschrift und Bedienelemente im Kalenderkopf wechseln ebenfalls per Crossfade. Die
  bestehende Richtungsgeste für Monats- und Jahresnavigation bleibt erhalten.
- Im aktuellen Jahr zeigt die Monatsansicht weiterhin nur den Monatsnamen. In jedem
  anderen Jahr enthält die Überschrift zusätzlich immer die vierstellige Jahreszahl.
- Eine Jahresübersicht bleibt sichtbar, wenn das Zieljahr vollständig im vorhandenen
  Kalenderdatenfenster liegt, während das umgebende Fenster im Hintergrund nachlädt.
- Alle Übergänge verwenden die zentralen LUNA-Motion-Tokens und respektieren die
  Systemeinstellung „Bewegung reduzieren“.

## Abgrenzung

### Abschlusskorrektur nach Gerätevideo vom 6. September, 06:36 Uhr

Die positionsbasierte OTA zu Commit `9986f7f` wurde auf dem Gerät geprüft:
Monat → Jahr passt laut Nutzer; Jahr → Monat zeigt zum Ende einen Sprung.
Die Aufnahme zeigt bewegte Tageszahlen und vergrößerte Jahres-Monatsnamen
gleichzeitig mit dem bereits sichtbaren fertigen Monatsraster.

Nur Jahr → Monat erhält deshalb getrennte Phasen innerhalb der bisherigen 600 ms:
450 ms Bewegung mit ruhiger Zielannäherung, danach 150 ms Überblendung bei bereits
erreichten Zielpositionen und Schriftgrößen. Die Jahresszene ist vor Beginn dieser
Überblendung unsichtbar. Monat → Jahr behält die bisherigen Kurven und Formeln.
Dateiscope: Übergangscontainer, neue Phasenhilfe mit Tests und dieses Dokument;
bei Bedarf zugehörige Komponententests. Keine nativen oder fachlichen Änderungen.
Die Phasenhilfe läuft ausdrücklich als Worklet auf dem UI-Thread.

Abnahme dieser Korrektur: Januar, September und Dezember aus der Jahresübersicht
öffnen, ohne doppelte Zahlen, sichtbare Jahresreste oder Abschlusssprung; in Hell
und Dunkel testen. Gegenrichtung, Abbruch und „Bewegung reduzieren“ dürfen nicht
regressieren. Lokale Tests ersetzen diese noch ausstehende Geräteabnahme nicht.

Lokale Prüfung der Abschlusskorrektur: `verify:fast` erfolgreich (95 Vitest-Dateien,
588 Tests; 54 Jest-Suites, 216 Tests sowie zusätzliche Skriptprüfungen). Fokussierte
Phasen-/Geometrietests und Übergangs-Komponententests bestanden. Interner iOS-Hermes-
Export erfolgreich; Worklet-Transformation der neuen Phasenhilfe mit dem SDK-57-
Expo-Preset geprüft. iOS-Fingerprint weiterhin
`eac302484061dfb3fa63e2a74b8618ff6000861c` (Build 31). Kein Commit, Push oder OTA
für diese Abschlusskorrektur erfolgt; Geräteabnahme ausstehend.

### Pausenkorrektur nach Gerätefeedback zur OTA `aae44707-81f9-41cf-a865-a46589d8cd03`

Nutzer bestätigt erhaltene Daten, meldet aber eine Pause zwischen Kalender und
Dienstanzeige. Die vorangegangene Trennung des gesamten Monatsinhalts war zu strikt.
Jetzt blenden Raster und Einträge zwischen 150 und 390 ms während der noch laufenden
450-ms-Bewegung ein. Nur die echten Tageszahlen im gewählten Monat bleiben bis zur
positionsgleichen Übergabe verborgen (450–600 ms). Jahresreste sind vor Beginn der
Inhaltsüberblendung ausgeblendet. Die Gegenrichtung bleibt unverändert.

Scope: Phasenhilfe, Animationskontext/-container, Tageszahlen in `month-card.tsx`,
Tests und dieses Dokument. Abnahme: Dienste erscheinen ohne nachgelagerte Pause;
keine versetzten Doppelzahlen oder Jahresreste, Hell/Dunkel, Januar/September/Dezember,
Gegenrichtung und Neustart mit erhaltenen Daten. Nutzerfreigabe umfasst Umsetzung,
Commit, Push, CI und Preview-OTA, nicht Merge oder Geräteabnahme.

Lokaler finaler Stand: `verify:fast` bestanden (588 Vitest-Tests, 220 Jest-Tests
und zusätzliche Skriptprüfungen), iOS-Hermes-Export und Worklet-Transformation
bestanden. Die Dateigrößen-Grenze bleibt unverändert. iOS-Fingerprint weiterhin
`eac302484061dfb3fa63e2a74b8618ff6000861c`; Geräteabnahme der Pausenkorrektur offen.

### Unveränderter Gesamtscope

### Flackerkorrektur nach Gerätevideo vom 6. September, 07:12 Uhr

Die Pausenkorrektur `1b9b734` / OTA `bb957a8a-972d-443e-b1c6-80f332a4046b`
verbessert laut Nutzer den Verlauf, zeigt aber Flackern am Ende. Die Aufnahme zeigt
einen Helligkeitswechsel der Tageszahlen/Heute-Markierung bei stehendem Dienstraster.
Die bisher komplementären Ebenendeckkräfte summieren sich zwar zu 1, ergeben beim
Source-over-Compositing jedoch in der Mitte nur 0,75 effektive Deckkraft.

Korrektur nur der Zahlenübergabe: Animierte Ebene bleibt vollständig deckend, bis
die echte Zahlenebene volle Deckkraft erreicht; erst danach blendet das Overlay aus.
Die 600-ms-Gesamtdauer, Bewegung, Inhalts-/Jahresausblendung und Gegenrichtung bleiben
unverändert. Scope: Phasenhilfe, Phasentest, Monatsraster-Komponententest und dieses
Dokument. Freigabe umfasst Commit, Push, CI und Preview-OTA, nicht Merge.

Abnahme auf iPhone 14 Pro Max / iOS 26.6.1 / Build 31: Jahresansicht → Januar,
September, Dezember ohne Helligkeitseinbruch oder Flackern, Dienste ohne Pause;
Hell/Dunkel, Gegenrichtung und erhaltene Daten nach Neustart. Tests prüfen die
Deckkraftrechnung, nicht das reale iOS-Compositing; Geräteabnahme bleibt offen.

Lokale Prüfung: `verify:fast` bestanden (589 Vitest-Tests, 220 Jest-Tests und
Skriptprüfungen), gezielte Übergangstests, Worklet-Transformation und iOS-Hermes-
Export bestanden. iOS-Fingerprint unverändert:
`eac302484061dfb3fa63e2a74b8618ff6000861c`.

### Unveränderte Bereiche

### Januar-Korrektur nach Gerätevideo vom 6. September, 07:30 Uhr

Nutzer bestätigt September und Dezember nach `f0b3f1f`, Januar bleibt fehlerhaft.
Die Aufnahme zeigt einen zusätzlichen Layoutwechsel durch den Feiertagshinweis
beim Öffnen und Schließen der Monatsansicht. Der Hinweis stand außerhalb des
Animationshosts und wurde nur im Monatsmodus aufgelöst. Dadurch änderten sich
Host-Höhe und Pager-Geometrie beim Moduswechsel.

Der Hinweis liegt jetzt innerhalb der montiert bleibenden Monatsansicht, vor dem
Pager. Die Feiertagsauflösung hängt nicht mehr vom Ansichtsmodus ab. Die Pagerhöhe
wird unterhalb des Hinweises gemessen; die Jahresansicht behält die volle Fläche.
Hinweis und Pager bleiben beim Hin-/Zurückwechseln montiert und unverändert groß.
Die Warnung bleibt in der Monatsansicht sichtbar und wird in der Jahresansicht
mit der gesamten Monatsszene visuell und für Screenreader verborgen.

Scope: Kalenderbildschirm, Bildschirmtests, Dokumentation. Keine Tarif-/Feiertags-
Regeländerung, keine Animationskurvenänderung, keine native Änderung. Freigabe umfasst
lokale Umsetzung, Commit, Push, CI und Preview-OTA. Abnahme auf Build 31/iPhone 14 Pro
Max/iOS 26.6.1: Januar hin und zurück ohne Layoutsprung oder ausgeblendete Monate,
Hinweis korrekt sichtbar, September/Dezember weiterhin ruhig, Hell/Dunkel und Daten
nach Neustart unverändert. Native Geometrie bleibt auf dem Gerät zu bestätigen.

Lokaler finaler Stand: `verify:fast`, die gezielten Bildschirmtests sowie der
iOS-Hermes-Export sind bestanden. iOS-Fingerprint unverändert:
`eac302484061dfb3fa63e2a74b8618ff6000861c`. Geräteabnahme der Januar-Korrektur offen.

### Synchronisierung nach Geräteaufnahme 07:46

Die Aufnahme nach `80f6ded` zeigt einen vorauseilenden Monatskopf und einen
verzögerten Zoomstart. Die vorige Januar-Korrektur ist damit nicht abgenommen.
Ziel dieser freigegebenen Korrektur: stabiler Zielmonat und gemeinsamer Start von
Kalenderkopf und Zoom, ohne eine neue native Build-Version.

Beim Auswählen eines Monats startet der versteckte Pager direkt am Zielindex;
er muss nicht mehr von seinem alten Monat dorthin scrollen und dabei auf
virtualisierte Zellen warten. Nur dieser versteckte Pager wird bei der Auswahl
neu montiert, nicht der Ansichtscontainer oder die Jahresansicht. Die bisherigen
Geometrieprüfungen bleiben bestehen; der Timeout wurde nicht einfach verkürzt.
Scroll-Ereignisse aus der Jahresansicht, während des Übergangs und verspätete
programmatische Ereignisse nach einer Monatsauswahl werden ignoriert. Ein echter
Drag bzw. ein Heute-Auftrag gibt das Paging wieder frei. Der Kalenderkopf erhält
den neuen Ansichtsmodus erst beim Animationsstart oder beim sicheren Abschluss
ohne Messung. Hintergrund-/Abbruchpfade lösen die Übergangssperre ebenfalls.

Dateiscope: Kalenderbildschirm, Übergangscontainer, extrahierter Paging-Hook,
zugehörige Komponententests und dieses Dokument (sechs Dateien). Keine Änderung
an Animationskurven, Daten, Regeln, Farben, Abhängigkeiten oder nativer Integration.
Freigegeben: Umsetzung, Commit, Push, CI und Preview-OTA; kein Merge.
Zielgerät: iPhone 14 Pro Max / iOS 26.6.1 / Preview Build 31.

Regressionstests prüfen Januar als direkten Startmonat, ignorierte alte und
versteckte Scroll-Ereignisse, Weiterblättern nach echtem Drag und den verzögerten
Start des Kopfwechsels bis zur vorbereiteten Animation. Bestehende Tests für
Heute, Dezember/Januar, Hinweisgeometrie und Animationsabbruch bleiben erhalten.
Geräteabnahme offen: Januar und Dezember jeweils hin/zurück, keine vorgelagerte
Pause oder falscher Monat, kein Abschlussflackern; danach Heute und Daten nach
Neustart prüfen. Tests liefern keinen Nachweis der tatsächlichen iPhone-Bildrate.

### Weiterhin unveränderte Bereiche

Betroffen sind Kalenderkopf, Ansichtscontainer, Monatsraster, Jahresraster,
Mess-/Geometriehilfen, Mini-Kalendermaße, Datenabdeckungsprüfung, zugehörige Tests
und dieses Dokument. Unverändert bleiben
Datenbankschema, Tarif- und Gehaltslogik, LUNA-Dienstfarben, Schnelleingabe,
Tages-Popup, Abhängigkeiten sowie native Konfiguration. Arbeitspaket 9B-A bleibt
unverändert.

## Abnahme

1. Aktuelles Jahr: Im Monatskopf steht nur der Monatsname. Fremdes Jahr: Monatsname
   und Jahr sind stets sichtbar.
2. Monatsansicht öffnen, Jahresansicht öffnen und einen Monat auswählen: Die Ansicht
   zoomt sichtbar aus dem gewählten Mini-Monat beziehungsweise dorthin zurück, ohne
   Sprung oder Überlappung.
3. Monats- und Jahresansicht wirken im Hell- und Dunkelmodus wie eine ruhige,
   durchgehende Kalenderfläche; Dienste, Termine und Feiertage bleiben erkennbar.
4. In der Jahresansicht vor- und zurückblättern: Bereits verfügbare Zieljahre bleiben
   ohne vollständiges Ladebild sichtbar und zeigen korrekte Dienste und Termine.
5. Schritte 1 bis 4 im Hell- und Dunkelmodus wiederholen. Mit aktivierter Einstellung
   „Bewegung reduzieren“ entstehen keine Verschiebungen oder Skalierungen.
6. App neu starten; Dienste und Gehalt bleiben vorhanden.
7. Januar, September und Dezember jeweils öffnen und zurückgehen: Alle zwölf Monate
   bleiben nach Abschluss vollständig sichtbar. Auch nach Scrollen der Jahresansicht
   beginnt bzw. endet die Bewegung am tatsächlich ausgewählten Mini-Monat.
8. Schnell hin und zurück wechseln; während des Übergangs den Tab wechseln und die
   App in den Hintergrund schicken: keine dunklen Monate, kein zurückbleibendes
   Overlay und keine blockierte Bedienung.

Status: lokale Umsetzung; der visuelle Vergleich und die Bildrate auf dem Zielgerät
sind noch nicht abgenommen. Die Ursache der vorherigen iOS-Abdunklung ist nicht durch
ein natives Profiling nachgewiesen. Tests sichern Geometrie und Lebenszyklus, ersetzen
aber den Gerätevergleich mit dem Referenzvideo nicht.

Lokale Synchronisierungsprüfung: `verify:fast` bestanden (589 Unit-Tests,
224 Komponententests und Skriptprüfungen); iOS-Hermes-Export erfolgreich.
Der interne iOS-Fingerprint ist weiterhin
`eac302484061dfb3fa63e2a74b8618ff6000861c`. Geräteabnahme bleibt offen.

Die Änderung ist JavaScript/UI-only. Nach Commit, Push und grüner Pull-Request-CI ist
eine separat freizugebende Preview-OTA für Build 31 vorgesehen; ein neuer EAS-Build
ist nicht erforderlich, solange der Runtime-Fingerprint unverändert bleibt.
