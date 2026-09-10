import type { Ref } from "react";
import type { TextInput } from "react-native";

import type { EntryLocation, EntryNotification, ShiftType } from "@/domain/types";

export interface ShiftEditOverlayProps {
  readonly alarmEnabled: boolean;
  readonly breakMinutes: string;
  readonly busy: boolean;
  readonly date: string;
  readonly durationMinutes: number | null;
  readonly endTime: string;
  readonly error: string | null;
  readonly location: EntryLocation | null;
  readonly note: string;
  readonly notification: EntryNotification | null;
  readonly onAlarmPress: () => void;
  readonly onBreakMinutesChange: (value: number) => void;
  readonly onBreakPress: () => void;
  readonly onDelete?: (() => void) | undefined;
  readonly onDismiss: () => void;
  readonly onEndTimeChange: (value: string) => void;
  readonly onLocationPress: () => void;
  readonly onNoteChange: (value: string) => void;
  readonly onNotificationChange: (value: EntryNotification | null) => void;
  readonly onNotificationPress: () => void;
  readonly onOvertimeMinutesChange: (value: string) => void;
  readonly onRequestClose: () => Promise<boolean>;
  readonly onShiftTypeChange: (value: ShiftType) => void;
  readonly onStartTimeChange: (value: string) => void;
  readonly onTariffOvertimeConfirmedChange: (value: boolean) => void;
  readonly overtimeInputRef: Ref<TextInput>;
  readonly overtimeMinutes: string;
  readonly shiftColor: string;
  readonly shiftIsTimed: boolean;
  readonly shiftSymbol: string;
  readonly shiftTitle: string;
  readonly shiftType: ShiftType;
  readonly startTime: string;
  readonly tariffOvertimeConfirmed: boolean;
}
