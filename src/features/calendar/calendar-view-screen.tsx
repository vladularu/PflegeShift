import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { ScrollView, Switch, View } from "react-native";

import { useCalendarPreferences } from "@/features/calendar/calendar-preferences";
import { usePalette } from "@/theme/palette";
import {
  CardSeparator,
  RowButton,
  SectionHeader,
  SurfaceCard,
} from "@/ui/design-system";
import { PrimaryButton } from "@/ui/form-controls";

function VisibilitySwitch({
  color,
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
}) {
  return (
    <RowButton
      leading={
        <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: color }}>
          <Ionicons color="#FFFFFF" name={icon} size={19} />
        </View>
      }
      title={label}
      trailing={<Switch onValueChange={onChange} value={value} />}
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
            color="#2F80ED"
            icon="calendar-outline"
            label="Termine"
            onChange={preferences.setShowAppointments}
            value={preferences.showAppointments}
          />
          <CardSeparator inset={64} />
          <VisibilitySwitch
            color="#8B5BD1"
            icon="sparkles-outline"
            label="Feiertage"
            onChange={preferences.setShowHolidays}
            value={preferences.showHolidays}
          />
        </SurfaceCard>
      </View>

      <PrimaryButton onPress={() => router.back()}>Fertig</PrimaryButton>
    </ScrollView>
  );
}
