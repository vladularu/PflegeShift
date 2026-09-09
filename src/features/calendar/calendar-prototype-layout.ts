import { createMonthGrid } from "@/engine/calendar";
import { SHIFT_TYPE_COLORS } from "@/theme/shift-colors";

export const PROTOTYPE_MONTH_NAMES = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
] as const;

/** Both scenes and the moving dates use these same positions. No native reads. */
export function calendarPrototypeLayout(month: string, width: number, height: number) {
  const column = (Number(month.slice(5)) - 1) % 3;
  const row = Math.floor((Number(month.slice(5)) - 1) / 3);
  const miniWidth = width / 3;
  const miniHeight = height / 4;
  const miniStep = Math.min(21, (miniHeight - 36) / 6);
  const grid = createMonthGrid(month);
  const weekHeight = (height - 32) / (grid.length / 7);
  return {
    month,
    tile: { x: column * miniWidth, y: row * miniHeight, width: miniWidth, height: miniHeight },
    title: { x: column * miniWidth + 8, y: row * miniHeight + 4 },
    cellWidth: width / 7,
    weekHeight,
    days: grid.flatMap((cell, index) =>
      cell.inMonth
        ? [
            {
              date: cell.date,
              day: cell.day,
              weekend: cell.weekend,
              fromX: column * miniWidth + 8 + (((index % 7) + 0.5) * (miniWidth - 16)) / 7,
              fromY: row * miniHeight + 36 + Math.floor(index / 7) * miniStep + miniStep / 2,
              toX: (((index % 7) + 0.5) * width) / 7,
              toY: 32 + Math.floor(index / 7) * weekHeight + 20,
            },
          ]
        : [],
    ),
  };
}

export type PrototypeMonth = ReturnType<typeof calendarPrototypeLayout>;
export type PrototypeDay = PrototypeMonth["days"][number];

/** Deterministic, clearly labelled fixtures; no database or salary information. */
export function prototypeShift(day: number) {
  if (day % 5 === 0 || day % 7 === 0) return null;
  return day % 3 === 0
    ? { title: "Nacht", time: "21:00", color: SHIFT_TYPE_COLORS.NIGHT }
    : day % 3 === 1
      ? { title: "Früh", time: "07:00", color: SHIFT_TYPE_COLORS.EARLY }
      : { title: "Spät", time: "13:00", color: SHIFT_TYPE_COLORS.LATE };
}
