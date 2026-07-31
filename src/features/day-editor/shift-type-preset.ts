import {
  SHIFT_TYPE_LABELS,
  type ShiftTemplate,
  type ShiftType,
  type TimedShiftType,
} from "@/domain/types";
import { SHIFT_TYPE_COLORS } from "@/theme/shift-colors";

interface TimedFallback {
  readonly startTime: string;
  readonly endTime: string;
  readonly breakMinutes: number;
}

const TIMED_FALLBACKS: Readonly<Record<TimedShiftType, TimedFallback>> = {
  CUSTOM: { startTime: "08:00", endTime: "16:00", breakMinutes: 30 },
  EARLY: { startTime: "06:00", endTime: "14:12", breakMinutes: 30 },
  LATE: { startTime: "13:18", endTime: "21:30", breakMinutes: 30 },
  NIGHT: { startTime: "21:00", endTime: "07:30", breakMinutes: 60 },
  DAY: { startTime: "08:00", endTime: "16:12", breakMinutes: 30 },
  TRAINING: { startTime: "09:00", endTime: "17:00", breakMinutes: 30 },
};

const SHIFT_SYMBOLS: Readonly<Record<ShiftType, string>> = {
  CUSTOM: "D",
  EARLY: "F",
  LATE: "S",
  NIGHT: "N",
  DAY: "T",
  TRAINING: "F",
  VACATION: "U",
  SICK: "K",
  FREE: "–",
};

export interface ShiftTypePreset {
  readonly templateId: string | null;
  readonly title: string;
  readonly startTime: string | null;
  readonly endTime: string | null;
  readonly breakMinutes: number;
  readonly color: string;
  readonly symbol: string;
}

function isTimedShiftType(type: ShiftType): type is TimedShiftType {
  return !["VACATION", "SICK", "FREE"].includes(type);
}

export function resolveShiftTypePreset(
  type: ShiftType,
  templates: readonly ShiftTemplate[],
): ShiftTypePreset {
  if (!isTimedShiftType(type)) {
    return {
      templateId: null,
      title: SHIFT_TYPE_LABELS[type],
      startTime: null,
      endTime: null,
      breakMinutes: 0,
      color: SHIFT_TYPE_COLORS[type],
      symbol: SHIFT_SYMBOLS[type],
    };
  }

  const template = templates.find(
    (candidate) => candidate.deletedAt === null && candidate.type === type,
  );
  if (template) {
    return {
      templateId: template.id,
      title: template.name,
      startTime: template.startTime,
      endTime: template.endTime,
      breakMinutes: template.breakMinutes,
      color: template.color,
      symbol: template.symbol,
    };
  }

  const fallback = TIMED_FALLBACKS[type];
  return {
    templateId: null,
    title: SHIFT_TYPE_LABELS[type],
    ...fallback,
    color: SHIFT_TYPE_COLORS[type],
    symbol: SHIFT_SYMBOLS[type],
  };
}
