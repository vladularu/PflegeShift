# Gruppierte Gehaltsauswahl

## Auftrag und Abnahmevertrag

- Ziel: Die vom Nutzer bestaetigte Auswahl in einem einzigen, ruhigen Fenster darstellen: Pflegepersonal, Ausbildung und eigenes Gehalt.
- Nicht-Ziele: Neue Tarife, Berechnungsregeln, Profil-/Datenbankfelder, weitere Einstellungen oder native Abhaengigkeiten.
- Plattform: iPhone zuerst, interne iOS-Preview; Light/Dark und grosse Schrift beachten.
- Basis: Die auf dem iPhone abgenommene TVA-L-Preview, Commit `254f2699bd54fc800e0513d3a02f1c9459cc394c`, OTA-Gruppe `55c98347-14eb-471e-b4cb-e91a1584acf6`.
- Dateiscope: Gehaltsformular, Auswahloptionen, ausgelagertes DropdownField mit optionaler gruppierter Darstellung und bestehendem Re-Export, zugehoerige UI-Tests und dieser Beleg.
- Freigabe: Umsetzung und bestehende ausdrueckliche Freigaben fuer Git-Lieferung und interne Preview. Vollstaendige CI und echte iPhone-Abnahme bleiben Merge-Gates.

## Verbindliche Darstellung

- Titel des Auswahlfensters: **Gehaltsgrundlage**.
- **Pflegepersonal**: TVoeD-P, TVoeD VKA E-Tabelle, TV-L Pflege, TV-H Pflege, TV-UK Pflege.
- **Ausbildung**: TVAoeD Pflege und TVA-L Pflege.
- **Eigenes Gehalt**: Monatsbrutto selbst eintragen.
- Kompakte Zeilen, Trennlinien und Haken bei der aktuellen Auswahl; Farben und Typografie der bestehenden App.
- Hessen und Baden-Wuerttemberg als kleinere Unterzeile.
- Bitte waehlen ist nur der Platzhalter des Felds, kein auswaehlbarer Tarif.
- Alle Optionen werden durch Antippen im gleichen Fenster ausgewaehlt. Abbrechen und Schliessen aendern den Entwurf nicht.
- Mindestens 44-Punkt-Trefflaechen, umbrechende Texte, Safe-Area-Abstand, scrollbar bei wenig Hoehe oder grosser Schrift, VoiceOver-Auswahl und Fokus-Rueckkehr.

## Pruefung und Lieferung

- Gezielt: gruppierte iOS-Auswahl, normale iOS-Dropdowns, Abbrechen, Auswahlstatus sowie alle sieben vorhandenen Tarif-Formularsuiten.
- Vollstaendiges `npm.cmd run verify:fast` erforderlich.
- Runtime der Preview vor OTA mit installiertem Build 32 abgleichen.
- Visuelle iPhone-Abnahme nach Preview-OTA noch offen. Der Screenshot des alten Auswahlfensters ist die Ausgangsreferenz; die drei Gruppen sind vom Nutzer bestaetigt.

## Lokaler Nachweis

- 88 gezielte UI-Pruefungen bestanden: neue gruppierte Auswahl, normale Dropdowns und alle sieben Tarif-Formularsuiten.
- Vollstaendiges `verify:fast` bestanden, einschliesslich Architekturgrenzen, Typen, Lint, Format, Unit-/Komponententests und Skriptvertraegen.
- DropdownField in eine eigene UI-Datei ausgelagert; der bisherige Import ueber form-controls bleibt gueltig.
- iOS-Export erstellt. Fingerprint `f2f4b99ba254b82ab22b99594d5228bd8c3774f7` passt zur installierten Preview.
- Der TVA-L-App-PR #276 ist nach Nutzerabnahme und sieben gruener CI-Pruefungen in den bestehenden App-Stack gemergt. Der neue UI-Branch wird auf dessen identischen Quellbaum aufgesetzt.
