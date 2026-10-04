# Testlabor: Reihenfolge beim Monats-Restore

## Ziel und Scope

Drei Dateien: bestehender Restore, Regressionstest und Beleg. Der Gesamtcheckout sortiert bereits die angeforderten Monate; dieser Schritt übernimmt genau diese Abhängigkeit vor dem Zuschlagsspeicher. Spätere Arbeitsdatumsnachweise können auf einen Nachtdienst des Vormonats verweisen.

## Abnahme

Ein rückwärts angeforderter Dreimonatslauf stellt zuerst die früheren Dienste wieder her. Originaldaten, unveränderbare Anfrageliste, bestehende Transaktionsgrenze und Fehler-Rollbacks bleiben erhalten. Keine native, visuelle oder Tarifaktivierung.
