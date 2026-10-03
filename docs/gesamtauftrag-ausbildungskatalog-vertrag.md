# Ausbildungskatalog: explizite Kategorien und Ausbildungsjahre

## Auftrag

- Ziel: Vertrag 10 und die Ausbildungsvariante von Vertrag 11 validieren, als Voraussetzung der vorbereiteten Jahresberechnung.
- Plattform: gemeinsamer TypeScript-Katalogvertrag für Publisher und iOS/Android/Web.
- Abgrenzung: keine Tarifdatensätze, persönliche Anspruchsannahmen, UI-Anbindung, Fachfreigabe oder Veröffentlichung.
- Scope: zwei Schemas, zwei generierte Dateien, drei Validatoren, synthetische Fixture und Integrationstest, dieser Beleg.
- Abnahme: explizite Kategorie/Jahr-Paare und Quellen; fehlende oder doppelte Werte, Arbeitnehmer-Stufenkappung und fremde Tarifidentität werden abgelehnt. Bestehende TVöD-P- und Caritas-Verträge bleiben geschützt. Gezielte Tests, verify:fast und sieben PR-Prüfungen.

## Technische Grenzen

Vertrag 10 beschreibt Ausbildungsentgelt ohne Jahreszahlung. Vertrag 11 benötigt vollständige Jahresbedingungen. Die Ausbildungsidentität ist auf TVAöD-Pflege VKA mit BT-K/BT-B begrenzt. Der allgemeine App-Resolver unterstützt Vertrag 10 erst nach der folgenden Engine-Anbindung. Die Tests verwenden ausdrücklich synthetische Beträge; sie sind keine veröffentlichten Tarifwerte.
