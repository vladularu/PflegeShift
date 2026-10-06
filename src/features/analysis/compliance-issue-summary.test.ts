import { describe, expect, it } from "vitest";
import type { ComplianceIssue } from "@/domain/types";
import { complianceIssueSummary } from "./compliance-issue-summary";

const finding = (rule: string, description: string): ComplianceIssue =>
  Object.freeze({
    id: "finding",
    rule,
    description,
    title: "Prüfhinweis",
    kind: "LEGAL",
    severity: "critical",
    date: "2026-08-05",
    relatedShiftIds: [],
  });

describe("compact compliance information", () => {
  it.each([
    [
      "ARBZG_5_REST_10H",
      "Zwischen den Diensten liegen nur 5.8 h Ruhezeit. Damit wird auch die für Krankenhäuser und Pflegeeinrichtungen mögliche Verkürzung auf 10 Stunden unterschritten.",
      "Nur 5,8 Std. Ruhezeit.",
    ],
    [
      "ARBZG_5_REST_10H",
      "Zwischen den Diensten liegen nur 8.0 h Ruhezeit.",
      "Nur 8 Std. Ruhezeit.",
    ],
    [
      "ARBZG_5_REST_10H",
      "Zwischen den Diensten liegen nur 9,5 h Ruhezeit.",
      "Nur 9,5 Std. Ruhezeit.",
    ],
    [
      "ARBZG_5_REST_11H",
      "Die Ruhezeit beträgt 10.5 h. In den eingetragenen Diensten wurde bis 17.10.2026 keine noch unbenutzte Ruhezeit von mindestens 12 Stunden als Ausgleich erkannt.",
      "Ruhezeit: 10,5 Std. · Ausgleich: mindestens 12 Std. Ruhezeit bis 17.10.2026.",
    ],
    [
      "ARBZG_4_BREAK",
      "Erfasst sind 30 Minuten Pause; erforderlich sind mindestens 45 Minuten.",
      "Pause: 30 Min. · nötig: 45 Min.",
    ],
    [
      "ARBZG_4_BREAK",
      "Erfasst sind 0 Minuten Pause; erforderlich sind mindestens 30 Minuten.",
      "Pause: 0 Min. · nötig: 30 Min.",
    ],
    [
      "ARBZG_4_INTERRUPTION",
      "20 Minuten zwischen Diensten könnten die fehlende Pause abdecken. Bitte die tatsächliche Pausenlage prüfen.",
      "Pausen prüfen: 20 Min. zwischen Diensten.",
    ],
    [
      "ARBZG_3_MAX_10H",
      "10.5 h Nettoarbeitszeit überschreiten die 10-Stunden-Grenze.",
      "10,5 Std. Arbeitszeit · Grenze: 10 Std.",
    ],
    [
      "ARBZG_3_OVER_8H",
      "9.0 h Nettoarbeitszeit erfordern einen zulässigen Ausgleichszeitraum.",
      "9 Std. Arbeitszeit · Ausgleich nötig.",
    ],
    [
      "ARBZG_4_CONTINUOUS",
      "Ein zusammenhängender Arbeitsblock überschreitet sechs Stunden ohne dokumentierte Ruhepause.",
      "Pausen im Arbeitsblock prüfen.",
    ],
    [
      "TIME_PLAUSIBILITY",
      "Die eingetragene Pause ist länger als die gesamte Brutto-Dienstzeit.",
      "Pause und Dienstzeiten prüfen.",
    ],
    [
      "TIME_GROSS_OVER_16H",
      "Die Brutto-Dienstzeit beträgt 17.5 h und sollte auf einen Eingabefehler geprüft werden.",
      "17,5 Std. Dienstzeit · Eingabe prüfen.",
    ],
    [
      "PLANNING_7_DAYS",
      "9 aufeinanderfolgende Arbeitstage wurden erkannt.",
      "9 Arbeitstage in Folge.",
    ],
    [
      "PLANNING_NIGHT_SERIES",
      "4 aufeinanderfolgende Nachtdienste wurden erkannt.",
      "4 Nachtdienste in Folge.",
    ],
    [
      "PLANNING_LATE_EARLY",
      "Die gesetzliche Ruhezeit ist eingehalten; die kurze Vorwärtsrotation sollte dennoch geprüft werden.",
      "Ruhezeit eingehalten · Dienstfolge prüfen.",
    ],
    [
      "PLANNING_WEEKENDS",
      "Prüfen, ob nach der Dienstplanregel jedes zweite Wochenende frei sein sollte.",
      "Prüfen, ob jedes zweite Wochenende frei sein sollte.",
    ],
  ])("keeps facts and actions visible for %s", (rule, description, summary) => {
    const original = finding(rule, description);
    expect(complianceIssueSummary(original)).toBe(summary);
    expect(original.description).toBe(description);
  });

  it.each([
    [
      "ARBZG_5_REST_10H",
      "Zwischen den Diensten liegen nur 5.8 h Ruhezeit. Eine neue wichtige Voraussetzung muss zuerst geklärt werden.",
    ],
    ["FUTURE_RULE", "Kurzer Hinweis. Wichtige neue Voraussetzung und Handlung bleiben sichtbar."],
    ["ARBZG_5_REST_10H", "Ruhezeit ist noch nicht bestimmt. Bitte fehlende Zeiten ergänzen."],
    [
      "ARBZG_5_REST_11H",
      "Die Ruhezeit beträgt 10.5 h. Eine neue Ausgleichsregel muss zuerst bestätigt werden.",
    ],
    [
      "JARBSCHG_UNKNOWN",
      "Erfasste Angaben fehlen. Eine konkrete Jugendregel kann noch nicht geprüft werden.",
    ],
    [
      "PLANNING_7_DAYS",
      "9 aufeinanderfolgende Arbeitstage wurden erkannt. Zusätzliche wichtige Angaben fehlen.",
    ],
  ])("preserves unfamiliar or extended text in full for %s", (rule, description) => {
    expect(complianceIssueSummary(finding(rule, description))).toBe(description);
  });
});
