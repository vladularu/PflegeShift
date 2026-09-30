# LUNA Shift: UI-Referenz

Stand: 30. September 2026. Grundlage sind die vom Nutzer bereitgestellten SuperShift-Screenshots der Auswertung in Hell und Dunkel sowie des Kalenders und das blaue Farbmuster. Die Screenshots dienen als visuelle Referenz; ihre Grafiken werden nicht als App-Assets übernommen.

## Farben

- Standard · Hell: Aktionsblau `#0088FF` mit dunkler Beschriftung; kleine blaue Schrift nutzt die kontraststarke Variante `#0065BE`. Kalenderhintergrund weiß; „Heute“ und der Schnellbutton sind in der Monatsansicht schwarz `#0D0D0D` mit weißem Inhalt. In der Jahresansicht ist die „Heute“-Markierung blau.
- Standard · Dunkel: Aktionsgelb `#FFE637` mit dunkler Beschriftung. „Heute“ und der Schnellbutton bleiben gelb, damit sie auf schwarzem Hintergrund sichtbar sind.
- Auswertung: heller Hintergrund `#F3F2F8`, weiße Karten und hell abgesetzte Köpfe. Dunkler Hintergrund `#030303`, Karten `#262628`. Feine Kartentrennlinien sind hell `#E5E5E5` und dunkel `#111113`.
- Schichtfarben bleiben semantisch und ändern sich mit dem allgemeinen Aktionsakzent nicht.

## Karten und Schrift

- iOS-Systemschrift; Bildschirmtitel 34 pt, Kartentitel 17 pt, Zeilentext und Werte 16 pt. Kartentitel sind linksbündig, Werte rechtsbündig.
- Dunkle Auswertungskarten nutzen für gewöhnliche Labels und Erläuterungen dieselbe helle Schriftfarbe wie für den Haupttext. Gewicht und Größe bleiben zur Gliederung erhalten.
- Zwischen Auswertungskarten liegen durchgehend 32 pt. Kartenköpfe sind linksbündig und haben eine feine Unterkante. Der zweifarbige Kopf im Hellmodus ist kompakter (mindestens 50 pt); im Dunkelmodus bleibt er bei mindestens 56 pt. Im Hellmodus liegt ein gleichmäßiger weißer Rand von 6 pt um den farbigen Kopf; seine oberen Rundungen folgen der äußeren Kartenform. Titel und Zeilen beginnen auf derselben vertikalen Achse.
- Tabellenkarten erhalten nach der letzten Zeile eine eingerückte Abschlusslinie und darunter 16 pt Freiraum. Trennlinien innerhalb dunkler Karten sind nahezu schwarz; das gilt auch für die Gehaltsdetails und die Schichtenliste.
- In der Auswertung zeigen aufklappbare Detailaktionen ein „(…)“-Symbol anstelle eines Pfeils nach rechts. Gehalts-Unterseiten verwenden denselben Kartenkopf, dieselben Zeilen und denselben unteren Abschluss.
- Dienste des Vormonats und des Folgemonats bleiben im Monatskalender sichtbar, aber auf 30 % Deckkraft reduziert. Von unten geöffnete Untermenüs starten direkt voll ausgefahren.
- Die Auswertung endet ohne zusätzliche Fußnote unter den Karten. Untermenüs behalten ihren direkt gerenderten Inhalt und bieten darin unten „Zurück“ an. In „Schichten“ steht „Schicht hinzufügen“ wieder als Zeile in der Karte; die redundante Überschrift „Meine Dienste“ entfällt. Ein Knopf im Seitenkopf schaltet den Sortiermodus ein: im Hellmodus mit Referenzblau `#0088FF`, im Dunkelmodus mit dem gelben Akzent. Außerhalb des Sortiermodus tragen Zeilen dasselbe „(…)“-Symbol wie in der Auswertung.
- Textvergrößerung, Schichtwerte und zugängliche Berührungsflächen bleiben funktional erhalten.

Die visuelle Abnahme erfolgt auf dem iPhone mit Monats- und Jahreskalender sowie Auswertung in beiden Farbmodi. Ein erfolgreicher Test oder OTA-Upload ersetzt diesen Vergleich nicht.
