import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { ScrollView, Text, View } from "react-native";

import { useCalendarPreferences } from "@/features/calendar/calendar-preferences";
import { chipTextColor } from "@/theme/color-contrast";
import { usePalette } from "@/theme/palette";
import { APPOINTMENT_COLOR, HOLIDAY_COLOR } from "@/theme/shift-colors";
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

export function CalendarViewScreen() {
  const palette = usePalette();
  const preferences = useCalendarPreferences();

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={{ gap: 18, padding: 16, paddingBottom: 32 }}
    >
      {preferences.error ? (
        <View style={{ gap: 10 }}>
          <InlineNotice message={preferences.error} tone="error" />
          <PrimaryButton disabled={preferences.saving} onPress={preferences.retry}>
            Speichern erneut versuchen
          </PrimaryButton>
        </View>
      ) : null}
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
                { value: "SYMBOL", label: "Nur Kürzel" },
              ]}
              onChange={(value) => preferences.setLabelMode(value === "SYMBOL" ? "SYMBOL" : "FULL")}
              value={preferences.labelMode}
            />
          </View>
          <CardSeparator />
          <VisibilitySwitch
            color={palette.primary}
            icon="time-outline"
            label="Beginn und Ende"
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

      <PrimaryButton onPress={() => router.back()}>Fertig</PrimaryButton>
    </ScrollView>
  );
}
