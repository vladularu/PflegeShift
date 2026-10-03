import type { OwnRemunerationConfiguration } from "./own-remuneration";

/** Synthetic personal inputs only, not tariff amounts or entitlement advice. */
export function ownRemunerationFixture(): OwnRemunerationConfiguration {
  return {
    base: { kind: "monthly", personalCents: 200000, partialMonth: "unconfirmed" },
    percentageBasisHourlyCents: 2500,
    timePremiums: {
      combination: "highest",
      rules: [
        {
          id: "night",
          type: "night",
          window: { startMinute: 1320, endMinute: 360 },
          rate: { kind: "percent", basisPoints: 2500 },
        },
        { id: "sunday", type: "sunday", window: null, rate: { kind: "hourly", centsPerHour: 700 } },
      ],
    },
    overtime: { basePayIncluded: false, premium: { kind: "percent", basisPoints: 3000 } },
    fixedAllowances: [
      {
        id: "role",
        title: "Zusatzaufgabe",
        monthlyCents: 8000,
        partialMonth: "calendar-days",
        validFrom: "2026-10-01",
        validTo: "2027-09-30",
      },
    ],
    specialPayments: [
      {
        id: "annual",
        title: "Jahressonderzahlung",
        payoutMonth: 11,
        entitlementMonths: 6,
        amount: { kind: "percent", basisPoints: 7500, confirmedBasisCents: 200000 },
        validFrom: "2026-01-01",
        validTo: null,
      },
      {
        id: "bonus",
        title: "Sonderzahlung",
        payoutMonth: 7,
        entitlementMonths: 12,
        amount: { kind: "fixed", cents: 50000 },
        validFrom: "2026-01-01",
        validTo: "2026-12-31",
      },
    ],
  };
}
