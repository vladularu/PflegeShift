import type {
  SavedOvertimeAllocation,
  SaveOvertimeAllocationInput,
} from "@/domain/overtime-allocation";
import { isCurrentOvertimeAllocation } from "@/domain/overtime-allocation";
import { UserFacingError } from "@/domain/errors";
import type { ShiftEntry } from "@/domain/types";
import { remunerationMonthShifts, remunerationShiftDays } from "@/engine/remuneration-shift-days";

export function overtimeAllocationShifts(
  month: string,
  shifts: readonly ShiftEntry[],
  timeZone: string,
) {
  return remunerationMonthShifts(month, shifts)
    .filter(
      (shift) =>
        shift.tariffOvertimeConfirmed &&
        shift.overtimeMinutes > 0 &&
        remunerationShiftDays(shift, timeZone).some((day) => day.date.startsWith(month + "-")),
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.startTime ?? "").localeCompare(b.startTime ?? "") ||
        a.id.localeCompare(b.id),
    );
}

export function overtimeAllocationFields(
  shift: ShiftEntry,
  timeZone: string,
  saved: SavedOvertimeAllocation | null,
) {
  const current = saved !== null && isCurrentOvertimeAllocation(saved, shift, timeZone);
  const days = remunerationShiftDays(shift, timeZone);
  return days.map((day) => ({
    date: day.date,
    maximumMinutes: day.until - day.from,
    value: current
      ? String(saved.allocations!.find((item) => item.date === day.date)?.minutes ?? 0)
      : saved === null && days.length === 1
        ? String(shift.overtimeMinutes)
        : "",
  }));
}

export function prepareOvertimeAllocation(
  shift: ShiftEntry,
  timeZone: string,
  saved: SavedOvertimeAllocation | null,
  values: Readonly<Record<string, string>>,
): SaveOvertimeAllocationInput {
  const days = remunerationShiftDays(shift, timeZone);
  if (
    !shift.tariffOvertimeConfirmed ||
    !Number.isSafeInteger(shift.overtimeMinutes) ||
    shift.overtimeMinutes <= 0 ||
    !days.length
  )
    throw new UserFacingError("Dieser Dienst hat keine bestätigten auszahlbaren Überstunden.");
  if (saved !== null && saved.shiftId !== shift.id)
    throw new UserFacingError("Die Bestätigung gehört zu einem anderen Dienst. Bitte neu laden.");
  if (
    Object.keys(values).length !== days.length ||
    Object.keys(values).some((date) => !days.some((day) => day.date === date))
  )
    throw new UserFacingError("Die Diensttage haben sich geändert. Bitte neu laden.");
  const allocations = days.map((day) => {
    const raw = values[day.date]?.trim() ?? "";
    if (!/^[0-9]{1,4}$/u.test(raw))
      throw new UserFacingError(
        "Bitte für jeden Diensttag ganze Minuten eintragen, gegebenenfalls 0.",
      );
    const minutes = Number(raw);
    if (minutes > day.until - day.from)
      throw new UserFacingError(
        "Die Minuten eines Tages dürfen dessen tatsächliche Dienstzeit nicht überschreiten.",
      );
    return { date: day.date, minutes };
  });
  const total = allocations.reduce((sum, item) => sum + item.minutes, 0);
  if (total !== shift.overtimeMinutes)
    throw new UserFacingError(
      `Bitte genau ${shift.overtimeMinutes} bestätigte Überstundenminuten aufteilen.`,
    );
  if (total > days.reduce((sum, day) => sum + day.netMinutes, 0))
    throw new UserFacingError(
      "Die bestätigten Überstunden überschreiten die Dienstzeit abzüglich Pause. Bitte zuerst den Dienst korrigieren.",
    );
  return {
    shiftId: shift.id,
    expectedShiftRevision: shift.revision,
    timeZone,
    expectedRevision: saved?.revision ?? 0,
    allocations,
  };
}
