import { useLayoutEffect, useRef, type ReactNode } from "react";
import { ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { addMonths } from "@/engine/calendar";

type ScrollEvent = NativeSyntheticEvent<NativeScrollEvent>;

/** Three permanent slots. Date navigation never remounts the native scroll view. */
export function CalendarStablePager({
  month,
  months,
  height,
  enabled,
  revision,
  renderMonth,
  onBeginDrag,
  onSettled,
}: {
  month: string;
  months: readonly string[];
  height: number;
  enabled: boolean;
  revision: number;
  renderMonth: (month: string) => ReactNode;
  onBeginDrag: () => void;
  onSettled: (event: ScrollEvent) => void;
}) {
  const ref = useRef<ScrollView>(null);
  const dragging = useRef(false);
  useLayoutEffect(() => {
    dragging.current = false;
    ref.current?.scrollTo({ y: height, animated: false });
  }, [month, height, enabled, revision]);
  const settle = (event: ScrollEvent) => {
    if (!enabled || !dragging.current || height <= 0) return;
    dragging.current = false;
    const offset = Math.max(
      -1,
      Math.min(1, Math.round(event.nativeEvent.contentOffset.y / height) - 1),
    );
    const index = months.indexOf(addMonths(month, offset));
    if (index >= 0)
      onSettled({
        ...event,
        nativeEvent: {
          ...event.nativeEvent,
          contentOffset: { x: 0, y: index * height },
        },
      });
    // A new month is recentered in its layout effect, with the new content.
    if (offset === 0) ref.current?.scrollTo({ y: height, animated: false });
  };
  return (
    <ScrollView
      ref={ref}
      testID="calendar-month-pager"
      contentInsetAdjustmentBehavior="never"
      contentOffset={{ x: 0, y: height }}
      onContentSizeChange={() => {
        if (!dragging.current) ref.current?.scrollTo({ y: height, animated: false });
      }}
      scrollEnabled={enabled}
      pagingEnabled
      bounces={false}
      decelerationRate="fast"
      disableIntervalMomentum
      snapToInterval={height}
      showsVerticalScrollIndicator={false}
      onScrollBeginDrag={() => {
        if (!enabled) return;
        dragging.current = true;
        onBeginDrag();
      }}
      onMomentumScrollEnd={settle}
      onScrollEndDrag={(event) => {
        const { velocity, contentOffset } = event.nativeEvent;
        if (
          velocity?.y === 0 &&
          Math.abs(contentOffset.y / height - Math.round(contentOffset.y / height)) < 0.001
        )
          settle(event);
      }}
    >
      {[-1, 0, 1].map((offset) => (
        <View
          key={offset}
          testID={`calendar-slot-${offset}`}
          style={{ height }}
          accessibilityElementsHidden={offset !== 0}
          importantForAccessibility={offset === 0 ? "auto" : "no-hide-descendants"}
        >
          {renderMonth(addMonths(month, offset))}
        </View>
      ))}
    </ScrollView>
  );
}
