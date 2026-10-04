import type {
  SavedTrainingProfile,
  SavedShiftTraining,
  ShiftTrainingData,
} from "@/domain/training-data";
import type { ShiftEntry, UserProfile } from "@/domain/types";
import type { RuleLegalPackage, RuleYouthProtection } from "@/rules/contracts.generated";
import type { RuleResolver } from "@/rules/rule-resolver";
import type { YouthContext } from "@/domain/youth-context";

/** Confirmed facts, never inferred from a tariff, occupation or service title. */
export interface YouthFacts extends YouthContext {
  readonly effectiveFrom: string;
}
export interface YouthInput {
  readonly month: string;
  readonly shifts: readonly ShiftEntry[];
  readonly profiles: readonly SavedTrainingProfile[];
  readonly details: readonly SavedShiftTraining[];
  readonly facts: readonly YouthFacts[];
  readonly profile: UserProfile;
  readonly ruleResolver: RuleResolver;
}
export interface YouthFinding {
  readonly code: string;
  readonly severity: "WARNING" | "INCOMPLETE" | "RECOMMENDATION";
  readonly date: string;
  readonly shiftIds: readonly string[];
  readonly message: string;
  readonly section: string;
  readonly packageId: string | null;
  readonly versionId: string | null;
  readonly sourceIds: readonly string[];
}
export interface YouthResult {
  readonly status: "NOT_APPLICABLE" | "INCOMPLETE" | "FINDINGS" | "NO_FINDINGS";
  readonly findings: readonly YouthFinding[];
  readonly assessedDates: readonly string[];
  /** Legal training-time assessment, never an addition to paid or actual work time. */
  readonly trainingTimeDays: readonly TrainingTimeDay[];
}
export interface TrainingTimeDay {
  readonly date: string;
  readonly minutes: number | null;
  readonly basis: "JARBSCHG" | "BBIG" | "PFLBG" | "UNKNOWN";
}
export interface YouthSpan {
  readonly start: number;
  readonly end: number;
  readonly originalMinutes?: number;
}
export interface YouthEntry extends YouthSpan {
  readonly shift: ShiftEntry;
  readonly pauses: readonly YouthSpan[] | null;
  readonly blockTrainingBinding: string | null;
  readonly school: SavedShiftTraining["data"]["school"];
  readonly exam?: NonNullable<ShiftTrainingData["exam"]> | null;
}
export interface YouthDay {
  readonly date: string;
  readonly age: number;
  readonly rules: RuleYouthProtection;
  readonly legal: RuleLegalPackage;
  readonly facts: YouthFacts | null;
  readonly entries: readonly YouthEntry[];
  readonly schoolEntries: readonly YouthEntry[];
  readonly workEntries: readonly YouthEntry[];
  readonly week: string;
}
export type YouthReport = (
  day: YouthDay | null,
  date: string,
  code: string,
  severity: YouthFinding["severity"],
  message: string,
  section: string,
  shiftIds?: readonly string[],
) => void;
