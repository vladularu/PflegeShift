import type { AllowanceStatus, TvoedAssessment } from "./types";
import type { RemunerationSource, RemunerationIssueCode } from "./remuneration-result";
import type { DatedAllowanceEntitlement } from "./remuneration-supplement";

export interface AllowanceTariffIdentity {
  readonly packageId: string;
  readonly variant: string;
  readonly region: string;
}

/** Calendar evidence only, never a confirmed allowance entitlement. */
export interface NightSequenceExplanation {
  readonly title: string;
  readonly dates: readonly string[];
  readonly deadline: string | null;
  readonly hasAbsence: boolean;
  readonly uncertain: boolean;
  readonly qualifiedNightCount: number;
}

/** Separate from an unbound legacy MonthlyTariffDecision; storage follows in its own migration. */
export interface ScopedAllowanceDecision {
  readonly from: string;
  readonly through: string;
  readonly tariff: AllowanceTariffIdentity;
  readonly allowanceStatus: AllowanceStatus;
  readonly revision: number;
  readonly confirmedAt: string;
  readonly updatedAt: string;
}

export interface DatedAllowanceAssessment {
  readonly tariff: AllowanceTariffIdentity | null;
  readonly nightSequence: NightSequenceExplanation | null;
  readonly from: string;
  readonly through: string;
  readonly source: RemunerationSource;
  readonly assessment: TvoedAssessment | null;
  readonly entitlement: DatedAllowanceEntitlement | null;
  readonly observedFrom: string | null;
  readonly observedThrough: string | null;
  readonly settingsUpdatedAt: string | null;
  readonly issue: {
    readonly code:
      | RemunerationIssueCode
      | "OWN_ASSESSMENT_UNSUPPORTED"
      | "WORKPLACE_SETTINGS_UNCONFIRMED"
      | "ALLOWANCE_RECONFIRMATION_REQUIRED"
      | "ALLOWANCE_DECISION_TARIFF_MISMATCH";
    readonly message: string;
  } | null;
}
