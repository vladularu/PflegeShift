import type { Appointment, CalendarEntry, ShiftEntry, ShiftTemplate } from "@/domain/types";
import { APPOINTMENT_COLOR, SHIFT_TYPE_COLORS } from "@/theme/shift-colors";

const SAMPLES = [
  { title: "Früh", type: "EARLY", symbol: "rise", startTime: "06:00", endTime: "14:00" },
  { title: "Spät", type: "LATE", symbol: "sun", startTime: "14:00", endTime: "22:00" },
  { title: "Nacht", type: "NIGHT", symbol: "moon", startTime: "22:00", endTime: "06:00" },
  { title: "Tag", type: "DAY", symbol: "home", startTime: "08:00", endTime: "16:00" },
  { title: "Urlaub", type: "VACATION", symbol: "palm", startTime: null, endTime: null },
] as const;

/** Presentation-only examples: never pass these to the plan's persistence commands. */
export function calendarDesignPreviewData(
  month: string,
  templates: readonly ShiftTemplate[],
  existingEntries: readonly CalendarEntry[],
) {
  const date = (day: number) => `${month}-${String(day).padStart(2, "0")}`;
  const metadata = {
    revision: 1,
    createdAt: `${date(1)}T00:00:00Z`,
    updatedAt: `${date(1)}T00:00:00Z`,
    deletedAt: null,
  };
  const shifts: ShiftEntry[] = SAMPLES.map((sample, index) => {
    const saved =
      templates.find((item) => item.type === sample.type && item.deletedAt === null) ??
      existingEntries.find(
        (item): item is ShiftEntry =>
          item.kind === "SHIFT" && item.type === sample.type && item.deletedAt === null,
      );
    return {
      ...sample,
      ...metadata,
      kind: "SHIFT",
      id: `calendar-design-example-${index}`,
      date: date(index + 1),
      templateId: null,
      allDay: sample.startTime === null,
      breakMinutes: 0,
      color: saved?.color ?? SHIFT_TYPE_COLORS[sample.type],
      symbol: saved?.symbol ?? sample.symbol,
      note: null,
      overtimeMinutes: 0,
      holidayPremiumMode: "WITH_TIME_OFF",
    };
  });
  const appointment: Appointment = {
    ...metadata,
    kind: "APPOINTMENT",
    id: "calendar-design-example-appointment",
    date: date(6),
    title: "Termin (Beispiel)",
    allDay: false,
    startTime: "10:00",
    endTime: "11:00",
    color: APPOINTMENT_COLOR,
    note: null,
  };
  return {
    entries: [...shifts, appointment],
    holidays: new Map([[date(7), { name: "Feiertag (Beispiel)" }]]),
  };
}
