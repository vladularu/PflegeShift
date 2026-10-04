# Originalauftrag: Ausbildungs-, Schul- und Pauseneingabemodelle

Stand: 2026-10-04. Expo SDK 57 (~57.0.22), iPhone zuerst.

## Ziel und Scope

Acht unveränderte Originaldateien plus dieser Beleg. Datierte Ausbildungsprofile, ausdrückliche Alters-/Schulpflichtangaben, Jugendkontext, Block-Ausbildungszuordnung und tatsächliche Schul-, Prüfungs-, Weg- und Pausenintervalle werden aus Eingaben validiert.

## Abnahmekriterien

Alle ursprünglichen Tests bleiben vollständig erhalten. Fehlende Angaben bleiben unbekannt; Ausbildungsjahr, rechtliche Grundlage und Alter werden nicht aus dem Tarif abgeleitet. Neue Stände wirken erst ab ihrem Datum. Tagesangaben vor Profilbeginn, unbeabsichtigt nicht hinzugefügte Tagesangaben, veraltete/mehrdeutige Dienstbindungen und widersprüchliche Intervalle werden zurückgewiesen. Zeitumstellungen verlangen eine eindeutige Ortszeit-Zuordnung. Ausdrücklich keine Pause, keine Wegzeit und Nullausfall sind echte Bestätigungen, keine Leerfelder.

## Liefergrenze

Reine Eingabemodelle mit Originaltests. Keine sichtbare Formular- oder Route-Anbindung. Keine Änderung gesetzlicher Grenzwerte, keine Aktivierung ungeprüfter DRAFT-Regeln, keine OTA, Production- oder TestFlight-Veröffentlichung.

## Herkunft und Prüfung

Die acht Dateien stammen unverändert aus dem erhaltenen Originalcheckout codex/remaining-remuneration-training. Gezielte Tests und verify:fast werden vollständig ausgeführt und im Lieferabgleich dokumentiert.
