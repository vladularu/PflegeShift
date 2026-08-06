import { memo } from "react";
import { ScrollView } from "react-native";

import type { QuickEntryAction } from "@/features/calendar/quick-entry-actions";
import { QuickEntryActionTile } from "@/features/calendar/quick-entry-action-tile";

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
  return (
    <ScrollView
      accessibilityLabel="Schnellauswahl"
      horizontal
      contentContainerStyle={{
        alignItems: "center",
        gap: 1,
        paddingHorizontal: 4,
        paddingRight: 4,
      }}
      decelerationRate="fast"
      directionalLockEnabled
      nestedScrollEnabled
      showsHorizontalScrollIndicator={false}
      snapToAlignment="start"
      snapToInterval={tileWidth + 1}
      style={{ flex: 1 }}
    >
      {actions.map((action) => (
        <QuickEntryActionTile
          key={action.key}
          action={action}
          active={activeKey === action.key}
          disabled={busy}
          onPress={onSelectAction}
          width={tileWidth}
        />
      ))}
    </ScrollView>
  );
});
