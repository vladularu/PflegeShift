import { Tabs } from "expo-router";
import { Text } from "react-native";

import { usePalette } from "@/theme/palette";

function TabIcon({ symbol, color }: { readonly symbol: string; readonly color: string }) {
  return <Text style={{ color, fontSize: 19, fontWeight: "800" }}>{symbol}</Text>;
}

export default function TabLayout() {
  const palette = usePalette();
  return (
    <Tabs
      screenOptions={{
        headerShadowVisible: false,
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: palette.textMuted,
        tabBarStyle: {
          backgroundColor: palette.tabBar,
          borderTopColor: palette.border,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Kalender",
          tabBarIcon: ({ color }) => <TabIcon color={color} symbol="▦" />,
        }}
      />
      <Tabs.Screen
        name="templates"
        options={{
          title: "Vorlagen",
          tabBarIcon: ({ color }) => <TabIcon color={color} symbol="◫" />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "Mehr",
          tabBarIcon: ({ color }) => <TabIcon color={color} symbol="•••" />,
        }}
      />
    </Tabs>
  );
}
