# Tarifwahl, Formdaten und vollständige Zulagenreferenzen

Stand: 2026-10-04. Fünfzehn-Dateien-Teilpaket des erhaltenen Gesamtauftrags.

## Ziel und Scope

Vier ursprüngliche reine Modelle für Tarifwahl, persönliche Formdaten, eigene Vergütung und datierte Zulagenbestätigung sowie neun vollständige ursprüngliche Referenztestdateien, eine synthetische Tarifwahlfixture und dieser Beleg. Plattformunabhängige Modelle; sichtbare Masken, Routen und native Integration folgen getrennt.

Tarifpakete, Bereiche, Regionen, Gruppen und vergütete Perioden kommen aus dem tatsächlich datierten Katalog. Eigene Beträge sind persönliche Angaben und werden mit ihren ausdrücklichen Teilmonats-/Zuschlagsregeln erhalten. Zulagenbestätigungen ersetzen nur die ausdrücklich gewählten Tage; Tarifwechsel erfordern getrennte Bestätigungen. Fehlende Angaben, unberechenbare Familien und nicht verfügbare Tabellen werden nicht durch benachbarte Werte ersetzt.

## Abnahme

Alle ursprünglichen positiven TVAöD-Grundbetrag-/Vertragsfälle, TV-L- und TVA-L-Zulagen-/Bestätigungsfälle sowie sämtliche ursprünglichen Modellkonvertierungen werden vollständig geliefert; zwei alte Auswahlfixture-Erwartungen werden an die bereits verbindlichen Vertrag-11-Konsistenzregeln angepasst. Der vorher scoped erhaltene 28-Fälle-Vertragsreferenztest wird vollständig ergänzt, nachdem der vollständige technische Vertrag-10-Monatskern geliefert ist. Pflichtcheck verify:fast, sieben grüne CI-Prüfungen und identischer geprüfter Dateibaum nach Vorgängermerge sind Gates.

## Grenzen

DRAFT-Pakete bleiben unveröffentlicht; keine App-Aktivierung oder OTA. Die reine Auswahl kann vorhandene technische DRAFT-Rechenkontexte prüfen, verbindet aber noch keine sichtbare App-Eingabemaske. Unabhängige Fachfreigabe und Geräteabnahme stehen aus; VG/AZ werden dadurch nicht insgesamt geschlossen.

## Kompatibilität der Testfixture

Die ursprüngliche synthetische Auswahlfixture wird auf den bereits gelieferten Gen-5-Stand 2026-05-r3 und Vertrag 11 umgestellt. Beide BT-B-Regionen des aktuellen Vertrags werden ausdrücklich hinterlegt. Die positive Metadatenreferenz erwartet genau die zwei deklarierten Regionen. Der verkleinerte Tabellenscope bleibt nur verfügbar, wenn die Jahresregeln denselben Gruppenscope besitzen; der widersprüchliche Zwischenstand wird zusätzlich ausdrücklich abgewiesen. Veralteter Vertrag 8 und das nicht vorhandene r2-Paket werden nicht erneut unterstützt. Dies verändert keine Referenzbeträge und keinen verteilbaren Tarifkandidaten. Die erhaltene ursprüngliche Fixture im Quellencheckout bleibt erhalten.
