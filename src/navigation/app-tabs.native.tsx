import Ionicons from "@expo/vector-icons/Ionicons";
import { NativeTabs } from "expo-router/unstable-native-tabs";

import { usePalette } from "@/theme/palette";

export function AppTabs() {
  const palette = usePalette();
  return (
    <NativeTabs
      backgroundColor={palette.tabBar}
      iconColor={{ default: palette.textMuted, selected: palette.primary }}
      labelStyle={{
        default: {
          color: palette.textMuted,
          fontSize: 11,
          fontWeight: 600,
        },
        selected: {
          color: palette.primary,
          fontSize: 11,
          fontWeight: 600,
        },
      }}
      minimizeBehavior="never"
      tintColor={palette.primary}
    >
      <NativeTabs.Trigger name="(calendar)">
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
