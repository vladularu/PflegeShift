import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import type { CalendarLabelMode } from "@/domain/types";
import { useCalendarPreferences } from "@/features/calendar/calendar-preferences";
import { usePalette } from "@/theme/palette";
import { CONTROL_HEIGHT, SPACING } from "@/theme/tokens";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { CardSeparator, RowButton, SegmentedControl, SurfaceCard } from "@/ui/design-system";
import { LabeledSwitch } from "@/ui/labeled-switch";

function DisplaySwitch({
  label,
  icon,
  value,
  onChange,
  disabled,
}: {
  readonly label: string;
  readonly icon: ComponentProps<typeof Ionicons>["name"];
  readonly value: boolean;
  readonly onChange: (value: boolean) => void;
  readonly disabled: boolean;
}) {
  const palette = usePalette();
  return (
    <RowButton
      title={label}
      leading={
        <Ionicons
          name={icon}
          size={24}
          color={disabled ? palette.textMuted : palette.primary}
          accessible={false}
        />
      }
      trailing={
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel={label}
          accessibilityState={{ checked: value, disabled }}
          disabled={disabled}
          onPress={() => onChange(!value)}
          style={{
            minHeight: CONTROL_HEIGHT.regular,
            minWidth: CONTROL_HEIGHT.regular,
            justifyContent: "center",
          }}
        >
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <LabeledSwitch label={label} value={value} disabled={disabled} accessible={false} />
          </View>
        </Pressable>
      }
    />
  );
}

export function CalendarDisplayControls() {
  const preferences = useCalendarPreferences();
  const palette = usePalette();
  const { width, fontScale } = useWindowDimensions();
  const displayDisabled = !preferences.ready || !preferences.showShifts;
  return (
    <>
      <SurfaceCard>
        <DisplaySwitch
          label="Dienste & Abwesenheiten"
          icon="briefcase-outline"
          value={preferences.showShifts}
          onChange={preferences.setShowShifts}
          disabled={!preferences.ready}
        />
        <CardSeparator />
        <DisplaySwitch
          label="Termine"
          icon="calendar-outline"
          value={preferences.showAppointments}
          onChange={preferences.setShowAppointments}
          disabled={!preferences.ready}
        />
        <CardSeparator />
        <DisplaySwitch
          label="Feiertage"
          icon="sparkles-outline"
          value={preferences.showHolidays}
          onChange={preferences.setShowHolidays}
          disabled={!preferences.ready}
        />
        <CardSeparator inset={0} />
        <View style={{ padding: SPACING.md, gap: SPACING.sm }}>
          <Text
            accessibilityRole="header"
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            style={{ ...TYPOGRAPHY.bodyStrong, color: palette.text }}
          >
            Dienstanzeige
          </Text>
          <SegmentedControl
            accessibilityLabel="Dienstbezeichnung"
            items={[
              { value: "FULL", label: "Name" },
              { value: "SHORT", label: "Kürzel" },
              { value: "SYMBOL", label: "Symbol" },
            ]}
            value={preferences.labelMode}
            disabled={displayDisabled}
            stacked={width < 360 || fontScale > 1.2}
            onChange={(value) => preferences.setLabelMode(value as CalendarLabelMode)}
          />
        </View>
        <CardSeparator />
        <DisplaySwitch
          label="Startzeit"
          icon="time-outline"
          value={preferences.showShiftTimes}
          onChange={preferences.setShowShiftTimes}
          disabled={displayDisabled}
        />
        <CardSeparator />
        <DisplaySwitch
          label="Gesamtdauer"
          icon="hourglass-outline"
          value={preferences.showShiftDuration}
          onChange={preferences.setShowShiftDuration}
          disabled={displayDisabled}
        />
      </SurfaceCard>
      {!preferences.showShifts ? (
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          style={{ ...TYPOGRAPHY.caption, color: palette.textMuted }}
        >
          Aktiviere Dienste, um die Anzeige zu ändern.
        </Text>
      ) : null}
    </>
  );
}
