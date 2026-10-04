# Vollständige ursprüngliche datierte Gehaltsformulare

## Task-Vertrag

Ziel: Die erhaltenen datierten Vergütungsformulare und alle vollständigen ursprünglichen Formularnachweise liefern.
Dateiscope: Zehn vollständige ursprüngliche neue Code-/Testdateien und dieser Beleg (elf Dateien).
Plattform: Expo-SDK57-Formulare für iPhone; bestehende gemeinsame Eingabekomponenten und Palette.
Abnahme: Originalidentität, vollständiger ursprünglicher Komponententest, vorhandene Tarif-/Vergütungsregressionen, verify:fast und sieben grüne PR-CI-Prüfungen. Die neue sichtbare Einstellungen-Anbindung folgt gesondert und benötigt echte iPhone-Abnahme vor UI-Merge.
Nicht-Ziele: Neue visuelle Richtung, Aktivierung nicht freigegebener Tarife, native Änderungen, Build und OTA.

## Datierte Eingaben

Neue Angaben gelten ab einem ausdrücklich bestätigten Datum. Eine Korrektur bearbeitet den gewählten bestehenden Stand mit seiner erwarteten Revision; für einen Wechsel wird ein neuer Stand angelegt. Übernommene undatierte Angaben dienen nur als Vorlage.
Katalogwechsel erfordern ausdrückliche Übernahme des aktuellen Katalogs vor Speichern. Loading, Lesefehler, Revisionkonflikt, Doppelbetätigung und Unmount dürfen keine fehlerhaften oder mehrfachen Schreibvorgänge auslösen; Eingaben bleiben bei Fehler erhalten.
Tarifoptionen stammen aus dem aktuellen datierten Resolver, einschließlich Gruppen-/Stufen- und Ausbildungszeitraum-Auswahl. Bei abhängigen Auswahlwechseln werden fachliche Folgeangaben geleert; Ausbildungsjahrwechsel werden nicht automatisch behauptet. DRAFT-/UNSUPPORTED-Regeln bleiben gesperrt.
Eigene monatliche Vergütung bleibt der persönliche Betrag ohne erneute Teilzeitkürzung. Stundenlohn, Zuschlagsbasis, feste Zulagen, Überstunden und Sonderzahlungen werden getrennt mit ihren bestätigten Grundlagen, Zeiträumen und Anspruchsmonaten eingegeben.
TV-L-/TVA-L-Pflegevoraussetzungen werden ausdrücklich als persönliche bestätigte oder ungeklärte Tatsachen behandelt, nicht aus Berufsname, Bundesland oder Gruppe abgeleitet.

## Originalerhalt und Integration

Alle neun neuen Produktionsdateien werden vollständig aus dem autoritativen Gesamtcheckout übernommen und auf Normalisierung der Zeilenenden identisch geprüft. Der vollständige ursprüngliche Komponententest bleibt mit allen 38 Fällen erhalten. Zwei Fixtures werden an den aktuellen REVIEWED-r3-Vertrag angepasst: Ein synthetischer Kandidat ohne die in Vertrag 11 erforderliche zweite BT-B-Region muss insgesamt gesperrt sein; ein Remote-Paket ohne P5 widerspricht seinen jährlichen Gruppenreferenzen und muss insgesamt gesperrt sein. Die Sperre und das Ausbleiben jeder Speicherung werden ausdrücklich geprüft. Die unveränderte Originalfassung bleibt im Gesamtcheckout erhalten. Die bereits gelieferten Werte-, Tarifoptions- und eigenen Vergütungsmodelle werden erhalten.
Dieses Paket montiert die Formulare noch nicht in der bestehenden Einstellungen-Route. Die vollständige App-Verbindung und Geräteprüfung erfolgen in einem eigenen begrenzten Integrationspaket; der vorhandene Gehaltspfad bleibt bis dahin erreichbar.

## Prüfergebnis

Alle 38 vollständigen ursprünglichen Formularfälle grün; verify:fast mit 4980 Unit- und 574 Komponententests bestanden. Die neun Produktionsdateien sind originalidentisch. Sichtbare Einbindung und iPhone-Nachweis folgen noch.
