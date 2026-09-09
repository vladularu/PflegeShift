# Phase 3B – Hauptkalender integrieren

## Reparatur nach abgelehnter Geräteabnahme (09.09.2026)

Die erste Integration wurde nicht abgenommen. Video 21:11 zeigt ab etwa 10,4 s
September im Titel mit Januar-Inhalt; Screenshots zeigen den Auswahlrahmen im
Jahr, fehlende September-Inhalte und überlagernde Hinweise.

Freigabe: Reparatur einschließlich Commit, Push, CI, kompatibler Preview-OTA.
Kein Merge, kein nativer Build. Derselbe PR-Branch enthält die Vorstufen.
Scope: calendar-screen, shared-scene, neuer stable-pager, Today-Hook und deren
Regressionstests sowie dieses Dokument (höchstens neun Dateien).

Die nachfolgende ursprüngliche Integrationsbeschreibung wird hinsichtlich der
virtualisierten Liste und der absoluten Hinweisplatzierung ersetzt:

- Genau drei dauerhaft vorhandene ScrollView-Plätze, keine virtualisierte
  Monatsliste, keine wechselnden React-Keys und kein initialScrollIndex.
  Die mittlere Zeichenfläche/Glyphen bleiben auch bei Januar/Heute erhalten.
- Echte Wischbewegungen werden erst am Endpunkt einmal übernommen; danach wird
  mit dem neuen Inhalt synchron im Layout-Effekt zentriert. Programmatische
  Sprünge und Moduswechsel verwerfen noch offene Scroll-Ereignisse.
- Today verwendet eine monotone Navigationsrevision, nicht den unabhängigen
  Request-Zähler als Listenidentität. Monatsname und mittlerer Inhalt werden
  vom selben sichtbaren Monat abgeleitet.
- Auswahl-/Stempelrahmen sind außerhalb der aktiven Monatsansicht unsichtbar.
- Hinweise stehen im Layout vor der Zeichenfläche, nicht über Kalender/Tabs.
  Höhenänderungen starten/beenden keinen zusätzlichen Animationszyklus.
- Echte Szenen-, Monats- und Pager-Komponenten werden gemeinsam getestet, ohne
  die Monatsdarstellung zu ersetzen. Native Scroll-/Frame-Performance bleibt
  Gegenstand der erneuten iPhone-Abnahme, nicht durch Jest bewiesen.

Geräteabnahme: September → Januar → Heute → Jahr; alle zwölf Monate sichtbar,
kein Rahmen im Jahr, Hinweise frei lesbar. Erstmalige Monatswahl und wiederholte
Dezember/Januar-Wischwechsel ohne Ruckler/Versatz. Danach Tagesaktionen,
Schnelleingabe, Hell/Dunkel, reduzierte Bewegung und Daten nach Neustart.

## Vertrag

Phase 3A mit echten Daten wurde vom Nutzer auf Build 31 abgenommen. Freigegeben:
Integration bis einschließlich kompatibler Preview-OTA. Kein Merge, kein neuer
nativer Build. Fortsetzung auf codex/calendar-year-crossfade / PR 60, da die
abgenommenen Vorstufen dort liegen. Expo SDK 57 (~57.0.20), Reanimated 4.5.1:
https://docs.expo.dev/versions/v57.0.0/sdk/reanimated/.

Zielplattform: iPhone 14 Pro Max, vorhandene interne Preview. Scope:
calendar-screen, neuer calendar-shared-scene, deren Tests und diese Dokumentation.
Keine Schema-, Gehalts-, Tarif- oder Native-Änderungen. Kein zweiter schreibbarer
Kalenderzustand und keine Verwendung des read-only Prototyp-Caches im Hauptpfad.

## Integration

- Monat und Jahr verwenden die im Prototyp abgenommenen Koordinaten, Glyphen
  und Eintragsflächen. Der Hauptkalender verwendet keinen CalendarTransitionHost
  und keine Messregistrierung mehr. Das aktive Monatsblatt bleibt bei Wechsel
  zur Jahresansicht bestehen; keine Übergabe zwischen Original und Overlay.
- Die virtualisierte Monatsliste bleibt für vertikales, seitenweises Scrollen
  erhalten. Entfernte Monatssprünge positionieren die Liste direkt am Ziel;
  normale Monat/Jahr-Wechsel am selben Datum und Datenaktualisierungen behalten
  die Liste. Entfernte Sprünge bleiben als zusätzlicher Gerätetest erforderlich.
- „Heute“ springt wie der abgenommene Prototyp direkt ans Ziel. Zwischenmonate
  werden nicht zur Animation durchlaufen. Alte Scroll-Ereignisse werden bis zum
  nächsten echten Drag ignoriert. Die Jahresnavigation positioniert auch die
  unsichtbare Monatsliste auf das neue Ziel.
- Der vorhandene Provider bleibt Quelle für Einträge und Schreibaktionen.
  Wiederholungen werden für das sichtbare Jahr plus Randmonate expandiert,
  nicht mehr für das ganze 61-Monate-Scrollfenster.
- Laden blendet den Kalender nicht aus; ein Hinweis kennzeichnet fehlende Daten.
  Tagesaktionen sind bis zum geladenen Zeitraum gesperrt. Feiertagshinweise
  beeinflussen die gemeinsame Kalendergeometrie nicht.
- Tages-Taps liefern die Position des berührten Feldes direkt. Popup, Editor,
  Schichtauswahl und Schnelleingabe behalten ihre bestehenden Aktionen. Einträge
  aktualisieren sich aus dem Provider ohne eigenen Cache nach Speichern/Löschen.
- Planungsmodus bewegt das ganze Monatsblatt nicht mehr zusätzlich nach oben,
  damit Datum und Jahresziel dieselbe Geometrie behalten.

## Prüfkriterien

### Synchronisationskorrektur nach Gerätevideo vom 09.09.2026

Freigabe: Umsetzung, Commit, Push, CI und kompatible Preview-OTA; kein Build,
kein Merge. Fortsetzung des bestehenden Kalenderbranches in einem isolierten
Checkout, da der Haupt-Checkout inzwischen für Graft verwendet wird.

Der Pager hält beim Zentrieren in allen drei permanenten Slots denselben
Zielmonat. Erst ein natives onScroll-Ereignis am Mittelpunkt gibt Nachbarseiten
und Wischgesten wieder frei. scrollTo allein gilt nicht als Bestätigung. Bei
verzögerter nativer Verarbeitung wird der Zentrierbefehl erneut gesendet; ein
Heute-Sprung ersetzt auch währenddessen das Ziel. Alte Momentum-Endereignisse
dürfen ohne neuen Drag keinen weiteren Monat veröffentlichen.

Der Hinweisbereich reserviert stets die vollständige, mit der Schriftgröße
wachsende Warnungshöhe. Unsichtbarer Platzhalter ohne Accessibility-Inhalt,
darüber entweder Lade- oder Feiertagshinweis: kein zusätzlicher Layoutplatz
beim Wechsel nach Januar, keine Änderung der Feiertagsregeln. Bei verfügbarem
Zeitraum bleibt dieser Platz leer. Keine Änderung der Animationsdauer.

Regressionstests: verzögerte und intermediäre native Offset-Bestätigung,
Oktober darf nicht November zeigen, Rückwärtswechsel, Heute vor Bestätigung,
unveränderte Reservierung bei Monat/Jahr. Native Flüssigkeit bleibt offen bis
zur iPhone-Abnahme (erstes Öffnen, Januar, Dezember, schnelle Wechsel, Heute).

Runtime-Abgleich: EAS bestätigt für die vorherige Reparatur-OTA
`eac302484061dfb3fa63e2a74b8618ff6000861c`. Im separaten Checkout müssen echte
lokale node_modules verwendet werden (keine Junction zum Haupt-Checkout).
Die vom Fingerprint erfasste .gitignore liegt für diesen Windows-Preview-Stand
mit CRLF vor; Git-Inhalt bleibt unverändert. Mit diesen identischen Eingaben
wird exakt derselbe Fingerprint berechnet, ohne Runtime-Override.

Lokal: verify:fast, gezielte Szenen-/Navigationstests, Runtimevergleich.
CI: alle sieben Gates vor OTA. iPhone: Monat/Jahr in beiden Richtungen,
Januar/Dezember, schnelle Monats-/Jahreswechsel, Heute aus entfernten Jahren;
ein vollständiger Anlegen–Bearbeiten–Löschen-Durchlauf sowie Schnelleingabe,
Termine, Hell/Dunkel, reduzierte Bewegung und Daten nach Neustart.

Tests beweisen keinen flüssigen nativen Listenaufbau: Erst diese Geräteabnahme
entscheidet über Phase 3B. Alte Hilfsdateien anderer Ansichten bleiben bestehen;
deren spätere Bereinigung ist keine Voraussetzung für diese Abnahme.
