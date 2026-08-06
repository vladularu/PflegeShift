import Ionicons from "@expo/vector-icons/Ionicons";
import { memo } from "react";
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FullWindowOverlay } from "react-native-screens";

import { calculateQuickPlannerLayout } from "@/features/calendar/calendar-layout";
import type { QuickEntryAction } from "@/features/calendar/quick-entry-actions";
import { QuickEntryActionStrip } from "@/features/calendar/quick-entry-action-strip";
import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";

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
  const { width } = useWindowDimensions();
  const bottomOffset = Platform.OS === "web" ? 8 : Math.max(insets.bottom - 6, 8);
  const { tileWidth } = calculateQuickPlannerLayout(width);

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
      <QuickEntryActionStrip
        actions={actions}
        activeKey={activeKey}
        busy={busy}
        onSelectAction={onSelectAction}
        tileWidth={tileWidth}
      />
      <View
        style={{
          width: 1,
          height: 42,
          marginHorizontal: 3,
          backgroundColor: palette.border,
        }}
      />
      <Pressable
        accessibilityLabel="Planung beenden"
        accessibilityRole="button"
        hitSlop={4}
        onPress={onClose}
        style={({ pressed }) => ({
          width: 64,
          height: 58,
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          borderRadius: 18,
          backgroundColor: pressed ? palette.surfaceMuted : "transparent",
          opacity: pressed ? 0.72 : 1,
        })}
      >
        <Ionicons color={palette.primary} name="checkmark" size={20} />
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          style={{ color: palette.primary, ...TYPOGRAPHY.caption, fontWeight: "600" }}
        >
          Fertig
        </Text>
      </Pressable>
    </View>
  );

  if (Platform.OS === "ios") {
    return (
      <FullWindowOverlay unstable_accessibilityContainerViewIsModal={false}>
        <View style={[StyleSheet.absoluteFill, { pointerEvents: "box-none" }]}>{dock}</View>
      </FullWindowOverlay>
    );
  }

  return dock;
});
