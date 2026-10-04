import { Temporal } from "@js-temporal/polyfill";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import { ValidationError } from "@/domain/validation";
import {
  isCaritasAnnualPackageId,
  validateTariffAnnualClaim,
  type AnnualBasisMonth,
  type TariffAnnualClaim,
} from "@/domain/tariff-annual-claim";
import {
  validateActualTariffAnnualPayment,
  type SavedTariffAnnualClaim,
  type SaveTariffAnnualClaimInput,
} from "@/domain/saved-tariff-annual-claim";
import { ownDecimal, ownNumber } from "@/features/settings/own-remuneration-form";
import { annualPaymentYear, annualPayoutText } from "./annual-payment-model";

export interface TariffAnnualChoice {
  readonly key: string;
  readonly title: string;
  readonly selection: TariffAnnualClaim["selection"];
}
export function tariffAnnualSelectionKey(selection: TariffAnnualClaim["selection"]): string {
  return JSON.stringify([
    selection.packageId,
    selection.variant,
    selection.region,
    selection.group,
  ]);
}

function resetTariffAnnualSelection(
  selection: TariffAnnualClaim["selection"],
): TariffAnnualClaim["selection"] {
  const { groupAtSeptember1Confirmed: _previous, ...identity } = selection;
  return {
    ...identity,
    confirmed: false,
    ...(isCaritasAnnualPackageId(selection.packageId) ? { groupAtSeptember1Confirmed: false } : {}),
  };
}
export interface TariffAnnualSession {
  readonly claim: TariffAnnualClaim;
  readonly saved: SavedTariffAnnualClaim | null;
  readonly profilesToken: string;
}
type BasisDraft = Omit<
  AnnualBasisMonth,
  "baseCents" | "fixedCents" | "variableCents" | "scheduledOvertimeCents" | "paidCalendarDays"
> & {
  baseCents: string;
  fixedCents: string;
  variableCents: string;
  scheduledOvertimeCents: string;
  paidCalendarDays: string;
};
export interface TariffAnnualDraft {
  claim: TariffAnnualClaim;
  start: string;
  end: string;
  birthYear: string;
  numerator: string;
  denominator: string;
  lastFullPayMonth: string;
  adjustedAmount: string;
  takeoverAmount: string;
  months: readonly BasisDraft[];
  actual: boolean;
  actualAmount: string;
  payout: string;
}

export function tariffAnnualChoices(
  profiles: readonly DatedRemunerationProfile[],
  year: number,
): readonly TariffAnnualChoice[] {
  const sorted = [...profiles].sort((a, b) =>
    (a.effectiveFrom ?? "").localeCompare(b.effectiveFrom ?? ""),
  );
  const choices = new Map<string, TariffAnnualChoice>();
  for (const [index, profile] of sorted.entries()) {
    const s = profile.data.selection;
    const next = sorted[index + 1]?.effectiveFrom;
    if (
      s.kind !== "tariff" ||
      (profile.effectiveFrom !== null && profile.effectiveFrom > `${year}-12-31`) ||
      (next && next <= `${year}-01-01`)
    )
      continue;
    const selection = {
      packageId: s.packageId,
      variant: s.variant,
      region: s.region,
      group: /^(P|KR)\d+$/.test(s.group) ? s.group.toLowerCase() : s.group,
      confirmed: false,
      ...(isCaritasAnnualPackageId(s.packageId) ? { groupAtSeptember1Confirmed: false } : {}),
    };
    const key = tariffAnnualSelectionKey(selection);
    const name =
      s.packageId === "tvoed-vka-bt-k"
        ? "TVöD-P"
        : s.packageId === "tvaoed-pflege-vka"
          ? "TVAöD-Pflege"
          : s.packageId === "tval-pflege-tdl"
            ? "TVA-L Pflege"
            : s.packageId === "tvl-kr-tdl"
              ? "TV-L/KR"
              : isCaritasAnnualPackageId(s.packageId)
                ? "AVR-Caritas Pflege"
                : s.packageId;
    choices.set(key, {
      key,
      selection,
      title: `${name} · ${s.variant.replace("_", "-")} · ${s.region === "OTHER" ? "Übrige Tarifgebiete" : s.region === "KAV_BW" ? "Baden-Württemberg" : s.region} · ${s.group}`,
    });
  }
  return [...choices.values()];
}

export function newTariffAnnualClaim(
  year: number,
  selection: TariffAnnualClaim["selection"],
  saved: readonly SavedTariffAnnualClaim[],
): TariffAnnualClaim {
  let index = 1;
  while (saved.some((row) => row.claim.year === year && row.claim.id === `tariff-annual-${index}`))
    index++;
  return validateTariffAnnualClaim({
    version: isCaritasAnnualPackageId(selection.packageId)
      ? 3
      : selection.packageId === "tvl-kr-tdl"
        ? 2
        : 1,
    id: `tariff-annual-${index}`,
    year,
    selection: resetTariffAnnualSelection(selection),
    employment: {
      start: null,
      end: null,
      confirmed: false,
      takeover: { immediate: null, sameEmployer: null, employedDecember1: null },
    },
    entitlements: Array.from({ length: 12 }, (_, month) => ({
      month: month + 1,
      reason: "UNKNOWN",
    })),
    exceptions: {
      birthYear: null,
      payBeforeParentalLeave: null,
      militaryReturnBeforeDecember1: null,
      ...(selection.packageId === "tvl-kr-tdl" ? { tvlLegacyRetirementExit: null } : {}),
    },
    allocation: { required: null, twelfthsNumerator: null, twelfthsDenominator: null },
    basis: {
      months: [],
      lastFullPayMonth: null,
      parentalPartTime: null,
      adjustedMonthlyCents: null,
      takeoverMonthlyCents: null,
    },
  });
}
const amountText = (value: number | null) => (value === null ? "" : ownDecimal(value));
const integerText = (value: number | null) => (value === null ? "" : String(value));
const dateText = (date: string | null) =>
  date === null ? "" : `${date.slice(8)}.${date.slice(5, 7)}.${date.slice(0, 4)}`;
export function tariffAnnualDraft(session: TariffAnnualSession): TariffAnnualDraft {
  const c = session.claim,
    actual = session.saved?.actualPayment;
  return {
    claim: c,
    start: dateText(c.employment.start),
    end: dateText(c.employment.end),
    birthYear: integerText(c.exceptions.birthYear),
    numerator: integerText(c.allocation.twelfthsNumerator),
    denominator: integerText(c.allocation.twelfthsDenominator),
    lastFullPayMonth:
      c.basis.lastFullPayMonth === null ? "" : annualPayoutText(c.basis.lastFullPayMonth),
    adjustedAmount: amountText(c.basis.adjustedMonthlyCents),
    takeoverAmount: amountText(c.basis.takeoverMonthlyCents),
    months: c.basis.months.map((m) => ({
      ...m,
      baseCents: amountText(m.baseCents),
      fixedCents: amountText(m.fixedCents),
      variableCents: amountText(m.variableCents),
      scheduledOvertimeCents: amountText(m.scheduledOvertimeCents),
      paidCalendarDays: integerText(m.paidCalendarDays),
    })),
    actual: actual != null,
    actualAmount: actual ? ownDecimal(actual.grossCents) : "",
    payout: actual ? annualPayoutText(actual.payoutMonth) : "",
  };
}
/** Changing tariff identity resets its specific retirement exception and confirmation. */
export function reassignTariffAnnualClaim(
  claim: TariffAnnualClaim,
  selection: TariffAnnualClaim["selection"],
): TariffAnnualClaim {
  const { tvlLegacyRetirementExit: _legacy, ...exceptions } = claim.exceptions;
  return validateTariffAnnualClaim({
    ...claim,
    version: isCaritasAnnualPackageId(selection.packageId)
      ? 3
      : selection.packageId === "tvl-kr-tdl"
        ? 2
        : 1,
    selection: resetTariffAnnualSelection(selection),
    exceptions: {
      ...exceptions,
      ...(selection.packageId === "tvl-kr-tdl" ? { tvlLegacyRetirementExit: null } : {}),
    },
  });
}
function optionalInteger(text: string, label: string, min: number, max: number): number | null {
  const value = text.trim();
  if (!value) return null;
  if (
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) < min ||
    Number(value) > max
  )
    throw new ValidationError(
      `${label}: Bitte eine ganze Zahl zwischen ${min} und ${max} eingeben.`,
    );
  return Number(value);
}
function optionalDate(text: string, label: string): string | null {
  if (!text.trim()) return null;
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text.trim());
  if (match && annualPaymentYear(match[3]) !== null) {
    try {
      return Temporal.PlainDate.from(`${match[3]}-${match[2]}-${match[1]}`).toString();
    } catch {
      /* Report a local field error below. */
    }
  }
  throw new ValidationError(`${label}: Bitte ein gültiges Datum als TT.MM.JJJJ eingeben.`);
}
export function tariffAnnualMonth(text: string, label: string): string {
  const match = /^(0[1-9]|1[0-2])\.(\d{4})$/.exec(text.trim());
  if (!match || annualPaymentYear(match[2]) === null)
    throw new ValidationError(`${label}: Bitte MM.JJJJ eingeben.`);
  return `${match[2]}-${match[1]}`;
}
export function addTariffBasisMonth(draft: TariffAnnualDraft, text: string): TariffAnnualDraft {
  const month = tariffAnnualMonth(text, "Bemessungsmonat");
  if (draft.months.some((row) => row.month === month))
    throw new ValidationError("Dieser Bemessungsmonat ist bereits vorhanden.");
  if (draft.months.length >= 36)
    throw new ValidationError("Höchstens 36 Bemessungsmonate möglich.");
  return {
    ...draft,
    months: [
      ...draft.months,
      {
        month,
        componentsConfirmed: false,
        baseCents: "",
        fixedCents: "",
        variableCents: "",
        scheduledOvertimeCents: "",
        paidCalendarDays: "",
      },
    ],
  };
}
export function prepareTariffAnnualClaim(
  draft: TariffAnnualDraft,
  expected: SavedTariffAnnualClaim | null,
): SaveTariffAnnualClaimInput {
  const money = (text: string, label: string) =>
    text.trim() ? ownNumber(text, label, 1_000_000_000) : null;
  const c = draft.claim;
  const claim = validateTariffAnnualClaim({
    ...c,
    employment: {
      ...c.employment,
      start: optionalDate(draft.start, "Beschäftigungsbeginn"),
      end: optionalDate(draft.end, "Beschäftigungsende"),
    },
    exceptions: {
      ...c.exceptions,
      birthYear: optionalInteger(draft.birthYear, "Geburtsjahr des Kindes", 1900, 4099),
    },
    allocation: {
      ...c.allocation,
      twelfthsNumerator: optionalInteger(draft.numerator, "Zähler", 0, 120_000),
      twelfthsDenominator: optionalInteger(draft.denominator, "Nenner", 1, 10_000),
    },
    basis: {
      ...c.basis,
      lastFullPayMonth: draft.lastFullPayMonth.trim()
        ? tariffAnnualMonth(draft.lastFullPayMonth, "Letzter voller Entgeltmonat")
        : null,
      adjustedMonthlyCents: money(draft.adjustedAmount, "Angepasste Bemessungsgrundlage"),
      takeoverMonthlyCents: money(draft.takeoverAmount, "Bemessungsgrundlage Ausbildung"),
      months: draft.months.map((m) => ({
        ...m,
        baseCents: money(m.baseCents, "Grundentgelt"),
        fixedCents: money(m.fixedCents, "Feste Bestandteile"),
        variableCents: money(m.variableCents, "Variable Bestandteile"),
        scheduledOvertimeCents: money(m.scheduledOvertimeCents, "Dienstplanmäßige Überstunden"),
        paidCalendarDays: optionalInteger(
          m.paidCalendarDays,
          "Kalendertage mit Entgelt",
          0,
          Temporal.PlainYearMonth.from(m.month).daysInMonth,
        ),
      })),
    },
  });
  const actualPayment = validateActualTariffAnnualPayment(
    draft.actual
      ? {
          grossCents: ownNumber(draft.actualAmount, "Tatsächlicher Bruttobetrag", 1_000_000_000),
          payoutMonth: tariffAnnualMonth(draft.payout, "Auszahlungsmonat"),
        }
      : null,
  );
  return { claim, actualPayment, expected };
}
