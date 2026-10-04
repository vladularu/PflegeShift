import {
  validateOwnRemuneration,
  type OwnRemunerationConfiguration,
  type OwnRate,
  type OwnPartialMonth,
  type OwnTimePremium,
} from "@/domain/own-remuneration";
import { requireRemunerationDate } from "@/domain/remuneration-profile";
import { ValidationError } from "@/domain/validation";

export interface OwnRateDraft {
  kind: OwnRate["kind"];
  amount: string;
}
export interface OwnPremiumDraft {
  id: string;
  type: OwnTimePremium["type"];
  limited: boolean;
  start: string;
  end: string;
  rate: OwnRateDraft;
}
export interface OwnAllowanceDraft {
  id: string;
  title: string;
  amount: string;
  partialMonth: OwnPartialMonth;
  validFrom: string;
  validTo: string;
}
export interface OwnSpecialDraft {
  id: string;
  title: string;
  payoutMonth: string;
  entitlementMonths: string;
  kind: "fixed" | "percent";
  amount: string;
  basis: string;
  validFrom: string;
  validTo: string;
}
export interface OwnRemunerationDraft {
  baseKind: "monthly" | "hourly";
  partialMonth: OwnPartialMonth;
  percentageBasis: string;
  combination: "" | "add" | "highest";
  premiums: OwnPremiumDraft[];
  allowances: OwnAllowanceDraft[];
  overtime: null | { basePayIncluded: boolean; premium: OwnRateDraft | null };
  specialPayments: OwnSpecialDraft[];
}

export const ownDecimal = (scaled: number) => (scaled / 100).toFixed(2).replace(".", ",");
const clockText = (minutes: number) =>
  `${Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0")}:${(minutes % 60).toString().padStart(2, "0")}`;
const rateDraft = (rate: OwnRate): OwnRateDraft => ({
  kind: rate.kind,
  amount: ownDecimal(rate.kind === "percent" ? rate.basisPoints : rate.centsPerHour),
});

export function ownRemunerationDraft(config?: OwnRemunerationConfiguration): OwnRemunerationDraft {
  return {
    baseKind: config?.base.kind ?? "monthly",
    partialMonth: config?.base.kind === "monthly" ? config.base.partialMonth : "unconfirmed",
    percentageBasis:
      config?.percentageBasisHourlyCents == null
        ? ""
        : ownDecimal(config.percentageBasisHourlyCents),
    combination: config?.timePremiums?.combination ?? "",
    premiums: (config?.timePremiums?.rules ?? []).map((item) => ({
      id: item.id,
      type: item.type,
      limited: item.window !== null,
      start: item.window ? clockText(item.window.startMinute) : "",
      end: item.window ? clockText(item.window.endMinute) : "",
      rate: rateDraft(item.rate),
    })),
    allowances: (config?.fixedAllowances ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      amount: ownDecimal(item.monthlyCents),
      partialMonth: item.partialMonth,
      validFrom: item.validFrom,
      validTo: item.validTo ?? "",
    })),
    overtime: config?.overtime
      ? {
          basePayIncluded: config.overtime.basePayIncluded,
          premium: config.overtime.premium ? rateDraft(config.overtime.premium) : null,
        }
      : null,
    specialPayments: (config?.specialPayments ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      payoutMonth: String(item.payoutMonth),
      entitlementMonths: item.entitlementMonths == null ? "" : String(item.entitlementMonths),
      kind: item.amount.kind,
      amount: ownDecimal(
        item.amount.kind === "fixed" ? item.amount.cents : item.amount.basisPoints,
      ),
      basis:
        item.amount.kind === "percent" && item.amount.confirmedBasisCents !== null
          ? ownDecimal(item.amount.confirmedBasisCents)
          : "",
      validFrom: item.validFrom,
      validTo: item.validTo ?? "",
    })),
  };
}

export function ownNumber(text: string, label: string, max: number, min = 0): number {
  const value = text.trim();
  if (!/^\d+(?:[,.]\d{1,2})?$/u.test(value))
    throw new ValidationError(
      `${label}: Bitte eine Zahl mit höchstens zwei Nachkommastellen eingeben.`,
    );
  const [whole, fraction = ""] = value.replace(",", ".").split(".");
  const scaled = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(scaled) || scaled < min || scaled > max)
    throw new ValidationError(`${label}: Der Betrag liegt außerhalb des zulässigen Bereichs.`);
  return scaled;
}

export function ownBaseError(
  amount: string,
  kind: OwnRemunerationDraft["baseKind"],
): string | null {
  try {
    ownNumber(
      amount,
      kind === "monthly" ? "Monatsbrutto" : "Stundenlohn",
      kind === "monthly" ? 10_000_000 : 1_000_000,
      1,
    );
    return null;
  } catch (error) {
    if (error instanceof ValidationError) return error.message;
    throw error;
  }
}
function parseRate(rate: OwnRateDraft): OwnRate {
  return rate.kind === "percent"
    ? { kind: "percent", basisPoints: ownNumber(rate.amount, "Prozentsatz", 100_000) }
    : { kind: "hourly", centsPerHour: ownNumber(rate.amount, "Euro pro Stunde", 1_000_000) };
}
function parseClock(text: string): number {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(text.trim()))
    throw new ValidationError("Zuschlagszeit bitte als HH:MM eingeben.");
  const [hour, minute] = text.trim().split(":").map(Number);
  return hour * 60 + minute;
}
function parseDate(text: string, label: string): string {
  const value = text.trim();
  const de = /^(\d{2})\.(\d{2})\.(\d{4})$/u.exec(value);
  try {
    return requireRemunerationDate(de ? `${de[3]}-${de[2]}-${de[1]}` : value);
  } catch {
    throw new ValidationError(`${label}: Bitte ein gültiges Datum (TT.MM.JJJJ) eingeben.`);
  }
}
function validity(item: { validFrom: string; validTo: string }) {
  const validFrom = parseDate(item.validFrom, "Gültig ab");
  const validTo = item.validTo.trim() ? parseDate(item.validTo, "Gültig bis") : null;
  if (validTo && validTo < validFrom)
    throw new ValidationError("Gültig bis darf nicht vor Gültig ab liegen.");
  return { validFrom, validTo };
}
function name(text: string): string {
  const result = text.trim();
  if (!result || result.length > 100 || /[\u0000-\u001f\u007f]/u.test(result))
    throw new ValidationError("Bitte eine Bezeichnung mit 1 bis 100 Zeichen eingeben.");
  return result;
}
function integer(text: string, label: string, min: number, max: number): number {
  if (!/^\d{1,2}$/u.test(text.trim()) || Number(text) < min || Number(text) > max)
    throw new ValidationError(
      `${label}: Bitte eine ganze Zahl zwischen ${min} und ${max} eingeben.`,
    );
  return Number(text);
}

export function ownConfigurationFromDraft(
  draft: OwnRemunerationDraft,
  amount: string,
): OwnRemunerationConfiguration {
  if (draft.premiums.length && !draft.combination)
    throw new ValidationError("Bitte auswählen, wie zusammentreffende Zuschläge behandelt werden.");
  return validateOwnRemuneration({
    base:
      draft.baseKind === "monthly"
        ? {
            kind: "monthly",
            personalCents: ownNumber(amount, "Monatsbrutto", 10_000_000, 1),
            partialMonth: draft.partialMonth,
          }
        : { kind: "hourly", centsPerHour: ownNumber(amount, "Stundenlohn", 1_000_000, 1) },
    percentageBasisHourlyCents:
      draft.baseKind === "monthly" && draft.percentageBasis.trim()
        ? ownNumber(draft.percentageBasis, "Bestätigte Stundenbasis", 1_000_000, 1)
        : null,
    timePremiums: draft.premiums.length
      ? {
          combination: draft.combination,
          rules: draft.premiums.map((item) => {
            const window =
              item.type === "night" || item.limited
                ? { startMinute: parseClock(item.start), endMinute: parseClock(item.end) }
                : null;
            if (window && window.startMinute === window.endMinute)
              throw new ValidationError(
                "Beginn und Ende des Zuschlagszeitraums müssen verschieden sein.",
              );
            return { id: item.id, type: item.type, window, rate: parseRate(item.rate) };
          }),
        }
      : null,
    overtime: draft.overtime
      ? {
          basePayIncluded: draft.overtime.basePayIncluded,
          premium: draft.overtime.premium ? parseRate(draft.overtime.premium) : null,
        }
      : null,
    fixedAllowances: draft.allowances.map((item) => ({
      id: item.id,
      title: name(item.title),
      monthlyCents: ownNumber(item.amount, "Monatliche Zulage", 10_000_000),
      partialMonth: item.partialMonth,
      ...validity(item),
    })),
    specialPayments: draft.specialPayments.map((item) => ({
      id: item.id,
      title: name(item.title),
      payoutMonth: integer(item.payoutMonth, "Auszahlungsmonat", 1, 12),
      entitlementMonths: item.entitlementMonths.trim()
        ? integer(item.entitlementMonths, "Anspruchsmonate", 0, 12)
        : null,
      amount:
        item.kind === "fixed"
          ? { kind: "fixed", cents: ownNumber(item.amount, "Sonderzahlung", 100_000_000) }
          : {
              kind: "percent",
              basisPoints: ownNumber(item.amount, "Prozentsatz", 100_000),
              confirmedBasisCents: item.basis.trim()
                ? ownNumber(item.basis, "Bemessungsbetrag", 100_000_000)
                : null,
            },
      ...validity(item),
    })),
  });
}

export function nextOwnId(items: readonly { id: string }[], prefix: string): string {
  let number = 1;
  while (items.some((item) => item.id === `${prefix}-${number}`)) number++;
  return `${prefix}-${number}`;
}
