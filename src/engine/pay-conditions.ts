import type { AllowanceStatus, ShiftEntry, UserProfile } from "@/domain/types";
import type { RuleConditions } from "@/rules/contracts.generated";

function normalizedIdentifier(value: string): string {
  return value.toLowerCase().replaceAll("_", "-");
}

export function conditionsMatch(
  conditions: RuleConditions,
  profile: UserProfile,
  date: string,
  shift: ShiftEntry | null,
  allowanceStatus: AllowanceStatus | null,
): boolean {
  const shiftType = shift ? normalizedIdentifier(shift.type) : null;
  const tariff = profile.tariff;
  return (
    (conditions.requiresShiftTypes.length === 0 ||
      (shiftType !== null && conditions.requiresShiftTypes.includes(shiftType))) &&
    (shiftType === null || !conditions.excludesShiftTypes.includes(shiftType)) &&
    (conditions.payGroups === null ||
      (tariff !== null && conditions.payGroups.includes(tariff.payGroup.toLowerCase()))) &&
    (conditions.sectors === null ||
      (tariff !== null && conditions.sectors.includes(tariff.sector))) &&
    (conditions.tariffRegions == null ||
      (tariff !== null && conditions.tariffRegions.includes(tariff.tariffRegion))) &&
    (conditions.federalStates === null ||
      conditions.federalStates.includes(profile.federalState)) &&
    (conditions.holidayPremiumModes === null ||
      (shift !== null && conditions.holidayPremiumModes.includes(shift.holidayPremiumMode))) &&
    (conditions.allowanceStatuses === null ||
      (allowanceStatus !== null &&
        allowanceStatus !== "NONE" &&
        conditions.allowanceStatuses.includes(allowanceStatus))) &&
    (conditions.monthDays === null || conditions.monthDays.includes(date.slice(5)))
  );
}
