# 9H-B2 – Monatszuordnung und Abwesenheitsnachweise

> Statusabgleich 12.09.2026: Paket abgenommen und über [PR #69](https://github.com/vladularu/PflegeShift/pull/69) integriert. Aktueller Status und verbleibende Prüfpunkte stehen in der [zentralen Roadmap](roadmap.md). Die folgenden Freigaben, offenen Abnahmen und Implementierungsbeschreibungen dokumentieren den damaligen Arbeitsstand; sie sind keine neuen Aufträge und kein Beleg für den heutigen Code. Fachliche Grenzen bleiben maßgeblich, soweit spätere Pakete sie nicht ausdrücklich ersetzen.

## Vertrag

Ziel: isolierter, unveränderlicher TypeScript-Kern zur Prüfung vorgeschlagener BT-K-Monatsnachweise; keine vollständige Anspruchs- oder Gehaltsentscheidung. Expo ~57.0.20, Referenz https://docs.expo.dev/versions/v57.0.0/sdk/updates/. Spätere Zielplattform iOS; jetzt keine native oder visuelle Änderung.

Dateiscope: `src/engine/tvoed-k-month-evidence.ts`, zugehörige Tests und dieses Dokument. B1, produktives Gehalt, UI, Datenbank, Tarifpakete und manuelle Monatsentscheidungen bleiben unverändert. Commit, Push und PR sind freigegeben. Keine wirkungslose OTA für einen nicht produktiv importierten Kern; kein neuer Build. Merge erst nach gesonderter Abnahme/Freigabe.

## Quellen und fachliche Grenzen

- BAG 6 AZR 191/17, Rn. 16–25: https://www.bundesarbeitsgericht.de/entscheidung/6-azr-191-17/
- BAG 10 AZR 58/09, insbesondere Rn. 13 und 18: https://www.bundesarbeitsgericht.de/entscheidung/10-azr-58-09/
- TVöD-AT § 21, Stand 01.01.2026: https://vka.de/wp-content/uploads/2026/04/TVoeD_AT_AETV_22_Lesefassung_Stand_01_01_2026.pdf
- BT-K § 48 Abs. 2: https://vka.de/wp-content/uploads/2026/04/BT-K_AETV_15_Lesefassung_Stand-01_01_2026.pdf

Eine bereits angerechnete Nacht darf nicht erneut als Folgebeleg vergeben werden, bleibt aber möglicher Fristanker. B1 liefert die Zeitfenster. Ein Monatsvorschlag benennt einen Anker und genau zwei Folgebelege. Innerhalb eines Monats wird die konkrete Auswahl geprüft, nicht automatisch ein beliebiges Paar gewählt. Grenzüberschreitende Zuordnung verlangt zusätzlich eine explizite fachliche Nachweisreferenz. Diese Referenz ist eine Zusicherung des Aufrufers, keine vom Programm verifizierte Rechtsquelle. Der Kern erfindet insbesondere keine allgemeine Regel „Monat der zweiten Nacht“.

`SUPPORTED` bedeutet ausschließlich: der vorgeschlagene Nachtdienstnachweis ist unter den angegebenen Voraussetzungen konsistent. Es bestätigt weder ständige Wechselschichtarbeit noch 24/7-Einsatz, regelmäßigen Wechsel, einen Eurobetrag oder den vollständigen Monatsanspruch. `REVIEW` ist niemals eine Gehaltskürzung oder Anspruchsablehnung. Selbst ein vollständig leerer Zeitraum ergibt keinen vollständigen negativen Anspruchsentscheid.

## Eingaben und Wiederberechnung

- Vollständiger Beobachtungszeitraum mit qualifizierten tatsächlichen Nachtminuten wie in B1, einschließlich nötiger Vor-/Folgezeiträume.
- Lückenlos aufeinanderfolgende Monatsvorschläge; unsortierte Eingaben werden chronologisch verarbeitet, doppelte/übersprungene Monate zurückgewiesen.
- Eröffnungsbestand früher zugeteilter Folgebelege und ausdrückliche Zusicherung, dass dieser Bestand vollständig ist. Leere Liste allein genügt nicht. Historische IDs dürfen außerhalb des Beobachtungszeitraums liegen.
- Pro Aufruf wird alles neu aufgebaut. Änderungen/Löschungen können keine intern gecachten Zuordnungen erhalten. Nach einem ungeklärten Monat bleiben spätere Monate konservativ offen; keine spekulative Weitervergabe. Der spätere Adapter muss bei Änderungen auch den betroffenen Eröffnungsbestand neu herstellen, statt alte Ausgaben ungeprüft wieder einzuspeisen.

## Abwesenheiten

Getrennte Nachweise enthalten Intervall, Entgeltfortzahlung nach § 21, die ohne Freistellung erforderliche Schichtarbeit und eine Nachweisreferenz. Ein Urlaub-/Krank-Label ersetzt diese Informationen nicht. Keine Diagnosen oder automatische Sechswochenberechnung.

Sind beide Tatsachen ausdrücklich bestätigt und belegt, lautet der separate Nachweis `CONTINUATION_SUPPORTED`. Sonst `REVIEW`, auch bei unbezahlter/ungeklärter Abwesenheit. Es werden keine tatsächlich geleisteten Nächte erfunden und keine Zeitgutschriften erzeugt. Ein betroffener Monatsnachweis bleibt insgesamt `REVIEW`: die Verbindung der Fortzahlung mit der vollständigen Anspruchsprüfung ist noch nicht produktiv implementiert. Auch vollständig belegte Fortzahlung umgeht weder Doppelverwendung noch offene Vormonate. Abwesenheiten im Monat oder im zugehörigen Fristfenster sind relevant; Intervallenden sind exklusiv.

## Abnahmekriterien

Referenztest der BAG-Juli-Termine mit ausdrücklich angenommenen Uhrzeiten; Monats-/Jahreswechsel; Doppelverwendung; erlaubte Ankerwiederverwendung; fehlende Nachweise; bezahlte/ungeklärte Abwesenheiten; Grenzen; Änderung/Löschung mit Folgeabhängigkeiten; deterministische unveränderliche Ergebnisse; ungültige Eingaben. Fokussierte B1/B2-Tests und `npm.cmd run verify:fast` müssen grün sein. Bestehende Gehalts- und Komponententests laufen unverändert mit.

Produktive Anbindung bleibt gesondert: Beschaffung/Bestätigung fehlender Tatsachen, Eröffnungsbestand und Monatsvorschläge, Nachweisrevisionen, Fortzahlungsintegration, weitere Anspruchsmerkmale, Teilzeit/Beträge, nachvollziehbare Anzeige. Erst dann eine gemeinsame Preview-OTA und echte Geräteabnahme. B2 allein ist noch keine vollautomatische monatliche Zulagenberechnung.
