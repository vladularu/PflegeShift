# Originalauftrag: Ausbildungsprofile, Schulzeiten und tatsächliche Pausen

Stand: 2026-10-04. Expo SDK 57 (~57.0.22), iPhone zuerst.

## Ziel und Dateiscope

Elf ursprüngliche Formular-/Test-/Darstellungsdateien plus dieser Beleg. Datierte Ausbildungsstände, Jugendkontext und Block-Ausbildungszuordnung bleiben von der Tarifauswahl unabhängig. Tatsächliche Pausen, Unterricht, Prüfungen und notwendige Wege werden ausdrücklich erfasst. Die Ausbildungszeit-Karte zeigt rechtliche Prüfwerte getrennt von Ist-Zeit, Saldo und Gehalt.

## Abnahmekriterien

Sämtliche ursprünglichen Komponententests bleiben erhalten. Unbekannte Angaben werden nicht ergänzt. Gespeicherte tatsächliche Pausen ändern die Dienst-Pausensumme atomar über den bereits gelieferten Datenpfad und laden abhängige Ansichten neu. Ungültige/mehrdeutige Zeiten, geänderte Dienste/Profile/Restore-Stände, Schreibkonflikte und Doppelbetätigungen dürfen keinen veralteten Schreibzugriff auslösen. Ein gespeicherter Stand wird mit seiner Revision wieder geöffnet; frühere Stände bleiben erhalten. Tastatur und große Texte werden auf dem iPhone abgenommen.

## Zusätzlicher konkreter Restore-Schutz

Die ursprünglichen Formular-Tests prüfen eine geänderte Dienstrevision. Ergänzend wird gleicher Revision und gleichem Zeitstempel bei verändertem Dienstinhalt geprüft. Ein offener Schul-/Pausenentwurf muss dann erhalten bleiben und Schreiben blockieren. Die Originalquellen bleiben separat unverändert gesichert; eine notwendige Delivery-Korrektur und ihre Regressionen werden ausdrücklich im Lieferabgleich dokumentiert.

## Liefergrenze

Die Bildschirme und Karte sind noch nicht in App-Routen oder Auswertung eingebunden. UI-Merge erst nach vollständiger gemeinsamer Integration und echter iPhone-Abnahme. DRAFT-Rechtsregeln bleiben unaktiviert. Keine eigenständige OTA, Production- oder TestFlight-Veröffentlichung.

## Herkunft und Prüfung

Die elf Ursprungsdateien stammen aus dem erhaltenen Originalcheckout codex/remaining-remuneration-training. Gezielte Tests, konkrete Restore-Regressionen und verify:fast werden vollständig ausgeführt und im Lieferabgleich dokumentiert.
