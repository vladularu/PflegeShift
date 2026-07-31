import Ionicons from "@expo/vector-icons/Ionicons";
import { memo } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FullWindowOverlay } from "react-native-screens";

import type { QuickEntryAction } from "@/features/calendar/quick-entry-actions";
import { QuickEntryActionTile } from "@/features/calendar/quick-entry-action-tile";
import { usePalette } from "@/theme/palette";

export const QuickPlannerDock = memo(function QuickPlannerDock({
  actions,
  activeKey,
  busy,
  onSelectAction,
  onClose,
}: {
  readonly actions: readonly QuickEntryAction[];
  readonly activeKey: string | null;
  readonly busy: boolean;
  readonly onSelectAction: (action: QuickEntryAction) => void;
  readonly onClose: () => void;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const bottomOffset = Platform.OS === "web"
    ? 8
    : Math.max(insets.bottom - 6, 8);

  const dock = (
    <View
      style={{
        position: "absolute",
        left: 8,
        right: 8,
        bottom: bottomOffset,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: palette.border,
        borderRadius: 24,
        borderCurve: "continuous",
        backgroundColor: palette.surfaceRaised,
        boxShadow: `0 10px 28px ${palette.shadow}`,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 5,
        paddingVertical: 5,
        zIndex: 100,
        elevation: 24,
      }}
    >
      <ScrollView
        horizontal
        contentContainerStyle={{ alignItems: "center", gap: 1, paddingHorizontal: 2 }}
        style={{ flex: 1 }}
        showsHorizontalScrollIndicator={false}
      >
        {actions.map((action) => (
          <QuickEntryActionTile
            key={action.key}
            action={action}
            active={activeKey === action.key}
            disabled={busy}
            onPress={onSelectAction}
          />
        ))}
      </ScrollView>
      <View
        style={{
          width: 1,
          height: 42,
          marginHorizontal: 3,
          backgroundColor: palette.border,
        }}
      />
      <Pressable
        accessibilityLabel="Schnelleintrag schließen"
        accessibilityRole="button"
        hitSlop={4}
        onPress={onClose}
        style={({ pressed }) => ({
          width: 46,
          height: 58,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 18,
          backgroundColor: pressed ? palette.surfaceMuted : "transparent",
          opacity: pressed ? 0.72 : 1,
        })}
      >
        <Ionicons color={palette.text} name="close" size={22} />
      </Pressable>
    </View>
  );

  if (Platform.OS === "ios") {
    return (
      <FullWindowOverlay unstable_accessibilityContainerViewIsModal={false}>
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          {dock}
        </View>
      </FullWindowOverlay>
    );
  }

  return dock;
});
