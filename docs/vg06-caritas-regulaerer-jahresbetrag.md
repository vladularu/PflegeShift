# VG-06: regulärer persönlicher Caritas-Jahresbetrag (DRAFT)

Stand: 02.10.2026.

## Task-Vertrag

- Ziel: vorhandene reguläre persönliche §-16-Bemessungsbasis, datierten Gruppensatz und bestätigten Jahresanspruch/Zwölftelfaktor zu einem nachvollziehbaren Jahresbetrag verbinden.
- Nicht-Ziele: Teilmonats-/Ersatz-/Elternteilzeit-/Späteintritts-/Austrittsbemessung, mehrere Dienstverhältnisse, Folgejahres- oder 2027-Regeln, vollständiges Brutto, Datenbank, Profil, App-Anbindung, Katalogaktivierung, EAS oder OTA.
- Plattform: reine TypeScript-Fachlogik. Expo ~57.0.22 und die passende [SDK-57-Dokumentation](https://docs.expo.dev/versions/v57.0.0/) vor Umsetzung geprüft; kein Geräte-/Screenshot-Gate für diese isolierte Domainfunktion.
- Dateiscope: genau drei neue Dateien: src/engine/caritas-annual-payment-regular-amount.ts, zugehöriger Test und dieser Beleg.
- Abnahme: unabhängige feste Centreferenzen, ganze/gekürzte Jahre und Ausnahmen außerhalb der drei Bezugsmonate, alle sechs Regionalkommissionen/acht Teilgebiete, Anlagen 31/32 und 2025/2026, Paket-/Monats-/Bestätigungsgrenzen, RK-Ost-Westbasis 2025, sichere exakte Arithmetik, Quellenherkunft, verify:fast und sieben erfolgreiche PR-CI-Gates.
- Git-Lieferschritte durch dauerhafte Nutzerfreigabe des Gesamtauftrags gedeckt. Caritas bleibt DRAFT und im normalen Gehaltsresolver gesperrt.

## Quellen und Grenze des regulären Falls

Normative Grundlage sind die Original-AVR und die bereits getrennt geprüften regionalen Jahresregeln. Aus § 16 Abs. 2 und 4 werden Dreimonatsmittel, Satz zum 01.09. und Zwölftelfaktor verbunden; die Funktion berechnet keine fehlenden Abrechnungsbestandteile. Persönliche Monatsbasen müssen extern als vollständige §-16-Basis bestätigt sein und enthalten den persönlichen Beschäftigungsumfang bereits.

- [AVR 2025](https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/AVR-PDF_Version_2025.pdf), Stand 01.07.2025: Anlagen 31/32, § 16 auf Druckseiten 264–265/301–302; Anlage 1 Abschnitt X(e) auf Druckseite 32. Original lokal erneut per SHA-256 geprüft: a4f8dea02fb84ba4f203a753bd362d82dec8ad8953f3befed99ac65e65ec2637. Webabruf dieses PDF war nicht verfügbar; der hashgleiche lokale Originalbeleg wurde gelesen.
- [AVR 2026](https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/AVR_Online-PDF_2026_final.pdf), Stand 19.03.2026: Anlagen 31/32, § 16 auf Druckseiten 255–256/291–292; Anlage 1 Abschnitt X(e) auf Druckseite 33. SHA-256: cb6fc32981eb120d5c05e68d6563725436001409e9bc728bc47d52d08d705aa7. § 1 Abs. 2 der Anlagen 31/32 lässt Abschnitt X anwendbar.

Zulässig sind nur bestätigte volle Entgeltmonate Juli, August, September bei einem Dienstverhältnis spätestens ab 01.07. und mindestens bis einschließlich 01.12. Die Elternteilzeit-Sonderbemessung nach § 16 Abs. 2 Satz 4 muss ausdrücklich als nicht einschlägig bestätigt sein. Andere Monate dürfen nach den bestehenden Anspruchsregeln entfallen oder durch vollständig bestätigte Ausnahmen erhalten bleiben. Ein ganzer Entgeltmonat der Basis muss auch im Zwölftelnachweis tatsächlich alle Kalendertage umfassen; ein Widerspruch wird gesperrt.

Diese zusätzlichen Konsistenzgrenzen sind die bewusst eng gewählte Implementierungsabdeckung, keine Behauptung, außerhalb dieses Scopes entfalle ein tariflicher Anspruch. Ungeklärte Fälle liefern unavailable und keinen Nullbetrag.

## Rechnung und Herkunft

Exakter Betrag in Cent = Summe der drei bestätigten persönlichen Monatsbasen × Satz in Basispunkten × erhaltene Monate / (3 × 10.000 × 12).

Zwischenschritte bleiben rational und werden mit BigInt berechnet; nur der auszugebende Endbetrag wird nach Anlage 1 X(e) auf Cent gerundet. Die Behandlung des ungerundeten Dreimonatsmittels als Rechenbasis ist eine dokumentierte Implementierungsentscheidung; § 16 legt keinen gesonderten Auszahlungsbetrag für das Mittel fest. Die Ausgabe bewahrt den exakten Bruch als JSON-kompatible Dezimalstrings, die Basis, den Anspruchsnachweis, den Satz und die datierten Quellen.

Der Rundungsbeleg verweist auf die konkrete vorhandene AVR-Quelle; Hash, URL und Dokumentdatum müssen zu einem der beiden hier gelesenen Originale passen. Die westlichen 2025-Pakete verwenden bereits den Textstand 19.03.2026 mit seit 2020 geltenden Bemessungssätzen, RK Ost 2025 den Stand 01.07.2025. Beide bestätigen die Centregel; für Anspruchsjahr 2026 wird ausschließlich der 2026-Beleg zugelassen. Anspruchsjahr und Datum des Quellenstands werden ausdrücklich getrennt. Paketversion, Gruppe, Region, Jahreszahl und Monatsfakten werden einmal gemeinsam eingegeben; zwei vorgefertigte fremde Ergebnisobjekte können nicht kombiniert werden. Eine erneute Teilzeitkürzung findet nicht statt.

## Prüfung und offene Fälle

- 67 neue gezielte Tests grün; zusammen mit regulärer Basis und Jahresanspruch 177 Tests.
- Regionale Matrix: 384 Kombinationen aus 2025/2026, Anlagen 31/32, acht Teilgebieten und zwölf bekannten P-Gruppen; feste 86-/76-Prozent-Referenzen, Westbasis-RKOst-2025 und unterschiedliche AVR-Textstände geprüft.
- Feste Centreferenzen einschließlich halbem Cent, unter/über der Rundungsgrenze, Zwölftelkürzung, bereits persönlicher Teilzeitbasis und absichtlich ungerundetem Dreimonatsmittel.
- verify:fast vollständig grün: 1.418 Unit-, 472 Komponententests und bestehende Script-Suites; alle 17 Regelpaketkandidaten gültig.
- Produktions-Audit und release:check grün.
- Exakte Importsuche: neue Funktion wird ausschließlich in ihrem Test importiert. Keine bestehenden App-/Katalog-/Profildateien geändert.
- Vor Merge müssen alle sieben Pull-Request-CI-Gates ebenfalls erfolgreich abgeschlossen sein.

Sonderbemessungen und endgültige fachliche Freigabe bleiben getrennte Folgepakete; completeGross bleibt false und draft bleibt true.
