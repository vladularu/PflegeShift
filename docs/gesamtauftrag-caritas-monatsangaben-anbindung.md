# Caritas-Monatsangaben: vorhandenes Originalformular erreichbar machen

Stand: 2026-10-04, Expo SDK 57 (~57.0.22). iPhone zuerst.

## Ziel und Scope

Elf Dateien: reine Kontextprüfung mit Quellentests, Monatscontroller mit echten Formularfällen, Route und Navigationstest, bestehender Gehaltseinstieg mit Linktest sowie dieser Beleg. Das bereits gesicherte Originalformular und dessen ursprüngliche Tests bleiben unverändert.

## Abnahme

Alle sechs Regionalkommissionen und beide Pflegeanlagen bei gültiger Auswahl; Ost-Tarifgebiete bleiben ausdrücklich getrennt. Nur ein für den gesamten Monat gültiges datiertes Profil und ein unveränderter gültiger DRAFT-Regelstand des Vertrags 14 öffnen das Formular. Fehlender/mehrdeutiger Verlauf, unbekannter Beginn, Profil-/Regelwechsel im Monat, ungültige Auswahl, ungültige gespeicherte Angaben und fehlende Quellen bleiben gesperrt. Laden/Fehler zeigen keine alten Eingaben. Schlüssel binden den vollständigen Profilinhalt und Monatsangaben, damit Wiederherstellung bei gleicher Revision keine ungespeicherten Altantworten weiterträgt.

## Liefergrenzen

Dies ist der persönliche Eingabefluss für DRAFT-Monatsansprüche. Er berechnet kein vollständiges Caritas-Gehalt, aktiviert keinen Tarif und hat keinen Zugriff auf Production. Keine native Änderung oder einzelne OTA. Gegenwärtige Karten-/Formularstile, Fußbereiche und Sheet-Detents bleiben erhalten. Geräteabnahme vor UI-Merge.

## Prüfungen

Gezielte Quellen-, Routen-, Controller-/Restore- und Gehaltseinstiegstests, anschließend verify:fast auf gemeinsamer Formularbasis.

Ergebnis: 38 Quellen-/Routentests, neun Controllerfälle sowie 28 ursprüngliche Formular-/Gehaltsfälle grün. verify:fast auf gemeinsamer Integrationsbasis grün: 5294 Unit- und 823 Komponententests, alle Liefer-/Operator-/Audit-/Runtime-Prüfungen. Exporte und iPhone-Abnahme werden am gemeinsamen abschließenden Preview-Stand geprüft.
