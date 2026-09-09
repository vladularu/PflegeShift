import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
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
  onVisibleMonth,
}: {
  month: string;
  months: readonly string[];
  height: number;
  enabled: boolean;
  revision: number;
  renderMonth: (month: string) => ReactNode;
  onBeginDrag: () => void;
  onSettled: (event: ScrollEvent) => void;
  onVisibleMonth?: (month: string) => void;
}) {
  const ref = useRef<ScrollView>(null);
  const dragging = useRef(false);
  const nativeOffset = useRef(height);
  const [recentering, setRecentering] = useState(false);
  const awaitingCenter = useRef(false);
  useLayoutEffect(() => {
    dragging.current = false;
    if (Math.abs(nativeOffset.current - height) > 1) {
      awaitingCenter.current = true;
      setRecentering(true);
    }
  }, [month, height, enabled, revision]);
  useLayoutEffect(() => {
    ref.current?.scrollTo({ y: height, animated: false });
  }, [month, height, enabled, revision, recentering]);
  // A command is not an acknowledgement. Keep all slots coherent until onScroll
  // reports the center; retry if the command raced a native layout transaction.
  useEffect(() => {
    if (!recentering) return;
    const retry = setInterval(() => {
      ref.current?.scrollTo({ y: height, animated: false });
    }, 200);
    return () => clearInterval(retry);
  }, [height, recentering]);
  const settle = (event: ScrollEvent) => {
    if (!enabled || awaitingCenter.current || !dragging.current || height <= 0) return;
    dragging.current = false;
    nativeOffset.current = event.nativeEvent.contentOffset.y;
    const offset = Math.max(
      -1,
      Math.min(1, Math.round(event.nativeEvent.contentOffset.y / height) - 1),
    );
    const index = months.indexOf(addMonths(month, offset));
    onVisibleMonth?.(addMonths(month, offset));
    if (Math.abs(nativeOffset.current - height) > 1) {
      awaitingCenter.current = true;
      setRecentering(true);
    }
    if (index >= 0)
      onSettled({
        ...event,
        nativeEvent: {
          ...event.nativeEvent,
          contentOffset: { x: 0, y: index * height },
        },
      });
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
      scrollEnabled={enabled && !recentering}
      scrollEventThrottle={16}
      onScroll={(event) => {
        nativeOffset.current = event.nativeEvent.contentOffset.y;
        if (dragging.current && !awaitingCenter.current && enabled && height > 0) {
          const slot = Math.max(-1, Math.min(1, Math.round(nativeOffset.current / height) - 1));
          onVisibleMonth?.(addMonths(month, slot));
        }
        if (awaitingCenter.current && Math.abs(nativeOffset.current - height) <= 1) {
          awaitingCenter.current = false;
          setRecentering(false);
        }
      }}
      pagingEnabled
      bounces={false}
      decelerationRate="fast"
      disableIntervalMomentum
      snapToInterval={height}
      showsVerticalScrollIndicator={false}
      onScrollBeginDrag={() => {
        if (!enabled || awaitingCenter.current) return;
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
          {renderMonth(recentering ? month : addMonths(month, offset))}
        </View>
      ))}
    </ScrollView>
  );
}
