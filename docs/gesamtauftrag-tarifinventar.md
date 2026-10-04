# Tarif- und Quelleninventar aus dem Originalauftrag

Stand: 2026-10-04, Expo SDK 57 (~57.0.22).

## Vertrag

Ziel: das vollständig gelesene Originalinventar unverändert übernehmen und in die Pflichtprüfungen aufnehmen. Fünf Dateien: Originalskript und dessen Originaltests, genau drei npm-Script-Ergänzungen, dieser Beleg und der reproduzierbare Bericht zum 2026-10-04. Plattform: lokales Node/PowerShell-Werkzeug, keine UI oder native Änderung.

## Abnahme

Alle gültigen lokalen LEGACY-/REVIEWED-/DRAFT-Pakete werden vollständig gelesen; ungültige Pakete oder Pfade dürfen nicht still verschwinden. Bericht nennt Paket-/Vertrags-/Reviewstatus, Gültigkeitszeitraum, die 90-Tage-Prüffrist und vollständige Quellen mit Hash. Ein offenes Ende ist keine Aktualitätsgarantie, DRAFT keine aktivierte Tarifunterstützung. Alle sechs Caritas-RK und die 13 DRK-Quellenpakete müssen enthalten sein. Bestehende Regeln, Abhängigkeiten und Aktivierungsgrenzen bleiben unverändert.

## Pflichtcheck

Fünf ursprüngliche Node-Testfälle, Bericht beider Formate mit festem Datum und verify:fast einschließlich neuem test:tariff-inventory. Genau sieben CI-Prüfungen vor Merge. Kein Netzwerkzugriff des Berichtswerkzeugs, keine Veröffentlichung von Tarifen oder OTA.

## Ergebnis

Fünf Originaltests unverändert grün. Bericht mit festem Datum in Markdown und JSON: 48 Tarifpakete, alle sechs Caritas-RK, 13 DRK-Pakete, zwei REVIEWED- und 44 DRAFT-Pakete sowie zwei Legacy-Pakete. verify:fast auf master mit PR #251 vollständig grün: 5.568 Unit-, 542 Komponententests, neue fünf Inventarfälle und alle übrigen Skriptprüfungen. Der gemeinsame Stand mit gemergtem Vertrags-PR #252 ist vollständig geprüft: verify:fast grün mit 5.693 Unit-, 542 Komponententests, fünf Inventarfällen und sämtlichen weiteren Skriptprüfungen.
