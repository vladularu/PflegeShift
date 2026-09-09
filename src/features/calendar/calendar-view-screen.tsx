import Ionicons from "@expo/vector-icons/Ionicons";
import { ScrollView, Text, View } from "react-native";

import type { CalendarLabelMode } from "@/domain/types";
import { useCalendarPreferences } from "@/features/calendar/calendar-preferences";
import { calendarChipPalette, chipTextColor } from "@/theme/color-contrast";
import { usePalette } from "@/theme/palette";
import { APPOINTMENT_COLOR, HOLIDAY_COLOR, SHIFT_TYPE_COLORS } from "@/theme/shift-colors";
import { COMPACT_TEXT_MAX_SCALE } from "@/theme/typography";
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
import { ShiftSymbol } from "@/ui/shift-symbol";

function CalendarDisplayPreview({
  labelMode,
  showShiftDuration,
  showShiftTimes,
}: {
  readonly labelMode: CalendarLabelMode;
  readonly showShiftDuration: boolean;
  readonly showShiftTimes: boolean;
}) {
  const palette = usePalette();
  const samples = [
    {
      day: "27",
      title: "Früh",
      symbol: "rise",
      startTime: "06:00",
      duration: "8:00 h",
      color: SHIFT_TYPE_COLORS.EARLY,
    },
    {
      day: "28",
      title: "Spät",
      symbol: "sun",
      startTime: "14:00",
      duration: "8:00 h",
      color: SHIFT_TYPE_COLORS.LATE,
    },
    {
      day: "29",
      title: "Nacht",
      symbol: "moon",
      startTime: "22:00",
      duration: "8:00 h",
      color: SHIFT_TYPE_COLORS.NIGHT,
    },
    {
      day: "30",
      title: "Tag",
      symbol: "home",
      startTime: "08:00",
      duration: "8:00 h",
      color: SHIFT_TYPE_COLORS.DAY,
    },
    {
      day: "31",
      title: "Urlaub",
      symbol: "palm",
      startTime: null,
      duration: null,
      color: SHIFT_TYPE_COLORS.VACATION,
    },
  ];

  return (
    <View
      accessible
      accessibilityLabel="Vorschau der Dienstanzeige"
      style={{
        height: 104,
        flexDirection: "row",
        overflow: "hidden",
        borderWidth: 1,
        borderColor: palette.separator,
        borderRadius: 18,
        borderCurve: "continuous",
        backgroundColor: palette.surface,
      }}
    >
      {samples.map((sample, index) => {
        const colors = calendarChipPalette(sample.color, palette.dark);
        const today = index === 1;
        const detail =
          sample.startTime === null
            ? showShiftTimes || showShiftDuration
              ? "GT"
              : null
            : [showShiftTimes ? sample.startTime : null, showShiftDuration ? sample.duration : null]
                .filter((value): value is string => value !== null)
                .join(" · ") || null;
        return (
          <View
            key={sample.day}
            style={{
              minWidth: 0,
              flex: 1,
              alignItems: "stretch",
              backgroundColor: today ? palette.calendarToday : "transparent",
              paddingHorizontal: 2,
              paddingTop: 7,
            }}
          >
            <Text
              maxFontSizeMultiplier={COMPACT_TEXT_MAX_SCALE}
              style={{
                height: 28,
                color: today ? palette.onCalendarToday : palette.textSecondary,
                fontSize: 13,
                fontWeight: "600",
                textAlign: "center",
                fontVariant: ["tabular-nums"],
              }}
            >
              {sample.day}
            </Text>
            <View style={{ overflow: "hidden", borderRadius: 4 }}>
              <View style={{ height: 19, justifyContent: "center", backgroundColor: colors.main }}>
                {labelMode === "SYMBOL" ? (
                  <ShiftSymbol color={colors.onMain} size={13} value={sample.symbol} />
                ) : (
                  <Text
                    adjustsFontSizeToFit
                    maxFontSizeMultiplier={COMPACT_TEXT_MAX_SCALE}
                    minimumFontScale={0.72}
                    numberOfLines={1}
                    style={{
                      color: colors.onMain,
                      fontSize: 10,
                      fontWeight: "700",
                      textAlign: "center",
                    }}
                  >
                    {labelMode === "SHORT" ? sample.title.slice(0, 1) : sample.title}
                  </Text>
                )}
              </View>
              {detail ? (
                <View
                  style={{ height: 19, justifyContent: "center", backgroundColor: colors.detail }}
                >
                  <Text
                    adjustsFontSizeToFit
                    maxFontSizeMultiplier={COMPACT_TEXT_MAX_SCALE}
                    minimumFontScale={0.72}
                    numberOfLines={1}
                    style={{
                      color: colors.onDetail,
                      fontSize: 10,
                      fontWeight: "500",
                      textAlign: "center",
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {detail}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        );
      })}
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
          labelMode={preferences.labelMode}
          showShiftDuration={preferences.showShiftDuration}
          showShiftTimes={preferences.showShiftTimes}
        />
      </View>
      <View style={{ gap: 10 }}>
        <SectionHeader
          caption="Lege fest, welche Inhalte im Monats- und Jahreskalender sichtbar sind."
          title="Kalenderinhalte"
        />
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
        <SectionHeader
          caption="Bestimme, wie Dienste innerhalb eines Kalendertags beschriftet werden."
          title="Dienstanzeige"
        />
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
