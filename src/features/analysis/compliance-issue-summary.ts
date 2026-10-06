import type { ComplianceIssue } from "@/domain/types";

const hours = (value: string) => value.replace(".", ",").replace(/,0$/, "");

// Display only: keep complete explanations in the domain model and the disclosure.
// Match known engine wording; preserve unfamiliar wording in full.
export function complianceIssueSummary(issue: ComplianceIssue): string {
  const text = issue.description;
  let match: RegExpMatchArray | null;
  switch (issue.rule) {
    case "ARBZG_5_REST_10H":
      match = text.match(
        /^Zwischen den Diensten liegen nur (\d+(?:[.,]\d+)?) h Ruhezeit\.(?: Damit wird auch die für Krankenhäuser und Pflegeeinrichtungen mögliche Verkürzung auf \d+(?:[.,]\d+)? Stunden unterschritten\.)?$/,
      );
      if (match) return `Nur ${hours(match[1])} Std. Ruhezeit.`;
      break;
    case "ARBZG_5_REST_11H":
      match = text.match(
        /^Die Ruhezeit beträgt (\d+(?:[.,]\d+)?) h\. In den eingetragenen Diensten wurde bis (.+?) keine noch unbenutzte Ruhezeit von mindestens (\d+(?:[.,]\d+)?) Stunden als Ausgleich erkannt\.$/,
      );
      if (match)
        return `Ruhezeit: ${hours(match[1])} Std. · Ausgleich: mindestens ${hours(match[3])} Std. Ruhezeit bis ${match[2]}.`;
      break;
    case "ARBZG_4_BREAK":
      match = text.match(
        /^Erfasst sind (\d+) Minuten Pause; erforderlich sind mindestens (\d+) Minuten\.$/,
      );
      if (match) return `Pause: ${match[1]} Min. · nötig: ${match[2]} Min.`;
      break;
    case "ARBZG_4_INTERRUPTION":
      match = text.match(
        /^(\d+) Minuten zwischen Diensten könnten die fehlende Pause abdecken\. Bitte die tatsächliche Pausenlage prüfen\.$/,
      );
      if (match) return `Pausen prüfen: ${match[1]} Min. zwischen Diensten.`;
      break;
    case "ARBZG_3_MAX_10H":
      match = text.match(
        /^(\d+(?:[.,]\d+)?) h Nettoarbeitszeit überschreiten die (\d+(?:[.,]\d+)?)-Stunden-Grenze\.$/,
      );
      if (match) return `${hours(match[1])} Std. Arbeitszeit · Grenze: ${hours(match[2])} Std.`;
      break;
    case "ARBZG_3_OVER_8H":
      match = text.match(
        /^(\d+(?:[.,]\d+)?) h Nettoarbeitszeit erfordern einen zulässigen Ausgleichszeitraum\.$/,
      );
      if (match) return `${hours(match[1])} Std. Arbeitszeit · Ausgleich nötig.`;
      break;
    case "ARBZG_4_CONTINUOUS":
      if (
        /^Ein zusammenhängender Arbeitsblock überschreitet .+ Stunden ohne dokumentierte Ruhepause\.$/.test(
          text,
        )
      )
        return "Pausen im Arbeitsblock prüfen.";
      break;
    case "TIME_PLAUSIBILITY":
      if (text === "Die eingetragene Pause ist länger als die gesamte Brutto-Dienstzeit.")
        return "Pause und Dienstzeiten prüfen.";
      break;
    case "TIME_GROSS_OVER_16H":
      match = text.match(
        /^Die Brutto-Dienstzeit beträgt (\d+(?:[.,]\d+)?) h und sollte auf einen Eingabefehler geprüft werden\.$/,
      );
      if (match) return `${hours(match[1])} Std. Dienstzeit · Eingabe prüfen.`;
      break;
    case "PLANNING_7_DAYS":
      match = text.match(/^(\d+) aufeinanderfolgende Arbeitstage wurden erkannt\.$/);
      if (match) return `${match[1]} Arbeitstage in Folge.`;
      break;
    case "PLANNING_NIGHT_SERIES":
      match = text.match(/^(\d+) aufeinanderfolgende Nachtdienste wurden erkannt\.$/);
      if (match) return `${match[1]} Nachtdienste in Folge.`;
      break;
    case "PLANNING_LATE_EARLY":
      if (
        text ===
        "Die gesetzliche Ruhezeit ist eingehalten; die kurze Vorwärtsrotation sollte dennoch geprüft werden."
      )
        return "Ruhezeit eingehalten · Dienstfolge prüfen.";
      break;
    case "PLANNING_WEEKENDS":
      if (text === "Prüfen, ob nach der Dienstplanregel jedes zweite Wochenende frei sein sollte.")
        return "Prüfen, ob jedes zweite Wochenende frei sein sollte.";
      break;
  }
  return text;
}
