import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";

import { usePalette } from "@/theme/palette";

export function AppTabs() {
  const palette = usePalette();
  return (
    <Tabs
      initialRouteName="(calendar)"
      screenOptions={{
        freezeOnBlur: true,
        headerShown: false,
        lazy: true,
        tabBarActiveTintColor: palette.primary,
        tabBarHideOnKeyboard: true,
        tabBarInactiveTintColor: palette.textMuted,
        tabBarStyle: { backgroundColor: palette.tabBar, borderTopColor: palette.border },
      }}
    >
      <Tabs.Screen name="(calendar)" options={{ title: "Kalender", tabBarIcon: ({ color, size }) => <Ionicons accessible={false} color={color} name="calendar-outline" size={size} /> }} />
      <Tabs.Screen name="(analysis)" options={{ title: "Auswertung", tabBarIcon: ({ color, size }) => <Ionicons accessible={false} color={color} name="stats-chart-outline" size={size} /> }} />
      <Tabs.Screen name="(salary)" options={{ title: "Gehalt", tabBarIcon: ({ color, size }) => <Ionicons accessible={false} color={color} name="wallet-outline" size={size} /> }} />
      <Tabs.Screen name="(more)" options={{ title: "Mehr", tabBarIcon: ({ color, size }) => <Ionicons accessible={false} color={color} name="ellipsis-horizontal-circle-outline" size={size} /> }} />
    </Tabs>
  );
}
