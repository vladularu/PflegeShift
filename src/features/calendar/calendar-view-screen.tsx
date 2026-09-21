import Ionicons from "@expo/vector-icons/Ionicons";
import { ScrollView, Text, View } from "react-native";

import type { CalendarLabelMode, ShiftEntry } from "@/domain/types";
import { useCalendarPreferences } from "@/features/calendar/calendar-preferences";
import { chipTextColor } from "@/theme/color-contrast";
import { usePalette } from "@/theme/palette";
import { APPOINTMENT_COLOR, HOLIDAY_COLOR, SHIFT_TYPE_COLORS } from "@/theme/shift-colors";
import { CALENDAR_METRICS } from "@/theme/tokens";
import {
  CardSeparator,
  InlineNotice,
  RowButton,
  SegmentedControl,
  SectionHeader,
  SurfaceCard,
} from "@/ui/design-system";
import { PrimaryButton } from "@/ui/form-controls";
import { LabeledSwitch } from "@/ui/labeled-switch";
import { PrototypeEntryContent } from "./prototype-entry-content";

const PREVIEW_SHIFTS: readonly ShiftEntry[] = [
  { title: "Früh", type: "EARLY", symbol: "rise", startTime: "06:00", endTime: "14:00" },
  { title: "Spät", type: "LATE", symbol: "sun", startTime: "14:00", endTime: "22:00" },
  { title: "Nacht", type: "NIGHT", symbol: "moon", startTime: "22:00", endTime: "06:00" },
  { title: "Tag", type: "DAY", symbol: "home", startTime: "08:00", endTime: "16:00" },
  { title: "Urlaub", type: "VACATION", symbol: "palm", startTime: null, endTime: null },
].map((sample, index) => ({
  ...sample,
  type: sample.type as ShiftEntry["type"],
  kind: "SHIFT",
  id: `preview-${index}`,
  date: `2026-07-${27 + index}`,
  templateId: null,
  color: SHIFT_TYPE_COLORS[sample.type as ShiftEntry["type"]],
  allDay: sample.startTime === null,
  breakMinutes: 0,
  note: null,
  overtimeMinutes: 0,
  holidayPremiumMode: "WITH_TIME_OFF",
  revision: 1,
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
  deletedAt: null,
}));

function CalendarDisplayPreview({
  labelMode,
  showShiftDuration,
  showShiftTimes,
  showShifts,
}: {
  readonly labelMode: CalendarLabelMode;
  readonly showShiftDuration: boolean;
  readonly showShiftTimes: boolean;
  readonly showShifts: boolean;
}) {
  const palette = usePalette();
  return (
    <View
      accessibilityLabel="Vorschau der Dienstanzeige"
      testID="calendar-display-preview"
      style={{ backgroundColor: palette.calendarBackground, paddingVertical: 8 }}
    >
      <View style={{ flexDirection: "row" }}>
        {["M", "D", "M", "D", "F", "S", "S"].map((weekday, index) => (
          <Text
            key={index}
            style={{
              flex: 1,
              textAlign: "center",
              color: palette.textMuted,
              height: CALENDAR_METRICS.weekdayHeight,
              fontSize: CALENDAR_METRICS.weekdayFontSize,
            }}
          >
            {weekday}
          </Text>
        ))}
      </View>
      <View
        style={{
          flexDirection: "row",
          minHeight: 112,
          borderTopWidth: 0.5,
          borderBottomWidth: 0.5,
          borderColor: palette.separator,
        }}
      >
        {["27", "28", "29", "30", "31", "1", "2"].map((day, index) => {
          const sample = PREVIEW_SHIFTS[index];
          const isToday = index === 1;
          return (
            <View
              key={index}
              testID={`preview-day-${index}`}
              style={{
                flex: 1,
                minWidth: 0,
                paddingHorizontal: CALENDAR_METRICS.chipHorizontalInset,
              }}
            >
              <View
                style={{
                  height: CALENDAR_METRICS.dayNumberHeight,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <View
                  testID={`preview-date-marker-${index}`}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: isToday ? palette.primary : "transparent",
                  }}
                >
                  <Text
                    allowFontScaling={false}
                    style={{
                      fontSize: CALENDAR_METRICS.dayNumberFontSize,
                      fontWeight: isToday ? "700" : "500",
                      color: isToday
                        ? palette.onPrimary
                        : index > 4
                          ? palette.textMuted
                          : palette.text,
                    }}
                  >
                    {day}
                  </Text>
                </View>
              </View>
              {showShifts && sample ? (
                <PrototypeEntryContent
                  entry={sample}
                  display={{ labelMode, showShiftDuration, showShiftTimes }}
                  timeZone="Europe/Berlin"
                />
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function VisibilitySwitch({
  color,
  foregroundColor,
  icon,
  label,
  value,
  onChange,
}: {
  readonly color: string;
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly label: string;
  readonly value: boolean;
  readonly onChange: (value: boolean) => void;
  readonly foregroundColor?: string;
}) {
  const palette = usePalette();
  return (
    <RowButton
      leading={
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: color,
          }}
        >
          <Ionicons
            accessibilityElementsHidden
            color={foregroundColor ?? palette.onPrimary}
            name={icon}
            size={19}
          />
        </View>
      }
      title={label}
      trailing={
        <LabeledSwitch label={`${label} anzeigen`} onValueChange={onChange} value={value} />
      }
    />
  );
}

export function CalendarViewScreen({ notice }: { readonly notice?: string } = {}) {
  const palette = usePalette();
  const preferences = useCalendarPreferences();

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={{ gap: 18, padding: 16, paddingBottom: 32 }}
    >
      {notice ? <InlineNotice message={notice} tone="warning" /> : null}
      {preferences.error ? (
        <View style={{ gap: 10 }}>
          <InlineNotice message={preferences.error} tone="error" />
          <PrimaryButton disabled={preferences.saving} onPress={preferences.retry}>
            Speichern erneut versuchen
          </PrimaryButton>
        </View>
      ) : null}
      <View style={{ gap: 10 }}>
        <SectionHeader title="Vorschau" />
        <CalendarDisplayPreview
          showShifts={preferences.showShifts}
          labelMode={preferences.labelMode}
          showShiftDuration={preferences.showShiftDuration}
          showShiftTimes={preferences.showShiftTimes}
        />
      </View>
      <View style={{ gap: 10 }}>
        <SectionHeader title="Kalenderinhalte" />
        <SurfaceCard>
          <VisibilitySwitch
            color={palette.primary}
            icon="briefcase-outline"
            label="Dienste & Abwesenheiten"
            onChange={preferences.setShowShifts}
            value={preferences.showShifts}
          />
          <CardSeparator inset={64} />
          <VisibilitySwitch
            color={APPOINTMENT_COLOR}
            foregroundColor={chipTextColor}
            icon="calendar-outline"
            label="Termine"
            onChange={preferences.setShowAppointments}
            value={preferences.showAppointments}
          />
          <CardSeparator inset={64} />
          <VisibilitySwitch
            color={HOLIDAY_COLOR}
            foregroundColor={chipTextColor}
            icon="sparkles-outline"
            label="Feiertage"
            onChange={preferences.setShowHolidays}
            value={preferences.showHolidays}
          />
        </SurfaceCard>
      </View>

      <View style={{ gap: 10 }}>
        <SectionHeader title="Dienstanzeige" />
        <SurfaceCard>
          <View style={{ gap: 10, padding: 14 }}>
            <Text style={{ color: palette.textSecondary, fontSize: 13, fontWeight: "700" }}>
              Bezeichnung
            </Text>
            <SegmentedControl
              items={[
                { value: "FULL", label: "Voller Name" },
                { value: "SHORT", label: "Nur Kürzel" },
                { value: "SYMBOL", label: "Symbol" },
              ]}
              onChange={(value) =>
                preferences.setLabelMode(value === "SHORT" || value === "SYMBOL" ? value : "FULL")
              }
              value={preferences.labelMode}
            />
          </View>
          <CardSeparator />
          <VisibilitySwitch
            color={palette.primary}
            icon="time-outline"
            label="Startzeit"
            onChange={preferences.setShowShiftTimes}
            value={preferences.showShiftTimes}
          />
          <CardSeparator inset={64} />
          <VisibilitySwitch
            color={APPOINTMENT_COLOR}
            foregroundColor={chipTextColor}
            icon="hourglass-outline"
            label="Gesamtzeit"
            onChange={preferences.setShowShiftDuration}
            value={preferences.showShiftDuration}
          />
        </SurfaceCard>
      </View>
    </ScrollView>
  );
}
