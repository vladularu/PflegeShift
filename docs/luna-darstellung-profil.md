# LUNA: Darstellung, Arbeitsprofil und Auswertung

Ziel: Den bestätigten Entwurf nativ und mit bestehenden Berechnungen integrieren.
Plattform: iPhone zuerst; bestehende plattformübergreifende Navigation erhalten.
Dateiscope: Theme, Einstellungen, Profil/Backup, Auswertung/Gehalt, zugehörige Navigation und Tests.
Nicht-Ziele: Neue Konten, mehrere Profile, neue Tarifregeln, native Abhängigkeiten oder Markenassets.
Default: LUNA Standard und Systemmodus. Zusätzliche Themes: Minzbrise, Lavendelruhe, Rosenleinen, Meeresluft.

## Arbeitspakete

1. Theme-Vertrag, Katalog, SQLite-Präferenzen und Backup-Kompatibilität.
2. Theme-Provider, Darstellung und konsistente Navigation/Kalenderflächen.
3. Profilfelder, additive Migration und alte/neue Backups.
4. Arbeitsprofil und neues Mehr.
5. Kompakte Monatsübersicht, Stunden- und Prüfungsdetails.
6. Gehalt und filterbare Zeitzuschläge.

## Abnahme

Pro Paket verify:fast sowie fokussierte Tests. Abschließend verify:full.
iPhone: fünf Themes jeweils hell/dunkel, Systemwechsel, große Schrift, Neustart,
Profil speichern, Monatsnavigation, Gehalt und Zuschläge mit Screenshots dokumentieren.
Geräteabnahme offen, bis ein passender Development-Build oder freigegebenes Preview-Update verfügbar ist.
Bei Beginn waren Commit, Push, PR/Merge, Build und Store-Veröffentlichung nicht freigegeben. Die Preview-OTA wurde anschließend separat freigegeben und am 20.09.2026 veröffentlicht (siehe unten).

## Implementierter Stand

- Isolierter Checkout auf `codex/luna-darstellung-profil`, Basis `8014390` (aktueller Hauptstand bei Beginn).
- Expo `~57.0.22`, SDK-57-Schnittstellen, keine neuen nativen Abhängigkeiten.
- Mehr → Darstellung: fünf Themes, Hell/Dunkel/System, sofortige Vorschau, geordnete Speicherung, Fehlerwiederholung und Rückkehr zu LUNA Standard/System.
- Mehr → Arbeitsprofil: Name und Arbeitgeber bearbeiten; Arbeitszeit, Tarif & Gehalt und Schichtmodell öffnen die vorhandenen Formulare.
- Auswertung: drei Monatskarten für Stunden, Prüfung und Gehalt. Die Stundenverteilung und Prüfmeldungen liegen auf eigenen Seiten; die Jahresansicht bleibt erhalten.
- Gehalt → Zeitzuschläge: vollständige Seite mit Monatssumme, Summen nach Art, Filtern und chronologisch aufklappbaren Diensten. Gefilterte Summen sind ausdrücklich gekennzeichnet.
- Datenbankschema 13 ergänzt zwei nullable Profilfelder. Bestehende Formulare erhalten diese Angaben. Alte Backup-Prüfsummen werden vor dem Ergänzen fehlender Felder geprüft.
- Bestehende Gehaltsberechnungen, individuelle Schichtfarben und Markenassets sind unverändert.

## Automatische Nachweise

- Die Schnellprüfungen der Arbeitspakete umfassen Typprüfung, Lint, Formatierung, Unit-/Komponententests, Regel- und Buildprüfungen.
- 755 Unit-Tests und 425 Komponententests bestanden; die vorgegebenen Unit- und Komponenten-Coverage-Grenzen wurden erreicht.
- Zusätzliche Fälle prüfen schnelle Theme-Wechsel, Speicherfehler/Wiederholung, Systemwechsel, erneutes Einlesen, Zurücksetzen, Profilwerterhalt, Migration und alte/neue Backups.
- Monatsübergabe, Rückkehr zur Monatsansicht, Jahresnavigation, fehlende Regelstände, noch laufende Prüfung, manuelles Gehalt und Zuschlagsfilter sind abgesichert.
- Text- und Buttonkontraste aller fünf Paletten in Hell und Dunkel wurden rechnerisch geprüft. Kleine Saldotexte verwenden die kontrastreiche Textfarbe; Prüfungsarten bleiben über Symbolfarbe und Klartext unterscheidbar.
- `verify:full` erreichte zunächst den netzwerkabhängigen npm-Audit-Schritt. Dieser wurde mit Netzwerkzugriff erfolgreich nachgeholt; keine hohen oder kritischen Advisories nach Projektpolicy.
- Die Release-Konfiguration ist konsistent. Die Exportergebnisse und der abschließende Schnelllauf stehen in den lokalen, nicht versionierten `verification-*.log`-Dateien.

## Noch ausstehende Geräteabnahme

Eine automatisierte iPhone-Verbindung steht in diesem Windows-Checkout nicht zur Verfügung.
Die Webversion sperrt die verschlüsselte Datenbank ausdrücklich und dient daher nicht als visuelle App-Abnahme.

Für einen passenden Development-Build bzw. ein separat freigegebenes Preview-Update sind auf dem iPhone noch zu dokumentieren:

1. Gerät, iOS-Version, installierter Build und verwendeter Code-/Update-Stand.
2. Alle fünf Themes in Hell und Dunkel; Systemwechsel und App-Neustart.
3. Große Schrift, VoiceOver, reduzierte Bewegung, Touchflächen und individuelle Schichtfarben.
4. Screenshots von Darstellung, Mehr, Arbeitsprofil, Monatsübersicht, Gehalt und Zeitzuschlägen.
5. Profiländerungen, Backup-Wiederherstellung sowie Monat und Rücknavigation in den Detailseiten.

Der ursprüngliche Arbeitsordner mit seinen ungesicherten Änderungen wurde nicht zur Implementierung verwendet.

## Freigegebene Preview-OTA

Am 20.09.2026 wurde die Umsetzung als iOS-Preview-OTA für LUNA Shift Internal, Build 31, veröffentlicht und per update:list bestätigt.

- Updategruppe: f15d6d80-fb84-4e1b-b621-ec4db9204ca7.
- Runtime: eac302484061dfb3fa63e2a74b8618ff6000861c.
- [EAS-Update](https://expo.dev/accounts/vladularu/projects/pflegeshift/updates/f15d6d80-fb84-4e1b-b621-ec4db9204ca7).
- Getrennter Liefercheckout: ../luna-preview-ota, Branch codex/luna-profile-preview31. Er erhält die native Preview-31-Basis; alle 559 App-/Source-/Asset-/Regeldateien stimmen bytegleich mit dieser Implementierung überein.
- verify:fast und iOS-Export auch im Liefercheckout bestanden. Keine erzwungene Runtime oder geänderte Fingerprint-Regel.
- Die ausführliche Liefernotiz steht dort unter docs/luna-darstellung-profil-ota.md. Die iPhone-Abnahme bleibt ausstehend.

## Nachbesserung: Jahresauswertung

Ziel: Auch die Jahresansicht an die neue Monatsgestaltung angleichen: drei kompakte Theme-Karten für Stunden, Prüfung und Gehalt, mit eigenen Detailseiten.
Plattform: iPhone zuerst, bestehende native Stack-Navigation.
Scope: gemeinsame Übersichtskarte, Jahresübersicht/-details, Jahresdetailroute, fokussierte Komponenten-/Navigationstests.
Nicht-Ziele: neue Berechnungen, Datenmigrationen, native Änderungen oder Änderungen an den gewählten Schichtfarben.
Abnahme: Jahreswerte und Monatsübergabe unverändert; klare Lade-/Fehlerzustände; Jahresnavigation und native Rücknavigation; verify:fast sowie iPhone-Screenshots (Gerätezugang ausstehend).

### Umgesetzte Jahresansicht

- Monat und Jahr verwenden dieselbe Übersichtskarte und die aktiven Theme-Flächen.
- Die Jahresübersicht zeigt Stunden, Prüfung und Gehalt. Jahreswechsel und Rückkehr zur Monatsübersicht bleiben erhalten.
- Die neue native Route annual-details hält Jahr und Bereich in validierten Parametern; Detailseiten öffnen die vorhandenen Monatsseiten per Stack-Push. Die Jahresansicht bleibt darunter erhalten.
- Stunden enthalten Jahresverlauf mit mindestens 56 Punkt hohen Monatszeilen und die bisherige Dienstverteilung. Prüfung enthält die bestehenden Meldungszahlen und betroffenen Monate. Gehalt enthält die bisherigen Summen und zwölf Monatszugänge.
- Keine Änderungen an Jahresberechnungen, Tarifen, SQLite oder nativen Abhängigkeiten.
- Fokussierte Tests: 41 bestanden. verify:fast im Implementierungscheckout: 756 Unit-Tests und 433 Komponententests sowie alle Skriptprüfungen bestanden.
- Liefercheckout: 563 App-/Source-/Asset-/Regeldateien bytegleich. 13 geänderte/neue Dateien gegenüber der ersten Theme-OTA. Runtime weiterhin eac302484061dfb3fa63e2a74b8618ff6000861c.
- Geräteabnahme der Jahresübersicht und der drei Detailseiten ist noch offen.

### Jahresauswertung: veröffentlichtes Folgeupdate

- Jahresübersicht und Detailseiten für Stunden, Prüfung und Gehalt wurden als iOS-Preview-Korrektur veröffentlicht.
- Updategruppe: 8e5f9128-f1a8-48cf-9988-30e4445c7949.
- iOS-Update: 01a0c0b7-67cd-79c0-b73a-23e7ee6927b1.
- Runtime: eac302484061dfb3fa63e2a74b8618ff6000861c (Preview-Build 31).
- [EAS-Update](https://expo.dev/accounts/vladularu/projects/pflegeshift/updates/8e5f9128-f1a8-48cf-9988-30e4445c7949).
- verify:fast auch im Liefercheckout erfolgreich: 756 Unit-Tests und 433 Komponententests, alle Skriptprüfungen. iOS-Export erfolgreich.
- Bundle: entry-b55c7841339c0e9bef45936d73620ba1.hbc; SHA256: BFFE146CFD35AE9E3F59C9DD4824924B733E53E7852E0586409E87C92BC89D41.
- update:list bestätigt nach der Veröffentlichung Gruppe, Branch preview, Plattform ios und Runtime.
- Nachweise im Liefercheckout: artifacts/ota-annual und ota-annual-*.log. Das Manifest der vorherigen OTA bleibt erhalten.
- Kein Commit, Push, Merge oder neuer nativer Build. Visuelle iPhone-Abnahme noch offen.

## Feinschliff: ruhige Paletten und Moduswahl

Ziel: Die fünf Themes kohärenter und zurückhaltender abstimmen; Hell/Dunkel/System als gemeinsame, kompakte Moduswahl im LUNA-Stil gestalten.
Plattform: iPhone zuerst, ohne neue native Abhängigkeiten.
Scope: Palettenkatalog und Standardflächen, Darstellungsseite, gezieltes Modus-Bedienelement, Kontrast- und Interaktionstests.
Nicht-Ziele: Theme-IDs oder Namen ändern, individuelle Schichtfarben/Markenrot verändern, Datenhaltung oder Fachberechnungen ändern.
Abnahme: konsistente Flächenhierarchie in Hell/Dunkel, lesbare Texte und Aktionen, eindeutige Auswahl, mindestens 44-Punkt-Ziele, große Schrift, unabhängige Modus-/Theme-Auswahl und vorhandene Speicherfehlerbehandlung. verify:fast und iPhone-Abnahme der Darstellungsseite und Auswertung.

### Ergebnis des visuellen Feinschliffs

- Ruhigere helle und dunkle Begleitflächen; Hauptfarbe und zwei gedämpfte Begleitfarben bleiben pro Theme erkennbar.
- Neutralere Bedienflächen und auf das jeweilige Theme abgestimmte Ränder/Trennlinien. LUNA Standard hat einen konsistenten warmen hellen Hintergrund; das freigegebene Markenrot und die Statusfarben bleiben erhalten.
- Hell/Dunkel/System als zusammengehörige Auswahlleiste mit Kontur-/Füllsymbolen, hervorgehobener Auswahlfläche, Radio-Semantik und 48-Punkt-Bedienflächen. Schon bei mittlerer Schriftvergrößerung wechseln die Optionen untereinander.
- Theme-Karten mit feinem Rand, stabiler Auswahlmarkierung, kompaktem Standard-Eintrag und einer Vorschau der echten Palette. Größere Schrift erhält eine einspaltige Darstellung.
- Kontrastprüfung aller zehn Kombinationen: Texte, Aktionstexte und Statusfarben mindestens 4,5:1; Bedienränder mindestens 3:1 auf den geprüften Flächen.
- Modus und Theme sind weiterhin unabhängig. Wiederholtes Antippen der aktiven Auswahl schreibt nicht erneut; Speichern, Wiederholen und Zurücksetzen sind weiter erreichbar.
- Automatische Nachweise: verification-palette-fast.log, verification-palette-focused.log und verification-appearance-focused.log. Die nachträglich verfeinerte Darstellung bei mittlerer Schrift wurde zusätzlich gezielt getestet und typgeprüft.
- Visuelle iPhone-Abnahme der überarbeiteten Palette und Auswahlleiste bleibt offen.

### Paletten und Moduswahl: veröffentlichtes Folgeupdate

- Updategruppe: 5252750a-7f24-4d66-b087-c045beb1b39a.
- iOS-Update: 01a0c0c5-f77d-77c7-9aa9-ebb716ea7309.
- [EAS-Update](https://expo.dev/accounts/vladularu/projects/pflegeshift/updates/5252750a-7f24-4d66-b087-c045beb1b39a).
- Ziel: iOS Preview / Build 31, Runtime eac302484061dfb3fa63e2a74b8618ff6000861c. Veröffentlichung durch update:list bestätigt.
- Gegenüber der Jahres-OTA wurden sechs Quelldateien geändert bzw. ergänzt. Alle 565 App-/Source-/Asset-/Regeldateien stimmen mit dem Implementierungscheckout überein.
- verify:fast in beiden Checkouts bestanden: 756 Unit-Tests und 438 Komponententests sowie Skriptprüfungen. Die anschließende Anpassung bei mittlerer Schriftvergrößerung bestand erneut die Typprüfung und 11 gezielte Komponententests (einschließlich eines zusätzlichen Falls).
- Alle zehn Paletten unterstützen auf den geprüften Inhaltsflächen mindestens 4,5:1 Text-/Aktions-/Statuskontrast und 3:1 für Bedienränder.
- Finaler iOS-Export: entry-3c5d4f9bd58a86e8f30e85ab05f73b6b.hbc; SHA256 a4db83205dd25a7779ad7e9a0b77366649fbd3a4f3dcfbd6b03b8519d5a756fc.
- Nachweise im Liefercheckout unter artifacts/ota-palette und ota-palette-*.log. Vorherige Manifeste/Bundle-Nachweise bleiben erhalten.
- Native Abhängigkeiten, Konfiguration, Markenrot, Statusfarben und individuelle Schichtfarben unverändert. Kein Commit, Push oder neuer nativer Build.
- Visuelle iPhone-Abnahme der ruhigeren Flächen und Modusleiste bleibt offen.

## Korrektur: neutrale Karten in der Auswertung

Ziel: Monats- und Jahreskacheln sowie hervorgehobene Prüfungs-/Gehaltsdetails verwenden die reguläre Kartenfläche der aktiven Palette. Bei LUNA Standard ist sie im hellen Modus weiß und im dunklen Modus grau.
Nicht-Ziele: Änderungen an Palettenwerten, Berechnungen, Navigation, individuellen Schichtfarben oder nativer Integration.
Zielplattform: vorhandener iOS-Preview-Build 31.
Dateiscope: gemeinsame Übersichtskarte, Monatsübersicht, Jahresübersicht, Jahresdetails und Gehaltsseite; Dokumentation der Prüfung und Preview-Auslieferung.
Akzeptanz: keine dekorativen Akzentflächen auf diesen Karten, konsistente Kartenränder; Aktionen, Auswahl und semantische Statusfarben bleiben erkennbar. Bestehende Komponenten-/Navigationstests und verify:fast; visuelle Bestätigung in Hell und Dunkel auf dem iPhone bleibt gesondert erforderlich.
Auslieferung: Fortsetzung der ausdrücklich freigegebenen iOS-Preview-OTA; kein Commit, Push, Merge oder nativer Build.

### Neutrale Auswertung: veröffentlichtes Folgeupdate

- Monats- und Jahreskacheln verwenden die reguläre Palette.surface mit den bestehenden Kartenrändern: LUNA Standard hell #FFFFFF, dunkel #25272A.
- Dekorative Begleitflächen aus Jahresprüfung, Jahresgehalt und monatlicher Gehaltssumme entfernt. Aktionen, Auswahlzustände, Diagramme und semantische Warn-/Statusfarben bleiben erhalten.
- Genau fünf Quelldateien gegenüber der vorigen Preview-OTA geändert. Alle 565 App-/Source-/Asset-/Regeldateien stimmen zwischen Implementierungs- und Liefercheckout überein.
- verify:fast in beiden Checkouts erfolgreich: 756 Unit-Tests, 439 Komponententests in 81 Suites und alle jeweiligen Skriptprüfungen. Der iOS-Export ist erfolgreich.
- Updategruppe: 4f858b6e-b85e-466e-a720-14341822baf9.
- iOS-Update: 01a0c0d4-ad3f-74a9-bd72-94e90ede805b.
- [EAS-Update](https://expo.dev/accounts/vladularu/projects/pflegeshift/updates/4f858b6e-b85e-466e-a720-14341822baf9).
- Branch preview, Plattform ios, Runtime eac302484061dfb3fa63e2a74b8618ff6000861c (Preview-Build 31), nach Veröffentlichung durch update:list bestätigt.
- Bundle: entry-cdb2b808f45e12f8d132f75a5ab407fd.hbc; SHA256 254bca3b7fea43ea6a63d55d71b6db23b3c46d9299753bf166e44de66c121302.
- Nachweise: artifacts/ota-surfaces und ota-surfaces-*.log im Liefercheckout; verification-analysis-surfaces-fast.log im Implementierungscheckout.
- Kein Commit, Push, Merge oder nativer Build. Visuelle iPhone-Bestätigung der neutralen Karten in Hell und Dunkel bleibt offen.

## Ruhigere Monats- und Jahresprüfung

Ziel: Den ausdrücklich bestätigten Gestaltungsvorschlag aus artifacts/design/pruefung-ruhiger-konzept.html nativ übernehmen: eine Zusammenfassung pro Prüfungsseite, kleine Statussymbole mit Text, flache Meldungskarten und einfache Dienstzeilen.
Nicht-Ziele: Prüfregeln, Schweregrade, Berechnungen, Sichtbarkeitseinstellungen, Datenhaltung oder native Abhängigkeiten ändern.
Plattform: iPhone, vorhandener interner Preview-Build 31; bestehender isolierter Branch codex/luna-darstellung-profil.
Scope: Prüfungs-Zusammenfassung und aufklappbare Erklärung, Monatsprüfung, Jahresprüfungsdetails, Meldungsgruppen, Routentitel sowie passende vorhandene/ergänzte Komponentenprüfungen.
Akzeptanz: klare Trennung von gesetzlicher Prüfung und freiwilliger Planung; aktuelle Zählwerte und Monatsnavigation; kein Erfolgszustand bei fehlenden Regelständen oder laufender Berechnung; große Schrift ohne Abschneiden; neutrale Kartenflächen; mindestens 44-Punkt-Bedienflächen; reduzierte Bewegung. Erklärung über „Über die Prüfung“ zugänglich.
Gerätenachweis: Die beiden am 21.09.2026 übermittelten iPhone-Screenshots dokumentieren den bisherigen Stand und den Anlass. Die visuelle Abnahme des neuen nativen Layouts ist nach der Umsetzung separat erforderlich.
Prüfung und Lieferung: fokussierte Komponentenprüfungen, verify:fast und kompatibler iOS-Export; Fortsetzung der freigegebenen Preview-OTA. Commit, Push, Merge und nativer Build sind nicht Teil dieser Freigabe.

### Ruhigere Prüfung: Ergebnis und veröffentlichtes Folgeupdate

- Monats- und Jahresprüfung bündeln Zeitraum, Meldungszahl und relevante Statusangaben in einer neutralen Zusammenfassung. Leere Schweregrade werden ausgelassen.
- Gesetzliche Prüfung und freiwillige Planung bleiben getrennt. Ein erfolgreicher gesetzlicher Teil erscheint kompakt mit Statussymbol; eine laufende oder nicht verfügbare Prüfung erzeugt keinen Erfolgszustand.
- Meldungsgruppen verwenden eine Kartenebene, kleine Statussymbole und bei Bedarf aufklappbare Details. Betroffene Dienste stehen als einfache Zeilen mit Datum und Uhrzeit darunter.
- Jahresmonate erscheinen ohne wiederholte Jahreszahl; Monatsnavigation und zugängliche Beschriftungen enthalten weiterhin das vollständige Datum.
- Die Erklärung und der Hinweis zur Rechtsberatung sind über „Über die Prüfung“ erreichbar. Routentitel für beide Prüfungsseiten: „Prüfung“.
- Zehn Quelldateien gegenüber der neutralen Auswertungs-OTA geändert beziehungsweise ergänzt. Alle 566 App-/Source-/Asset-/Regeldateien stimmen zwischen Implementierungs- und Liefercheckout bytegenau überein.
- verify:fast in beiden Checkouts bestanden: 756 Unit-Tests in 107 Dateien, 444 Komponententests in 81 Suites und alle jeweiligen Skriptprüfungen. Der kompatible iOS-Export ist erfolgreich.
- Updategruppe: 703cdf45-57e6-4794-8227-bbbc6c2703a4.
- iOS-Update: 01a0c0f5-2665-7ec9-90d9-1bdd8d30922e.
- [EAS-Update](https://expo.dev/accounts/vladularu/projects/pflegeshift/updates/703cdf45-57e6-4794-8227-bbbc6c2703a4).
- Branch preview, Plattform ios, Runtime eac302484061dfb3fa63e2a74b8618ff6000861c (Preview-Build 31). Veröffentlichung und Runtime nachträglich durch update:list bestätigt.
- Bundle: entry-0aca20947ef003b91296e89c7ce30072.hbc; SHA256 92368353aa36cada79c2e58f38a8683c096e56f0ea9a95d1a20b2bc6e5713685.
- Nachweise: artifacts/ota-check-layout und ota-check-layout-*.log im Liefercheckout sowie verification-check-layout-fast.log im Implementierungscheckout.
- Prüfregeln, Berechnungen, native Konfiguration und Abhängigkeiten unverändert. Kein Commit, Push, Merge oder neuer nativer Build.
- Die visuelle iPhone-Abnahme des neuen Layouts in Hell/Dunkel und mit großer Schrift bleibt offen.

## Ruhige Listenauswertung und anpassbare Ansicht

Ziel: Den bestätigten Entwurf aus artifacts/design/auswertung-ruhig-konzept.html als native Auswertung für Monat und Jahr übernehmen. Neutrale Karten, links Beschriftung/rechts Wert, kleine Statussymbole, direkte Detailzugänge, gemeinsame Schichtkarte Anzahl/Stunden und gespeicherte Kartenansicht.
Nicht-Ziele: Neue Prüf-/Gehaltsregeln, zusätzliche native Bibliotheken, Änderungen am Kalender oder an individuellen Schichtfarben.
Plattform: iPhone, vorhandener interner Preview-Build 31; Branch codex/luna-darstellung-profil. Der ursprüngliche Arbeitsbaum bleibt unberührt.
Arbeitspaket 1: Typisierte Ansichtsoptionen, SQLite-Speicherung, geordnete Schreibvorgänge, Wiederholung bei Fehlern, Einbindung in Backup/Wiederherstellung/Reset.
Arbeitspaket 2: Gemeinsame Listenkarten, Monats-/Jahresintegration und Schichtaggregation aus den vorhandenen Minutenwerten; fachliche Ergebnisse und Verfügbarkeit erhalten.
Arbeitspaket 3: Native Anpassungsansicht mit Ein-/Ausblenden und Reihenfolge, Navigation, große Schrift, reduzierte Bewegung, Integrationsprüfungen und kompatibler iOS-Export.
Abnahme: Auswahl bleibt nach Neustart erhalten, schnelle Änderungen landen in der richtigen Reihenfolge, alte Backups ergeben Standardwerte, neue Backups erhalten die Ansicht. Summen entsprechen der bisherigen Berechnung; kein Erfolgs- oder Nullzustand bei fehlenden Daten. Alle Aktionen mindestens 44 Punkte, Hell/Dunkel, gut lesbare große Schrift und Monats-/Jahresnavigation. verify:fast und passende Tests; native iPhone-Screenshots bleiben zusätzlich erforderlich.
Auslieferung: Fortsetzung der zuvor ausdrücklich freigegebenen Preview-OTA; kein Commit, Push, Merge oder nativer Build.

### Listenauswertung: Ergebnis und veröffentlichtes Folgeupdate

- Monats- und Jahresübersicht verwenden gemeinsame neutrale Listenkarten für Arbeitszeit, Prüfung, Gehalt und Schichten. Beschriftung und Wert stehen nebeneinander; große Schrift darf umbrechen. Summen erhalten mehr Gewicht, Farben bleiben auf Aktionen und kleine Status-/Schichtzeichen begrenzt.
- „Ansicht anpassen“ ist im Kopfbereich und am Ende der Übersicht erreichbar. Die native Seite erlaubt Ein-/Ausblenden, Umordnen und Wiederherstellen der Standardansicht. Auswahl, Reihenfolge und Schichtdarstellung werden gemeinsam für Monat und Jahr gespeichert.
- Die Schichtkarte wechselt zwischen Anzahl und Stunden. Jahreswerte summieren die vorhandenen Monatswerte einschließlich gültiger Abwesenheitsgutschriften; fehlende Regelabdeckung bleibt erkennbar.
- Zeitzuschläge führen im Monat direkt zur vorhandenen Aufschlüsselung. Im Jahr öffnet sich eine Monatsaufstellung mit Zugängen zu diesen Detailseiten. Manuelles Gehalt erhält keine erfundenen Zuschläge.
- Die SQLite-Präferenz verwendet die vorhandene Tabelle. Schreibvorgänge sind geordnet, Fehler mit Wiederholung sichtbar; alte Backups ergeben die Standardansicht, neue Backups erhalten die Auswahl. Der vorhandene Reset entfernt auch diese Präferenz.
- 31 Quelldateien gegenüber der vorigen Prüfungs-OTA geändert oder ergänzt. Alle 575 App-/Source-/Asset-/Regeldateien stimmen zwischen Implementierungs- und Liefercheckout bytegenau überein.
- `verify:fast` in beiden Checkouts erfolgreich: 761 Unit-Tests in 107 Dateien, 452 Komponententests in 82 Suites sowie alle jeweiligen Skriptprüfungen. Der kompatible iOS-Export ist erfolgreich. Graft wurde im Implementierungscheckout aktualisiert.
- Updategruppe: 91a5b6a5-d071-4703-b672-86cf8a8e06ef.
- iOS-Update: 01a0c11a-5e5e-7a33-9816-094a540df31a.
- [EAS-Update](https://expo.dev/accounts/vladularu/projects/pflegeshift/updates/91a5b6a5-d071-4703-b672-86cf8a8e06ef).
- Branch preview, Plattform ios, Runtime eac302484061dfb3fa63e2a74b8618ff6000861c (Preview-Build 31). Veröffentlichung und Runtime anschließend durch `update:list` bestätigt.
- Bundle: entry-3d247b1a493ba27e67b37ee5d2222feb.hbc; SHA256: 8513fddcf24430e1319be4af648d4d10644b69cad30ce7d46be998a60e81087b.
- Nachweise: artifacts/ota-analysis-lists und ota-analysis-lists-*.log im Liefercheckout; verification-list-layout-fast.log im Implementierungscheckout. Der unveränderte native Lieferstand bleibt auf ef3f4298800abc7c6f3f97baa76f7ce703e1b710 mit Expo 57.0.20; der Implementierungscheckout verwendet Expo 57.0.22.
- Kein Commit, Push, Merge oder neuer nativer Build. Native Abhängigkeiten und Konfiguration sind unverändert.
- Offen bleibt die visuelle iPhone-Abnahme: Monat/Jahr in Hell und Dunkel, große Schrift, Anpassungsseite, Neustart nach Umordnen, direkte Zuschlagsnavigation und Rückweg. Die Referenz-/HTML-Vorschau, Tests und EAS-Metadaten ersetzen diese Abnahme nicht.

## Feinschliff nach iPhone-Rückmeldung vom 21.09.2026

Ziel: Frühere Arbeitszeit-Kachel (Soll/Ist/Saldo, Referenz WorktimeCard im TestFlight-Kandidaten d8bdcac) wiederverwenden; Gehaltsbeträge bündig anordnen; Schichtdetails mit Anzahl und Stunden gemeinsam anzeigen; „Ansicht anpassen“ ruhiger gestalten.
Nicht-Ziele: Gehalts-/Arbeitszeitberechnungen, Datenbank, Themen oder Kalender verändern.
Zielplattform: iPhone, bestehender Preview-Build 31. Die vier aktuellen Nutzer-Screenshots bestätigen den vorherigen Stand und zeigen die nachzubessernden Stellen.
Arbeitspaket 1: Gemeinsame Arbeitszeit-Kachel und Gehaltszeilen, native Anpassungsansicht. Dateiscope: analysis-report-cards, dashboard-cards, analysis-list-card, analysis-view-controls und zugehörige Komponententests.
Arbeitspaket 2: Gemeinsame Schichtdetailtabelle, Monats-/Jahresdetailnavigation und Route-Tests. Dateiscope: Schichtdetailkomponente, month-/annual-overview, worktime-details-screen, annual-details-screen, annual-report-view, navigation/routes und zugehörige Tests.
Abnahme: Drei Arbeitszeitwerte wie im früheren Layout; gleiche rechte Betragskante trotz Zuschlagspfeil; Schichten führen direkt zu beiden Werten; Zeitraum und Zurücknavigation bleiben erhalten. Große Schrift, native Schalter mit vergrößerter Trefferfläche und Sortieraktionen mindestens 44 Punkte. Fehlende Abwesenheitsgutschriften bleiben als nicht verfügbar erkennbar.
Prüfung: Fokussierte Tests je Paket, verify:fast in Implementierungs- und Liefercheckout, kompatibler iOS-Export. Neue visuelle iPhone-Abnahme nach Bereitstellung bleibt erforderlich.
Auslieferung: Fortsetzung der freigegebenen Preview-OTA; kein Commit, Push, Merge oder neuer nativer Build. Umsetzung im bestehenden isolierten Branch codex/luna-darstellung-profil; ursprüngliche Änderungen bleiben erhalten.

### Arbeitszeit, Gehalt und Schichtdetails: Ergebnis und Preview-Folgeupdate

- Die Arbeitszeit-Kachel verwendet wieder die frühere dreispaltige Soll-/Ist-/Saldo-Darstellung aus WorktimeCard (Git-Referenz d8bdcac, TestFlight-Kandidat). Große Schrift ordnet die Werte untereinander an. Der Detailzugang bleibt erhalten. Die Komponente ist separat in worktime-card.tsx untergebracht und wird über die bestehende Schnittstelle weiterverwendet.
- Alle Gehaltsbeträge reservieren denselben Platz für den Detailpfeil. Damit liegen die Eurobeträge einschließlich Zeitzuschlägen und Gesamtsumme auf einer gemeinsamen rechten Kante.
- „Schichten“ öffnet im Monat und Jahr eine eigene Ansicht mit Anzahl und Stunden pro Schichtart gleichzeitig. Die Jahresansicht führt über die Monatszeilen zu den jeweiligen Schichtdetails; der gewählte Zeitraum bleibt erhalten. Dafür werden die vorhandenen Routen mit einem typisierten Bereich SHIFTS verwendet.
- Fehlende Urlaubs-/Krankheitsgutschriften erscheinen in dieser Tabelle als „Nicht verfügbar“. Die vorhandenen erfassten Zeiten und Zählwerte bleiben sichtbar; die Berechnungen sind unverändert.
- „Ansicht anpassen“ besitzt eine gemeinsame neutrale Karte, ausgerichtete Schalter, kleine Symbole und einen separaten Sortiermodus. Schalter und Reihenfolgeaktionen stehen nicht gleichzeitig in derselben Zeile. „Fertig“ und Zurücksetzen sind ruhig gestaltet. Große Schrift und vergrößerte Schalter-Trefferflächen sind berücksichtigt.
- 17 Quelldateien geändert oder ergänzt; alle 577 App-/Source-/Asset-/Regeldateien stimmen zwischen Implementierungs- und Liefercheckout bytegenau überein.
- verify:fast in beiden Checkouts erfolgreich: 762 Unit-Tests in 107 Dateien, 459 Komponententests in 82 Suites sowie die jeweiligen Skriptprüfungen. Gezielte Tests decken die Detailnavigation, unveränderte Monatswahl, gleichzeitige Werteanzeige, fehlende Gutschriften und Anpassungsansicht bei großer Schrift ab. Der iOS-Export ist erfolgreich und der Kontextgraph aktualisiert.
- Updategruppe: a2f4499c-6ee3-4058-94b0-79553f1375b6.
- iOS-Update: 01a0c132-eb51-7a6d-af3c-f44e3cf7fd11.
- [EAS-Update](https://expo.dev/accounts/vladularu/projects/pflegeshift/updates/a2f4499c-6ee3-4058-94b0-79553f1375b6).
- Branch preview, Plattform ios, Runtime eac302484061dfb3fa63e2a74b8618ff6000861c (Preview-Build 31). Gruppe, Plattform, Branch und Runtime nach Veröffentlichung durch update:list bestätigt.
- Bundle: entry-38175ebd47cc4241d65d514b8a0d8849.hbc; SHA256: 7c061e4e1f1d8ce5b6b0a10d0ee986b64074a8c4b84cd13f73412128023a187d.
- Nachweise: artifacts/ota-analysis-refinements und ota-analysis-refinements-_.log im Liefercheckout, artifacts/analysis-refinements und verification-analysis-refinements-_.log im Implementierungscheckout.
- Kein Commit, Push, Merge, Production-Update oder neuer nativer Build. Native Konfiguration und Abhängigkeiten unverändert.
- Die vier vom Nutzer übermittelten iPhone-Screenshots bestätigen den vorherigen Stand. Für dieses Folgeupdate bleiben neue iPhone-Screenshots in Hell/Dunkel und mit großer Schrift sowie die Kontrolle von Schichtnavigation und Anpassungsseite offen.

## Reduzierte Auswertung

Ziel: zentrierte Kartentitel, Arbeitszeit und Schichten ohne Detailnavigation, gespeicherte Schichtsymbole und Farben, Zuschlagsnavigation erst im Gehalt, Prüfung ohne doppelte Zusammenfassung und kürzere Anpassungsansicht. Plattform: iPhone, Hell/Dunkel und große Schrift. Scope: Analysekomponenten, Darstellungsmetadaten und zugehörige Tests. Berechnungen, native Konfiguration und Schichtdaten bleiben unverändert. Abnahme: Navigation und Summen abgesichert, verify:fast erfolgreich; Geräteabnahme separat.

### Reduzierte Auswertung: Umsetzung und Preview-Folgeupdate

- Kacheltitel sind symmetrisch zentriert. Arbeitszeit und Schichten besitzen in Monats- und Jahresübersicht keinen Detailzugang mehr; vorhandene direkte Routen bleiben kompatibel.
- Schichtzeilen verwenden die gespeicherten Namen, Farben und Symbole. Die bestehenden Summen bleiben nach Schichtart gruppiert. Bei mehreren unterschiedlichen Gestaltungen derselben Art bleiben deren Symbole erhalten, ohne Stunden doppelt zu zählen. Die Jahresaggregation übernimmt diese Darstellungsdaten.
- Zeitzuschläge sind in der Übersicht reine Werte. Ihr Detailzugang liegt in der monatlichen bzw. jährlichen Gehaltsseite.
- Monatliche und jährliche Prüfungsdetails beginnen mit dem Zeitraum ohne zusätzliche Zusammenfassungskachel. Meldungen, Leerzustände, verzögerte Berechnung und fehlende Regelstände bleiben unterscheidbar.
- Die Anpassungsansicht enthält keinen Erklärungstext oder Sichtbarkeitszähler mehr. Auswahl, Sortieren, Zurücksetzen und Fertig bleiben erhalten.
- 14 Quelldateien angepasst. Alle 577 Dateien unter app/src/assets/rules sind zwischen Umsetzung und Lieferung bytegenau identisch.
- verify:fast in beiden Checkouts erfolgreich: 763 Unit-Tests in 107 Dateien, 458 Komponententests in 82 Suites und die jeweiligen Skriptprüfungen. Der iOS-Export und der native Konfigurationsvergleich sind erfolgreich.
- [Preview-OTA](https://expo.dev/accounts/vladularu/projects/pflegeshift/updates/4f18ea6e-ed05-418b-8ac0-16c1f06b72a2): Gruppe 4f18ea6e-ed05-418b-8ac0-16c1f06b72a2; iOS-Update 01a0c149-f838-755b-9779-38e8a434918b. Branch preview, Plattform ios, Runtime eac302484061dfb3fa63e2a74b8618ff6000861c. Durch update:list bestätigt.
- Bundle entry-c2ca7bd507d450d6b99ff6d2e2e0fddc.hbc, SHA256 416ff0450a77cb811def4b095ad2d0cf07f0de875758adf4d4865c2b6f0eec85.
- Nachweise: artifacts/analysis-clean im Implementierungscheckout und artifacts/ota-analysis-clean im Liefercheckout.
- Keine Änderungen an nativen Abhängigkeiten oder Konfiguration; kein Commit, Push, Merge, Build oder Production-Update.
- Offen: visuelle iPhone-Abnahme dieses Updates in Hell/Dunkel und mit großer Schrift. Tests, Export und Veröffentlichung ersetzen diese Prüfung nicht.

## Prüfung als Tagesliste

Ziel: chronologische Tagesliste mit einzelnen Meldungen und Detailblatt; kräftigerer neutraler Text in allen Themes. Scope: neue Analysekomponenten, monatliche Prüfungsseite, Palette und Tests. iPhone, Hell/Dunkel, große Schrift. Keine Änderungen an Regeln, Berechnungen, Datenspeicherung oder nativen Abhängigkeiten. Jahresprüfung führt weiterhin über Monate zur Tagesliste. Abnahme: chronologische Sortierung, Filter, Schließen/Rückkehr, Dienstezuordnung, Leer-/Fehlerzustände, Theme-Kontraste und verify:fast; optische iPhone-Abnahme separat. Vorhandene Preview-OTA-Freigabe gilt fort; kein Git-/Production-Release.

### Tagesliste und Schriftkontrast: Preview-Ergebnis

- Die monatliche Prüfungsseite zeigt einzelne Meldungen chronologisch nach Tagen; bei gleichem Datum stehen kritische Meldungen zuerst. Gesetzlich/Planung bleibt eine kleine Zuordnung. Die Jahresprüfung führt weiterhin über Monate zu dieser Liste.
- Ein natives Detailblatt enthält die vollständige Erklärung sowie chronologisch sortierte betroffene Dienste mit ihren gespeicherten Farben und Symbolen. Schließen kehrt zur unveränderten Liste zurück. Ausgeblendete oder entfernte Meldungen schließen ein geöffnetes Detailblatt; fehlende Dienste werden kenntlich gemacht.
- Neutraler Text in allen fünf Themes: Haupttext Weiß bzw. #111315; sekundär #E2E3E7 bzw. #35383D; gedämpft #CDD0D6 bzw. #50545A. Flächen, Akzent-/Warnfarben und Schichtfarben bleiben bestehen.
- 8 Quelldateien geändert oder ergänzt; 580 Dateien unter app/src/assets/rules stimmen zwischen Umsetzung und Lieferung bytegenau überein.
- verify:fast in beiden Checkouts bestanden: 763 Unit-Tests (107 Dateien), 461 Komponententests (83 Suites) und Skriptprüfungen. Alle fünf Themes erfüllen die geprüften Textkontraste in Hell/Dunkel. Ein Zeitgrenzentest überschritt beim parallelen Erstlauf mit Export einmal 250 ms; der vollständige Wiederholungslauf ohne parallelen Export bestand unverändert.
- [Preview-OTA](https://expo.dev/accounts/vladularu/projects/pflegeshift/updates/1f5e9a71-5351-4dd3-8c48-5890d035d07a): Gruppe 1f5e9a71-5351-4dd3-8c48-5890d035d07a; iOS-Update 01a0c159-e276-724d-97c3-7a8d457bf75c. Branch preview, ios, Runtime eac302484061dfb3fa63e2a74b8618ff6000861c; nach Veröffentlichung durch update:list bestätigt.
- Bundle entry-d91bf74a974d8daafabbc3cd6e02c2d9.hbc; SHA256 85a1c03d5617ee73ef3b4a11ffc07feeb6e07a2ad94f8038aa81e300b1f01b51.
- Nachweise: artifacts/check-days im Implementierungscheckout und artifacts/ota-check-days im Liefercheckout. iOS-Export, Fingerprint und native Konfigurationsprüfung erfolgreich. Kein Commit, Push, Merge, Build oder Production-Update.
- Offen: iPhone-Abnahme dieser Variante in Hell/Dunkel, großer Schrift sowie Öffnen/Schließen des Detailblatts. Tests und OTA-Metadaten ersetzen keinen Gerätenachweis.

## Prüfung: Aufklappen, Abschluss und Datum

Ziel: Meldungen direkt aufklappen, Dienste mit gespeicherten Farben/Symbolen zeigen, mittiger großer Check bei abgeschlossenem leerem Ergebnis, deutsche Daten ohne Temporal-Lokalisierung und hellere/dunklere Beschriftungen. Scope: Prüfungskomponenten, Seitenanordnung, Palette und Tests. iPhone/Hell/Dunkel/große Schrift. Keine Regel-/Daten-/Native-Änderungen. Gates: Datum ohne Laufzeit-Lokalisierung, Auf-/Zuklappen, Filter, Ladezustände, Kontrast, verify:fast. iPhone-Abnahme nach Preview-OTA offen.

### Aufklappbare Prüfung und Abschlussansicht: Preview-Ergebnis

- Meldungen öffnen ihre Erklärung und betroffenen Dienste direkt unter der Zeile. Erneutes Antippen schließt sie. Farben und Symbole der Dienste bleiben erhalten; das separate Detailblatt entfällt.
- Ein vollständig berechnetes Ergebnis ohne sichtbare Meldungen zeigt ein 104-Punkt-Check-Symbol und den Abschlussstatus mittig im verfügbaren Bereich. Die Seite bleibt bei großer Schrift scrollbar. Fehler und Ladezustände bleiben getrennt.
- Deutsche Tagesdaten werden aus geprüften ISO-Daten zusammengesetzt, ohne Temporal.toLocaleString. Ein Regressionstest simuliert die fehlende Lokalisierungsunterstützung; gültige Daten bleiben lesbar, ungültige erhalten weiterhin den ehrlichen Fallback.
- Haupttext im Hellmodus #08090A, sekundärer Text #17191B, gedämpft #35383D. Im Dunkelmodus Haupt-/sekundärer Text #FFFFFF, gedämpft #ECEDEF. Flächen, Warnfarben und Schichtfarben unverändert.
- verify:fast in beiden Checkouts erfolgreich: 763 Unit-Tests in 107 Dateien, 463 Komponententests in 83 Suites sowie die jeweiligen Skriptprüfungen. iOS-Export und Laufzeitabgleich erfolgreich; 580 identische App-/Source-/Asset-/Regeldateien. Kontextgraph aktualisiert.
- [Preview-OTA](https://expo.dev/accounts/vladularu/projects/pflegeshift/updates/77935090-c8ca-4f65-9097-58005bbd4429): Gruppe 77935090-c8ca-4f65-9097-58005bbd4429, iOS-Update 01a0c169-446f-7963-b180-c224c07181ec. Branch preview, ios, Runtime eac302484061dfb3fa63e2a74b8618ff6000861c; anschließend durch update:list bestätigt.
- Bundle _expo/static/js/ios/entry-82f732b05d91fbb0c7e8ab3baded8373.hbc; SHA256 7fc073a8d51169a334875f488c727b104e376935c44d64cf918853312f64154f.
- Nachweise: artifacts/check-accordion und artifacts/ota-check-accordion. Keine nativen Änderungen, kein Commit, Push, Merge, Build oder Production-Update.
- Die drei aktuellen iPhone-Bilder belegen die Probleme des vorherigen Updates. Die Kontrolle dieser Korrektur auf dem iPhone, insbesondere Datum, Schrift, mittiger Abschluss und Aufklappen bei großer Schrift, bleibt offen.

## Git-Auslieferung am 21.09.2026

Der Nutzer hat den aktuellen Preview-Stand mit „ja passt vorerst so“ akzeptiert und anschließend Commit, Push, PR und Merge ausdrücklich freigegeben. Grundlage ist das Preview-Update 77935090-c8ca-4f65-9097-58005bbd4429. Die dokumentierte vollständige Geräte-Matrix bleibt getrennt von dieser Nutzerfreigabe; zusätzliche Abschluss-Screenshots liegen nicht vor. Scope: Themes, Arbeitsprofil, Monats-/Jahresauswertung, Prüfung, Zeitzuschläge, Datenspeicherung und Tests. Lokale Graft-Konfiguration und der ursprüngliche Arbeitsordner bleiben unberührt. Merge nur nach erfolgreicher PR-CI.
