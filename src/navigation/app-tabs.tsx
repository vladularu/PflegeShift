import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";

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
    <Tabs
      initialRouteName="(calendar)"
      screenOptions={{
        freezeOnBlur: true,
        headerShown: false,
        lazy: true,
        tabBarActiveTintColor: palette.primary,
        tabBarHideOnKeyboard: true,
        tabBarInactiveTintColor: palette.textMuted,
        tabBarLabelStyle: TYPOGRAPHY.overline,
        tabBarStyle: { backgroundColor: palette.tabBar, borderTopColor: palette.border },
      }}
    >
      <Tabs.Screen
        listeners={({ navigation }) => ({
          tabPress: () => {
            requestCalendarTodayOnReselect(activeMonthCoordinator, navigation.isFocused());
          },
        })}
        name="(calendar)"
        options={{
          title: "Kalender",
          tabBarIcon: ({ color, size }) => (
            <Ionicons accessible={false} color={color} name="calendar-outline" size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="(analysis)"
        options={{
          title: "Auswertung",
          tabBarIcon: ({ color, size }) => (
            <Ionicons accessible={false} color={color} name="stats-chart-outline" size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="(templates)"
        options={{
          title: "Schichten",
          tabBarIcon: ({ color, size }) => (
            <Ionicons accessible={false} color={color} name="documents-outline" size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="(more)"
        options={{
          title: "Mehr",
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              accessible={false}
              color={color}
              name="ellipsis-horizontal-circle-outline"
              size={size}
            />
          ),
        }}
      />
    </Tabs>
  );
}
