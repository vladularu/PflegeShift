import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";

type ScrollEvent = NativeSyntheticEvent<NativeScrollEvent>;

/** Fixed native positions and a five-month window keyed by actual month.
 * Four bodies survive a one-month swipe; only the entering edge mounts.
 * The selected body survives its year transition with its moving date glyphs. */
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
  const index = Math.max(0, months.indexOf(month));
  const [renderMonthKey, setRenderMonthKey] = useState(month);
  const renderIndex = Math.max(0, months.indexOf(renderMonthKey));
  const target = index * height;
  const [initialOffset] = useState({ x: 0, y: target });
  const nativeOffset = useRef(target);
  const settledMonth = useRef(month);
  const previous = useRef({ height, revision, enabled, first: months[0] });
  const pendingTarget = useRef<number | null>(null);
  const [positioning, setPositioning] = useState(false);
  useLayoutEffect(() => {
    const old = previous.current;
    const external =
      settledMonth.current !== month ||
      old.height !== height ||
      old.revision !== revision ||
      old.enabled !== enabled ||
      old.first !== months[0];
    previous.current = { height, revision, enabled, first: months[0] };
    if (!external) return;
    setRenderMonthKey(month);
    dragging.current = false;
    settledMonth.current = month;
    pendingTarget.current = Math.abs(nativeOffset.current - target) > 1 ? target : null;
    setPositioning(pendingTarget.current !== null);
    ref.current?.scrollTo({ y: target, animated: false });
  }, [month, height, revision, enabled, months, target]);
  // Recovery only for explicit jumps/layout changes racing native layout.
  // Ordinary settled gestures never enter this state.
  useEffect(() => {
    if (!positioning) return;
    const retry = setInterval(() => {
      if (pendingTarget.current !== null)
        ref.current?.scrollTo({ y: pendingTarget.current, animated: false });
    }, 200);
    return () => clearInterval(retry);
  }, [positioning]);

  const monthAt = (y: number) =>
    months[Math.max(0, Math.min(months.length - 1, Math.round(y / height)))];
  const settle = (event: ScrollEvent) => {
    if (!enabled || pendingTarget.current !== null || !dragging.current || height <= 0) return;
    const y = event.nativeEvent.contentOffset.y;
    // Intermediate end events from an interrupted native snap are not commits.
    if (Math.abs(y / height - Math.round(y / height)) > 0.001) return;
    dragging.current = false;
    nativeOffset.current = y;
    const next = monthAt(y);
    setRenderMonthKey(next);
    settledMonth.current = next;
    onVisibleMonth?.(next);
    onSettled(event);
  };
  const start = Math.max(0, renderIndex - 2);
  const end = Math.min(months.length - 1, renderIndex + 2);
  return (
    <ScrollView
      ref={ref}
      testID="calendar-month-pager"
      contentInsetAdjustmentBehavior="never"
      contentOffset={initialOffset}
      onContentSizeChange={() => {
        if (pendingTarget.current !== null)
          ref.current?.scrollTo({ y: pendingTarget.current, animated: false });
      }}
      scrollEnabled={enabled && !positioning}
      scrollEventThrottle={16}
      onScroll={(event) => {
        const y = event.nativeEvent.contentOffset.y;
        nativeOffset.current = y;
        if (pendingTarget.current !== null) {
          if (Math.abs(y - pendingTarget.current) <= 1) {
            pendingTarget.current = null;
            setPositioning(false);
          }
        } else if (dragging.current && enabled && height > 0) {
          const visible = monthAt(y);
          setRenderMonthKey(visible);
          onVisibleMonth?.(visible);
        }
      }}
      pagingEnabled
      bounces={false}
      decelerationRate="fast"
      disableIntervalMomentum
      snapToInterval={height}
      showsVerticalScrollIndicator={false}
      onScrollBeginDrag={() => {
        if (!enabled || pendingTarget.current !== null) return;
        dragging.current = true;
        onBeginDrag();
      }}
      onMomentumScrollEnd={settle}
      onScrollEndDrag={(event) => {
        if (event.nativeEvent.velocity?.y === 0) settle(event);
      }}
    >
      <View key="before" style={{ height: start * height }} />
      {[-2, -1, 0, 1, 2]
        .filter((offset) => months[renderIndex + offset])
        .map((offset) => (
          <View
            key={months[renderIndex + offset]}
            testID={`calendar-slot-${offset}`}
            style={{ height }}
            accessibilityElementsHidden={offset !== 0}
            importantForAccessibility={offset === 0 ? "auto" : "no-hide-descendants"}
          >
            {renderMonth(months[renderIndex + offset])}
          </View>
        ))}
      <View key="after" style={{ height: (months.length - end - 1) * height }} />
    </ScrollView>
  );
}
