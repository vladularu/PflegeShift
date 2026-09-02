# LUNA Shift Entwicklungsworkflow

Dieser Ablauf hält Änderungen klein, überprüfbar und auf dem Zielgerät abnehmbar.

## 1. Task-Vertrag

Vor der Implementierung werden diese Punkte festgehalten:

```text
Ziel:
Nicht-Ziele:
Zielplattform und Zielgerät:
Erlaubter Dateiscope:
Akzeptanzkriterien:
Benötigte Screenshots oder Videos:
Commit, Push, Build oder OTA erlaubt: Nein, sofern nicht ausdrücklich freigegeben
```

Eine Aufgabe umfasst einen Nutzerfluss. Wenn UI, Fachlogik und native Integration gemeinsam betroffen sind oder voraussichtlich mehr als 15 Dateien geändert werden, wird sie vor der Implementierung geteilt.

## 2. Ablauf und Gates

1. **Analyse:** Git-Status, relevante Implementierung, Tests und genaue Fehlersymptome read-only prüfen.
2. **Scope:** Lösung, betroffene Dateien, Risiken und Abnahmekriterien bestätigen.
3. **Branch:** Von aktuellem `master` einen kurzlebigen Branch `codex/<thema>` erstellen.
4. **Implementierung:** Nur den bestätigten Scope ändern; fachliche Regressionen zuerst durch Tests absichern.
5. **Schnelles Gate:** `npm.cmd run verify:fast` sowie relevante fokussierte Tests ausführen.
6. **Native Abnahme:** UI-, Safe-Area-, SQLCipher- und andere Native-Änderungen im passenden Development- oder Preview-Build prüfen.
7. **Pull Request:** Scope, Tests und Gerätenachweise dokumentieren; vollständige CI abwarten.
8. **Veröffentlichung:** Merge, Push, EAS Build, OTA oder Store-Schritt nur im ausdrücklich freigegebenen Umfang durchführen.

Wenn der Scope während der Umsetzung wächst, ein Zielgerät fehlt oder das reale Geräteergebnis den Tests widerspricht, wird vor weiteren Änderungen angehalten und neu eingegrenzt.

## 3. Prüfbefehle

Für die normale Entwicklung:

```powershell
npm.cmd run verify:fast
git status --short
git diff --check
```

Vor Release-Kandidaten oder größeren Integrationen:

```powershell
npm.cmd run verify:full
```

`verify:full` prüft zusätzlich Coverage, Produktionsabhängigkeiten, Release-Konfiguration und alle Plattform-Exporte. Signierte Builds und reale Gerätetests bleiben separate Gates.

## 4. Visuelle Abnahme

Für iPhone-Änderungen werden Gerät, Viewport, App-Build beziehungsweise OTA-ID und Zustand dokumentiert. Vor einem weiteren visuellen Korrekturversuch wird das Ergebnis der vorherigen Version mit Screenshot oder Video bestätigt. Ein erfolgreicher Upload beweist nur die Verteilung, nicht das sichtbare Ergebnis auf dem Gerät.

## 5. Abschluss

Ein Task ist abgeschlossen, wenn:

- die vereinbarten Akzeptanzkriterien erfüllt sind,
- schnelle und erforderliche vollständige Gates bestanden sind,
- native oder visuelle Änderungen auf dem Zielgerät bestätigt sind,
- `git status --short` nur beabsichtigte Änderungen zeigt,
- offene Punkte und nicht geprüfte Plattformen ausdrücklich benannt sind.

## 6. Schutz für `master`

Wenn der GitHub-Tarif Rulesets für private Repositorys unterstützt, wird der Standardbranch dort geschützt:

- Änderungen nur über Pull Requests,
- erforderlicher Statuscheck `quality-gates`,
- kein Force-Push,
- kein Löschen des Branches.

Da dieser Schutz nicht in jedem privaten GitHub-Tarif verfügbar ist, enthält das Repository zusätzlich einen lokalen Pre-Push-Hook. Er wird einmal pro Checkout aktiviert:

```powershell
npm.cmd run workflow:setup
```

Der Hook blockiert direkte lokale Pushes nach `master`. Er ersetzt keine serverseitige Regel und kann nicht verhindern, dass andere Geräte oder Benutzer ohne aktivierten Hook direkt pushen.
