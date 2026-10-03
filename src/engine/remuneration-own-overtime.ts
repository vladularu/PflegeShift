import type { OwnRemunerationConfiguration } from "@/domain/own-remuneration";
import type { SupplementPosition } from "@/domain/remuneration-supplement";
import { roundRemunerationCents } from "./remuneration-money";

/** Personal agreements only; never derive a TVöD divisor or an entitlement. */
export function calculateOwnOvertime(
  position: SupplementPosition,
  configuration: OwnRemunerationConfiguration,
): readonly SupplementPosition[] {
  const extra = configuration.overtime;
  const missing = (
    line: SupplementPosition,
    message: string,
    code: "OWN_OVERTIME_UNCONFIGURED" | "OVERTIME_RATE_MISSING" = "OVERTIME_RATE_MISSING",
  ): SupplementPosition => ({
    ...line,
    amountCents: null,
    status: "unavailable",
    issue: { code, message },
  });
  if (!extra)
    return [
      missing(
        position,
        "Bitte die Auszahlungsregeln für eigene Mehr- und Überstunden einrichten.",
        "OWN_OVERTIME_UNCONFIGURED",
      ),
    ];
  const hourly = configuration.base.kind === "hourly";
  const rate =
    configuration.base.kind === "hourly"
      ? configuration.base.centsPerHour
      : configuration.percentageBasisHourlyCents;
  let base: SupplementPosition = {
    ...position,
    label: extra.basePayIncluded
      ? "Überstunden-Grundvergütung bereits enthalten"
      : "Eigene Überstunden-Grundvergütung",
    amountCents: 0,
    basis: { ...position.basis, rateCents: extra.basePayIncluded ? null : rate },
  };
  if (hourly && !extra.basePayIncluded) {
    base = missing(
      base,
      "Beim Stundenlohn sind alle erfassten Dienstminuten bereits bezahlt. Bitte für Überstunden „Grundvergütung bereits enthalten“ bestätigen; sie darf nicht nochmals addiert werden.",
      "OWN_OVERTIME_UNCONFIGURED",
    );
  } else if (!extra.basePayIncluded) {
    base =
      rate === null
        ? missing(
            base,
            "Bitte den Stundenwert für die zusätzliche Überstunden-Grundvergütung bestätigen.",
          )
        : { ...base, amountCents: roundRemunerationCents(rate * position.basis.minutes, 60) };
  }
  if (!extra.premium) return [base];
  const premium = extra.premium;
  const line: SupplementPosition = {
    ...position,
    id: position.id + ":premium",
    kind: "overtime-premium",
    label: "Eigener Mehr-/Überstundenzuschlag",
    basis: {
      ...position.basis,
      rateCents: premium.kind === "hourly" ? premium.centsPerHour : rate,
      percentageBasisPoints: premium.kind === "percent" ? premium.basisPoints : null,
    },
  };
  if (premium.kind === "percent" && premium.basisPoints > 0 && rate === null)
    return [
      base,
      missing(line, "Bitte die Stundenbasis für den prozentualen Überstundenzuschlag bestätigen."),
    ];
  return [
    base,
    {
      ...line,
      amountCents:
        premium.kind === "hourly"
          ? roundRemunerationCents(premium.centsPerHour * position.basis.minutes, 60)
          : roundRemunerationCents(
              (rate ?? 0) * premium.basisPoints * position.basis.minutes,
              60 * 10_000,
            ),
    },
  ];
}
