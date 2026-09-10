# 9C – Tagesaktionen und Schnelleingabe

## Vertrag

Ziel: Plus statt Stift, ruhige lokale Bewegungen, subtile Kalender-Haptik,
kontrastierendes Tages-Popup und Dienstauswahl als natives Bottom-Sheet.
Zielgerät: iPhone 14 Pro Max, iOS 26.6.1, Preview-Build 31.
Freigabe: Umsetzung, lokale Prüfung, Commit, Push, PR, CI und Preview-OTA.
Merge erst nach Geräteabnahme. Keine neue native Abhängigkeit.

Nicht-Ziele: Monats-/Jahresnavigation, Heute-Steuerung, Dienstfarben,
Datenmodell, Gehalt, Prüfregeln und Karten. Keine neue Scroll-Architektur.

## Umsetzung

- Der persistente Schnelleingabe-Knopf zeigt Plus. Die Touchfläche bleibt
  unverändert. Dock und Schließen bewegen sich nur noch 36 Punkte, der
  Auslöser 4 Punkte; Druckskalierung 0,98 statt 0,92. Reduzierte Bewegung bleibt.
- Das Tages-Popup nutzt die gegensätzliche vorhandene Palette für Fläche,
  Texte und Bedienelemente gemeinsam; der Hintergrund behält seine App-Palette.
  Der lokale Ein-/Ausblendweg beträgt 4 statt 8 Punkte.
- Die Dienstauswahl verwendet formSheet mit 85/100 Prozent Höhe und Grabber.
  Ihr Inhalt spielt keine zweite Ein-/Ausgangsanimation und addiert nicht den
  Vollbild-Statusleistenabstand. Während Speichern ist Schließen deaktiviert.
- Planungsstart nutzt Soft statt Medium. Speichern, Entfernen und Fehler in
  der Kalender-Schnelleingabe nutzen Selection statt Notification-Haptik.
  Fehlertexte und Accessibility-Rückmeldungen bleiben erhalten.

## Gemeinsame Geräteabnahme – offen

1. OTA laden, Daten vorhanden.
2. Plus öffnen/schließen, Vorlage wählen und einen Testdienst eintragen.
3. Tages-Popup: dunkel im Hellmodus, hell im Dunkelmodus, Texte lesbar.
4. Schicht hinzufügen: Sheet kommt von unten; Abbruch verändert keine Daten.
5. Erneut öffnen, Dienst speichern, Vorlage bearbeiten und zurückkehren.
6. Große Schrift und reduzierte Bewegung: erreichbare Aktionen, kein Überlagern.
7. Kalender wischen, Jahr/Monat, Heute sowie Dienste/Gehalt nach Neustart.

Automatisierte Tests und Exporte ersetzen keine native Sheet-/Haptik-Abnahme.

## Abgeschlossener Ausgangsstand 9B-B

PR #60 wurde nach Geräteabnahme am 10.09.2026 mit 185a1dc gemergt.
Aktuelle Monatskörper sind nach echtem Monat identifiziert: vier von fünf
bleiben bei einem Wisch erhalten. Jeder Heute-Auftrag setzt die Navigationsrevision
zurück, auch wenn der gespeicherte Monat bereits Heute ist. Kacheln: Radius 2,
horizontaler Innenabstand 1, weiße Namen; dunkle Uhrzeit im Hellmodus und helle
Uhrzeit auf dunklem Farbband im Dunkelmodus. Diese Details ersetzen frühere
Zwischenbeschreibungen; sie sind nicht Gegenstand einer erneuten Gestaltung.
