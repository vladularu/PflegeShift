import type { AllowanceStatus } from "./types";
import type {
  RemunerationIssueCode,
  RemunerationSource,
  RemunerationStatus,
} from "./remuneration-result";

export interface DatedAllowanceEntitlement {
  readonly from: string;
  readonly through: string;
  readonly status: AllowanceStatus;
  readonly origin: "confirmed" | "estimated";
  readonly revision: number | null;
}

export type SupplementIssueCode =
  | RemunerationIssueCode
  | "ALLOWANCE_DECISION_MISSING"
  | "ALLOWANCE_RULE_MISSING"
  | "ALLOWANCE_RULE_AMBIGUOUS"
  | "OWN_ALLOWANCES_UNCONFIGURED"
  | "OWN_OVERTIME_UNCONFIGURED"
  | "OVERTIME_ALLOCATION_REQUIRED"
  | "OVERTIME_MINUTES_INVALID"
  | "OVERTIME_RULE_MISSING"
  | "OVERTIME_RULE_AMBIGUOUS"
  | "OVERTIME_RATE_MISSING";

export interface SupplementPosition {
  readonly id: string;
  readonly kind: "allowance" | "overtime-base" | "overtime-premium";
  readonly label: string;
  readonly from: string;
  readonly through: string;
  readonly amountCents: number | null;
  readonly status: RemunerationStatus;
  readonly source: RemunerationSource;
  readonly basis: {
    readonly ruleId: string | null;
    readonly shiftId: string | null;
    readonly allowanceType: "care" | "tvoed" | "shift" | "alternating-shift" | null;
    readonly rateCents: number | null;
    readonly personalMonthlyCents: number | null;
    readonly percentageBasisPoints: number | null;
    readonly minutes: number;
    readonly calendarDays: number;
    readonly monthDays: number;
    readonly entitlement: DatedAllowanceEntitlement | null;
    readonly pauseMethod: "none" | "centered-duration-estimate";
    readonly proration: "none" | "calendar-days" | "worked-minutes" | "unconfirmed";
  };
  readonly issue: { readonly code: SupplementIssueCode; readonly message: string } | null;
}

export interface SupplementResult {
  readonly status: RemunerationStatus;
  readonly complete: boolean;
  readonly totalCents: number | null;
  readonly knownSubtotalCents: number;
  readonly positions: readonly SupplementPosition[];
}

/** Explicit day allocation; never inferred from an overtime-at-shift-end assumption. */
export interface OvertimeDayAllocation {
  readonly date: string;
  readonly minutes: number;
}
