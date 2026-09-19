import Ionicons from "@expo/vector-icons/Ionicons";
import { NativeTabs } from "expo-router/unstable-native-tabs";

import {
  requestCalendarTodayOnReselect,
  useActiveMonthCoordinator,
} from "@/navigation/active-month";
import { usePalette } from "@/theme/palette";
import { TYPOGRAPHY } from "@/theme/typography";

export function AppTabs() {
  const palette = usePalette();
  const activeMonthCoordinator = useActiveMonthCoordinator();
  return (
    <NativeTabs
      backgroundColor={palette.tabBar}
      iconColor={{ default: palette.textMuted, selected: palette.accent }}
      labelStyle={{
        default: {
          color: palette.textMuted,
          fontSize: TYPOGRAPHY.overline.fontSize,
          fontWeight: TYPOGRAPHY.overline.fontWeight,
        },
        selected: {
          color: palette.primary,
          fontSize: TYPOGRAPHY.overline.fontSize,
          fontWeight: TYPOGRAPHY.overline.fontWeight,
        },
      }}
      minimizeBehavior="never"
      tintColor={palette.accent}
    >
      <NativeTabs.Trigger
        disableScrollToTop
        listeners={({ navigation }) => ({
          tabPress: () => {
            requestCalendarTodayOnReselect(activeMonthCoordinator, navigation.isFocused());
          },
        })}
        name="(calendar)"
      >
        <NativeTabs.Trigger.Label>Kalender</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf="calendar"
          src={<NativeTabs.Trigger.VectorIcon family={Ionicons} name="calendar-outline" />}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(analysis)">
        <NativeTabs.Trigger.Label>Auswertung</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf="chart.bar.xaxis"
          src={<NativeTabs.Trigger.VectorIcon family={Ionicons} name="stats-chart-outline" />}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(templates)">
        <NativeTabs.Trigger.Label>Schichten</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf="rectangle.stack"
          src={<NativeTabs.Trigger.VectorIcon family={Ionicons} name="documents-outline" />}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(more)">
        <NativeTabs.Trigger.Label>Mehr</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf="ellipsis.circle"
          src={
            <NativeTabs.Trigger.VectorIcon
              family={Ionicons}
              name="ellipsis-horizontal-circle-outline"
            />
          }
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
