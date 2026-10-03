/** Monetary results use integer cents. An unavailable amount is never zero. */
export type RemunerationStatus = "calculated" | "estimated" | "unavailable";

export type RemunerationIssueCode =
  | "PROFILE_MISSING"
  | "EFFECTIVE_DATE_UNKNOWN"
  | "PROFILE_INVALID"
  | "REMUNERATION_UNCONFIGURED"
  | "TARIFF_UNSUPPORTED"
  | "RULE_PACKAGE_NOT_FOUND"
  | "RULE_PACKAGE_AMBIGUOUS"
  | "TABLE_SELECTION_INVALID"
  | "TABLE_ENTRY_MISSING"
  | "TABLE_ENTRY_AMBIGUOUS"
  | "WEEKLY_TIME_MISSING"
  | "OWN_PRORATION_UNCONFIRMED"
  | "OWN_HOURLY_INPUT_MISSING"
  | "PAID_ABSENCE_UNCONFIRMED"
  | "WORK_TIME_MISSING"
  | "OWN_COMPONENTS_NOT_CONNECTED";

export type TimeRemunerationIssueCode =
  | RemunerationIssueCode
  | "OWN_PREMIUMS_UNCONFIGURED"
  | "PREMIUM_RATE_MISSING"
  | "HOLIDAY_RULES_UNAVAILABLE"
  | "DRAFT_PREMIUM_FACTS_INCOMPLETE";

export interface RemunerationIssue {
  readonly code: RemunerationIssueCode;
  readonly message: string;
}

export interface RemunerationSource {
  readonly kind: "profile" | "tariff";
  readonly profileEffectiveFrom: string | null;
  readonly profileRevision: number | null;
  readonly requestedPackageId: string | null;
  readonly packageId: string | null;
  readonly versionId: string | null;
  readonly packageValidFrom: string | null;
  readonly packageValidTo: string | null;
  readonly references: readonly {
    readonly id: string;
    readonly title: string;
    readonly url: string;
    readonly section: string;
  }[];
}

export interface BaseRemunerationPosition {
  readonly id: string;
  readonly kind: "base";
  readonly label: string;
  readonly from: string;
  readonly through: string;
  readonly status: RemunerationStatus;
  readonly amountCents: number | null;
  readonly source: RemunerationSource;
  readonly basis: {
    readonly fullTimeMonthlyCents: number | null;
    readonly personalMonthlyCents: number | null;
    readonly weeklyMinutes: number | null;
    readonly fullTimeWeeklyMinutes: number | null;
    readonly calendarDays: number;
    readonly monthDays: number;
    readonly proration: "none" | "calendar-days" | "unconfirmed" | "paid-minutes";
    readonly hourly?: {
      readonly rateCents: number;
      readonly paidMinutes: number | null;
      readonly kind: "worked" | "absence";
      readonly shiftId: string | null;
      readonly confirmationRevision: number | null;
      readonly pauseEstimated: boolean;
    };
  };
  readonly issue: RemunerationIssue | null;
}

/** Base pay only, deliberately not named or presented as total gross remuneration. */
export interface MonthlyBaseRemuneration {
  readonly month: string;
  readonly status: RemunerationStatus;
  readonly complete: boolean;
  readonly totalCents: number | null;
  readonly knownSubtotalCents: number;
  readonly positions: readonly BaseRemunerationPosition[];
}

export interface TimeRemunerationPosition {
  readonly id: string;
  readonly kind: "time-premium";
  readonly label: string;
  readonly from: string;
  readonly through: string;
  readonly fromEpochMinutes: number;
  readonly untilEpochMinutes: number;
  /** Null for a tariff-calculated day aggregate spanning more than one shift. */
  readonly shiftId: string | null;
  readonly status: RemunerationStatus;
  readonly amountCents: number | null;
  readonly source: RemunerationSource;
  readonly basis: {
    readonly ruleId: string | null;
    readonly minutes: number;
    /** Percentage base, or fixed cents/hour when percentageBasisPoints is null. */
    readonly hourlyRateCents: number | null;
    /** null on a known monetary position means fixed hourly premium, not an unknown percent. */
    readonly percentageBasisPoints: number | null;
    /** Present when the tariff rounds the hourly premium before multiplying by time. */
    readonly roundedPremiumHourlyCents?: number | null;
    readonly pauseMethod: "none" | "centered-duration-estimate" | "confirmed-intervals";
  };
  readonly issue: { readonly code: TimeRemunerationIssueCode; readonly message: string } | null;
}

export type RemunerationPosition =
  | import("./annual-payment").AnnualPaymentPosition
  | BaseRemunerationPosition
  | TimeRemunerationPosition
  | import("./remuneration-supplement").SupplementPosition;

/** Time premiums only; excludes base pay, overtime and monthly allowances. */
export interface TimeRemunerationResult {
  readonly status: RemunerationStatus;
  readonly complete: boolean;
  readonly totalCents: number | null;
  readonly knownSubtotalCents: number;
  readonly netMinutes: number;
  readonly positions: readonly TimeRemunerationPosition[];
}
