# Caritas: lokale DRAFT-Komposition

Stand: 2026-10-04. Fünf Dateien: vollständige ursprüngliche Datenbank-Snapshot- und Kompositionsmodule samt ihren Referenzen und dieser Beleg.

## Ziel und Abnahme

Ein transaktional konsistenter lokaler Datenstand verbindet Vergütungsprofile, tatsächliche Pausen, datierte Zulagenentscheidungen, Dienste, bestätigte Überstunden, Monats-/Feiertagsfakten und Jahresansprüche mit den ursprünglichen Caritas-Funktionen. Die vollständige lokale Diensthistorie berücksichtigt spätere Auszahlungen für frühere Arbeit. Bestätigte bzw. schätzbare Cash-Positionen bleiben auch bei einem späteren Profilwechsel getrennt von nicht verfügbarem Monatsentgelt sichtbar.

Die Schnittstelle liefert ausschließlich eine bekannte DRAFT-Zwischensumme bzw. bekannte Cash-Positionen mit completeGross=false und ausdrücklicher Liste ausgeschlossener Bestandteile. Fehler oder fehlender Anspruch beweisen keine Nullzahlung. Unabhängige ursprüngliche Datenbank-/Kompositionsreferenzen, verify:fast und sieben grüne CI-Prüfungen vor Merge. SQLite-API entspricht der installierten Expo-SDK-57-Version; keine Schemaänderung oder neue native Abhängigkeit.

## Grenzen

Der Datenbank-Einstieg ist für eine explizite spätere Kandidatenansicht vorgesehen. Er speist keine normalen Bruttosummen und aktiviert keinen DRAFT-Katalogvertrag. Keine App-Aktivierung oder OTA. Sichtbare App-Eingaben, Fachfreigabe, 2027 und tatsächliche iPhone-Abnahme bleiben getrennte weitere Aufgaben des Gesamtauftrags.
