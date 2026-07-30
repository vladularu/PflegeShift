import { Tabs } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { Text } from "react-native";

import { usePalette } from "@/theme/palette";

function TabIcon({
  name,
  fallback,
  color,
}: {
  readonly name: SymbolViewProps["name"];
  readonly fallback: string;
  readonly color: string;
}) {
  if (process.env.EXPO_OS === "ios") {
    return <SymbolView name={name} size={21} tintColor={color} weight="semibold" />;
  }
  return <Text style={{ color, fontSize: 17, fontWeight: "900" }}>{fallback}</Text>;
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
          tabBarIcon: ({ color }) => <TabIcon color={color} fallback="K" name="calendar" />,
        }}
      />
      <Tabs.Screen
        name="templates"
        options={{
          title: "Vorlagen",
          tabBarIcon: ({ color }) => <TabIcon color={color} fallback="V" name="square.stack.3d.up" />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "Mehr",
          tabBarIcon: ({ color }) => <TabIcon color={color} fallback="•••" name="ellipsis" />,
        }}
      />
    </Tabs>
  );
}
