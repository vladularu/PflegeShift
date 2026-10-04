import { isCurrentShiftTraining, type SavedShiftTraining } from "@/domain/training-data";
import type { CalendarEntry, ShiftEntry } from "@/domain/types";
import { youthBlockShiftBinding } from "@/domain/youth-block-binding";
import { parseRemunerationDateInput } from "@/features/settings/remuneration-editor-values";

export interface YouthBlockChoice {
  readonly shift: ShiftEntry;
  readonly binding: string;
}

/** Only current, timed work inside an explicitly recorded school block is selectable. */
export function youthBlockTrainingChoices(
  entries: readonly CalendarEntry[],
  details: readonly SavedShiftTraining[],
  timeZone: string,
  profileFromInput: string,
  nextProfileFrom: string | null,
): readonly YouthBlockChoice[] {
  let profileFrom: string;
  try {
    profileFrom = parseRemunerationDateInput(profileFromInput);
  } catch {
    return [];
  }
  const active = entries.filter(
    (entry): entry is ShiftEntry => entry.kind === "SHIFT" && entry.deletedAt === null,
  );
  const byId = new Map(active.map((shift) => [shift.id, shift]));
  const savedById = new Map<string, SavedShiftTraining[]>();
  for (const row of details)
    savedById.set(row.shiftId, [...(savedById.get(row.shiftId) ?? []), row]);
  const current = details.filter((row) => {
    const shift = byId.get(row.shiftId);
    return (
      savedById.get(row.shiftId)?.length === 1 &&
      shift !== undefined &&
      isCurrentShiftTraining(row, shift, timeZone)
    );
  });
  const blocks = current.flatMap((row) => (row.data.school?.block ? [row.data.school.block] : []));
  return active
    .filter(
      (shift) =>
        shift.date >= profileFrom &&
        (nextProfileFrom === null || shift.date < nextProfileFrom) &&
        blocks.some((block) => block.startDate <= shift.date && shift.date <= block.endDate),
    )
    .flatMap((shift) => {
      const row = current.find((item) => item.shiftId === shift.id);
      const binding = row ? youthBlockShiftBinding(shift, row, timeZone) : null;
      return binding === null ? [] : [{ shift, binding }];
    })
    .sort(
      (a, b) =>
        a.shift.date.localeCompare(b.shift.date) ||
        a.shift.startTime!.localeCompare(b.shift.startTime!) ||
        a.shift.id.localeCompare(b.shift.id),
    );
}
