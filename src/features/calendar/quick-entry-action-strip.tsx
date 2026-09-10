import { Fragment, memo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import type { QuickEntryAction } from "@/features/calendar/quick-entry-actions";
import { QuickEntryActionTile } from "@/features/calendar/quick-entry-action-tile";
import { QUICK_PLANNER_METRICS } from "@/features/calendar/quick-planner-appearance";
import { DARK_PALETTE, LIGHT_PALETTE, usePalette } from "@/theme/palette";

export const QuickEntryActionStrip = memo(function QuickEntryActionStrip({
  actions,
  activeKey = null,
  busy,
  onSelectAction,
  tileWidth,
}: {
  readonly actions: readonly QuickEntryAction[];
  readonly activeKey?: string | null;
  readonly busy: boolean;
  readonly onSelectAction: (action: QuickEntryAction) => void;
  readonly tileWidth: number;
}) {
  const appPalette = usePalette();
  const palette = appPalette.dark ? LIGHT_PALETTE : DARK_PALETTE;

  return (
    <ScrollView
      accessibilityLabel="Schnellauswahl"
      alwaysBounceHorizontal={false}
      bounces={actions.length > 5}
      contentContainerStyle={styles.content}
      decelerationRate="fast"
      directionalLockEnabled
      horizontal
      nestedScrollEnabled
      showsHorizontalScrollIndicator={false}
      snapToAlignment="start"
      snapToInterval={tileWidth + StyleSheet.hairlineWidth}
      style={styles.scroll}
      testID="quick-planner-strip"
    >
      {actions.map((action, index) => (
        <Fragment key={action.key}>
          <QuickEntryActionTile
            action={action}
            active={activeKey === action.key}
            disabled={busy}
            onPress={onSelectAction}
            width={tileWidth}
          />
          {index === actions.length - 1 ? null : (
            <View style={[styles.separator, { backgroundColor: palette.text }]} />
          )}
        </Fragment>
      ))}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    minHeight: QUICK_PLANNER_METRICS.tileHeight,
    alignItems: "center",
    paddingHorizontal: 2,
  },
  separator: {
    width: StyleSheet.hairlineWidth,
    height: 50,
    opacity: 0.2,
  },
});
