# Caritas: ursprüngliche persönliche Komponenten

Stand: 2026-10-04. Fünfzehn Lieferdateien; sieben vollständige ursprüngliche Referenzmodule, sechs ursprüngliche Implementierungen und ein begrenzter Kompatibilitätsadapter sowie dieser Beleg.

## Ziel und Abnahme

Die erhaltenen persönlichen Funktionen für Pflegezulagen (§ 12 Abs. 3/4), Schichtzulagen, Zeitzuschläge und ausdrücklich klassifizierte Überstunden werden mit ihrer Nettozeit- und Faktenableitung übernommen. Tatsächlich gespeicherte Pausen werden abgezogen; fehlende, veraltete oder mehrdeutige Fakten, unvollständige Dienstlisten und nicht unterstützte Zeitumstellungsfälle führen zu nicht verfügbar. Feiertagsausgleich und Samstags-Schichtarbeit benötigen ausdrücklich bestätigte Fakten. Überstunden benötigen getrennte Klassifizierung und Ausgleichsentscheidungen für Arbeitszeit und Zuschlag.

Der vorhandene persönliche Tabellenbetrag samt Überlauf-/Quellen-/Wochenzeitprüfung bleibt unverändert. Die vollständigen sieben ursprünglichen Tabellenbetrag-Referenzfälle werden in caritas-care-draft-base-original.test.ts zusätzlich erhalten. Alle ursprünglichen Komponentenreferenzen, verify:fast und sieben grüne CI-Prüfungen vor Merge. Plattformunabhängiger Berechnungskern; Persistenzbrücke und App-Anbindung sind getrennte Pakete.

## Quellen und Grenzen

Datierte Quellen und Policies folgen den zwölf bereits geprüften regionalen DRAFT-Revisionen für 2025/2026. Die Funktionen behandeln bekannte Teilbeträge; daraus folgt kein vollständiges Gehalt. Keine App-Aktivierung oder OTA. Monatskomposition, Auszahlung und Jahres-/2027-Grenzen, unabhängige Fachprüfung und iPhone-Abnahme bleiben weitere Aufgaben des Gesamtauftrags.

Der neue Adapter caritas-care-draft-original-base.ts erhält zusätzlich die ursprüngliche Mindestgrenze von 60 Wochenminuten für den persönlichen Pfad. Er nutzt die bereits gelieferte Tabellenbetrag-Abfrage mit ihren Quellen-/Wochenzeit-/Überlaufprüfungen; deren vorhandene Aufrufer und kleinerer Eingabebereich bleiben unverändert. Alle sieben ursprünglichen Tabellenbetrag-Referenzen behalten ihre Fachassertionen unverändert. Nur diese Testdatei und die neue Zulagenfunktion importieren hier den Adapter; die folgende ursprüngliche Monatskomposition nutzt denselben persönlichen Pfad.
