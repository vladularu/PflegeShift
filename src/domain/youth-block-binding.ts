import { isCurrentShiftTraining, type SavedShiftTraining } from "./training-data";
import type { ShiftEntry } from "./types";

/** A personal confirmation of this exact extra training event, not a reusable shift ID. */
export function youthBlockShiftBinding(
  shift: ShiftEntry,
  saved: SavedShiftTraining,
  timeZone: string,
): string | null {
  if (
    !isCurrentShiftTraining(saved, shift, timeZone) ||
    shift.allDay ||
    shift.startTime === null ||
    shift.endTime === null ||
    ["FREE", "VACATION", "SICK"].includes(shift.type) ||
    saved.data.pauses === null ||
    saved.data.school !== null ||
    saved.data.exam != null
  )
    return null;
  const binding = JSON.stringify([
    "youth-block-v1",
    shift.id,
    shift.revision,
    shift.updatedAt,
    shift.date,
    shift.type,
    shift.allDay ?? false,
    shift.startTime,
    shift.endTime,
    shift.breakMinutes,
    timeZone,
    saved.revision,
    saved.updatedAt,
    saved.data.pauses.map((pause) => [pause.start, pause.end]),
  ]);
  return binding.length <= 2048 ? binding : null;
}
