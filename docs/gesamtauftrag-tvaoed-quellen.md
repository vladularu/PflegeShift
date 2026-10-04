# TVAöD-Pflege: erhaltene Quellentabellen

Stand: 2026-10-04. Drei-Dateien-Teilpaket des erhaltenen Gesamtauftrags.

## Ziel und Scope

Zwei ursprüngliche DRAFT-Pakete für April 2025 und Mai 2026 und dieser Beleg. Der bereits gemergte Vertrag 10 und seine Fachvalidierung sind unverändert. Kategorien b/c und Ausbildungsjahre bleiben ausdrücklich bestätigt; keine automatische Einstufung, App-Aktivierung oder OTA. Der Monatskern und sichtbare Profileingaben folgen getrennt.

Die zwölf Tabellenzellen wurden unabhängig mit pypdf und Decimal aus Seite 4 des frisch geladenen offiziellen TVAöD-Pflege-PDFs centgenau verglichen. Die sechs Kategorien-/Jahreswerte beider Zeitstände stimmen exakt. Alle 41 Kandidaten sind mit den bereits vorhandenen Fachvalidatoren geprüft; verify:fast bestand mit 3754 Unit- und 515 Komponententests. Sieben grüne CI-Prüfungen bleiben Merge-Gate.

Der vollständige ursprüngliche Vertragsreferenztest erwartet zusätzlich ausführbare Engine-Unterstützung 10. Seine 28 Fälle bleiben unverändert im Quellencheckout und im scoped Git-Stash erhalten; die zwei positiven Engine-Fälle werden mit dem vollständigen Monatskern geliefert. Das Datenpaket aktiviert Version 10 nicht vorzeitig.

## Aktuell überprüfte Originalquellen

- VKA TVAöD-Pflege ÄTV18, Stand 01.07.2025: https://vka.de/wp-content/uploads/2026/04/TVAOED_BT-Pflege_AETV_18_Lesefassung_Stand_01_07_2025.pdf
  SHA-256 477a4a2127a848de4d973b45fb893520a113e170d054440d4fcee5555146a48b.
- VKA TVAöD Allgemeiner Teil ÄTV14, Stand 01.08.2025: https://vka.de/wp-content/uploads/2026/04/TVAOED_AT_AETV_14_Lesefassung_Stand_01_08_2025.pdf
  SHA-256 352a1bf20827ad32ceacb3efdaf49712fb7bb4728a6e5a3de3bb105ff1a73f9c.

Beide PDFs wurden am 2026-10-04 erneut heruntergeladen und ihre Hashes mit den erhaltenen Metadaten verglichen. Sämtliche Norm-/Produktheuristikquellen bleiben im ursprünglichen Paket unterscheidbar erhalten. Unabhängige Fachfreigabe und Geräteabnahme stehen aus; AZ-03 wird dadurch nicht abgeschlossen.
