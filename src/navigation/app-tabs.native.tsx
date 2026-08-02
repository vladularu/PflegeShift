import Ionicons from "@expo/vector-icons/Ionicons";
import {
  Icon,
  Label,
  NativeTabs,
  VectorIcon,
} from "expo-router/unstable-native-tabs";

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
          fontSize: 12,
          fontWeight: 700,
        },
        selected: {
          color: palette.primary,
          fontSize: 12,
          fontWeight: 700,
        },
      }}
      minimizeBehavior="never"
      tintColor={palette.primary}
    >
      <NativeTabs.Trigger name="(calendar)">
        <Label>Kalender</Label>
        <Icon sf="calendar" androidSrc={<VectorIcon family={Ionicons} name="calendar-outline" />} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(analysis)">
        <Label>Auswertung</Label>
        <Icon sf="chart.bar.xaxis" androidSrc={<VectorIcon family={Ionicons} name="stats-chart-outline" />} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(salary)">
        <Label>Gehalt</Label>
        <Icon sf="eurosign.circle" androidSrc={<VectorIcon family={Ionicons} name="wallet-outline" />} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(more)">
        <Label>Mehr</Label>
        <Icon sf="ellipsis.circle" androidSrc={<VectorIcon family={Ionicons} name="ellipsis-horizontal-circle-outline" />} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
