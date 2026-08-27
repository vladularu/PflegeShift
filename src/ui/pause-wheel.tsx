import { useCallback, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";

import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { RADII } from "@/theme/tokens";

const PAUSE_OPTIONS = [0, 15, 30, 45, 60] as const;
export const PAUSE_WHEEL_ITEM_HEIGHT = 44;
const PAUSE_WHEEL_PADDING = PAUSE_WHEEL_ITEM_HEIGHT * 2;

function pauseIndexForOffset(offsetY: number): number {
  return Math.max(
    0,
    Math.min(PAUSE_OPTIONS.length - 1, Math.round(offsetY / PAUSE_WHEEL_ITEM_HEIGHT)),
  );
}

function pauseIndexForMinutes(minutes: number): number {
  const exactIndex = PAUSE_OPTIONS.findIndex((option) => option === minutes);
  if (exactIndex >= 0) return exactIndex;
  return PAUSE_OPTIONS.reduce<number>(
    (closestIndex, option, index) =>
      Math.abs(option - minutes) < Math.abs((PAUSE_OPTIONS[closestIndex] ?? 0) - minutes)
        ? index
        : closestIndex,
    0,
  );
}

function AnimatedPauseOption({
  index,
  minutes,
  onPress,
  scrollOffset,
  selected,
}: {
  readonly index: number;
  readonly minutes: number;
  readonly onPress: () => void;
  readonly scrollOffset: SharedValue<number>;
  readonly selected: boolean;
}) {
  const palette = usePalette();
  const motionStyle = useAnimatedStyle(() => {
    const distance = Math.abs(scrollOffset.value - index * PAUSE_WHEEL_ITEM_HEIGHT);
    return {
      opacity: interpolate(
        distance,
        [0, PAUSE_WHEEL_ITEM_HEIGHT, PAUSE_WHEEL_ITEM_HEIGHT * 2],
        [1, 0.56, 0.26],
        Extrapolation.CLAMP,
      ),
      transform: [
        {
          scale: interpolate(
            distance,
            [0, PAUSE_WHEEL_ITEM_HEIGHT, PAUSE_WHEEL_ITEM_HEIGHT * 2],
            [1, 0.96, 0.92],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  }, [index]);

  return (
    <Pressable
      accessibilityLabel={`${minutes} Minuten`}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={styles.item}
    >
      <Animated.Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        style={[
          styles.animatedText,
          { color: palette.text, fontWeight: selected ? "600" : "400" },
          motionStyle,
        ]}
      >
        {minutes} Min.
      </Animated.Text>
    </Pressable>
  );
}

function FlatPauseOption({
  minutes,
  onPress,
  selected,
}: {
  readonly minutes: number;
  readonly onPress: () => void;
  readonly selected: boolean;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityLabel={`${minutes} Minuten`}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={styles.item}
    >
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        style={[styles.flatText, { color: palette.text, fontWeight: selected ? "600" : "400" }]}
      >
        {minutes} Min.
      </Text>
    </Pressable>
  );
}

export function PauseWheel({
  animatedOptions = false,
  onChange,
  selectionStyle,
  selectionTestID,
  testID,
  value,
}: {
  readonly animatedOptions?: boolean;
  readonly onChange: (minutes: number) => void;
  readonly selectionStyle?: StyleProp<ViewStyle>;
  readonly selectionTestID?: string;
  readonly testID?: string;
  readonly value: number;
}) {
  const palette = usePalette();
  const initialIndex = pauseIndexForMinutes(value);
  const [previewIndex, setPreviewIndex] = useState(initialIndex);
  const previewIndexRef = useRef(initialIndex);
  const scrollRef = useRef<ScrollView>(null);
  const scrollOffset = useSharedValue(initialIndex * PAUSE_WHEEL_ITEM_HEIGHT);

  const selectIndex = useCallback(
    (index: number, notifyUnchanged = true) => {
      const changed = previewIndexRef.current !== index;
      if (changed) {
        previewIndexRef.current = index;
        setPreviewIndex(index);
      }
      if (changed || notifyUnchanged) onChange(PAUSE_OPTIONS[index]);
    },
    [onChange],
  );
  const selectOffset = useCallback(
    (offsetY: number, notifyUnchanged = true) => {
      selectIndex(pauseIndexForOffset(offsetY), notifyUnchanged);
    },
    [selectIndex],
  );
  const handleScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollOffset.value = event.contentOffset.y;
    },
  });
  const handleScrollEndDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      selectOffset(event.nativeEvent.targetContentOffset?.y ?? event.nativeEvent.contentOffset.y);
    },
    [selectOffset],
  );
  const handleMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      selectOffset(event.nativeEvent.contentOffset.y, false);
    },
    [selectOffset],
  );

  return (
    <View style={styles.container}>
      <View
        pointerEvents="none"
        style={[styles.selection, { backgroundColor: palette.surfaceMuted }, selectionStyle]}
        testID={selectionTestID}
      />
      <Animated.ScrollView
        accessibilityLabel="Pausendauer in 15-Minuten-Schritten"
        accessibilityRole="radiogroup"
        contentContainerStyle={styles.content}
        contentOffset={{ x: 0, y: initialIndex * PAUSE_WHEEL_ITEM_HEIGHT }}
        decelerationRate={0.97}
        onMomentumScrollEnd={handleMomentumEnd}
        onScroll={handleScroll}
        onScrollEndDrag={handleScrollEndDrag}
        ref={scrollRef}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        snapToAlignment="start"
        snapToInterval={PAUSE_WHEEL_ITEM_HEIGHT}
        style={styles.wheel}
        testID={testID}
      >
        {PAUSE_OPTIONS.map((minutes, index) => {
          const selected = previewIndex === index;
          const onPress = () => {
            selectIndex(index);
            scrollRef.current?.scrollTo?.({
              animated: true,
              y: index * PAUSE_WHEEL_ITEM_HEIGHT,
            });
          };
          return animatedOptions ? (
            <AnimatedPauseOption
              key={minutes}
              index={index}
              minutes={minutes}
              onPress={onPress}
              scrollOffset={scrollOffset}
              selected={selected}
            />
          ) : (
            <FlatPauseOption
              key={minutes}
              minutes={minutes}
              onPress={onPress}
              selected={selected}
            />
          );
        })}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: 210, height: 220 },
  selection: {
    position: "absolute",
    top: PAUSE_WHEEL_PADDING,
    right: 12,
    left: 12,
    height: PAUSE_WHEEL_ITEM_HEIGHT,
    borderRadius: RADII.control,
  },
  wheel: { flex: 1 },
  content: { paddingVertical: PAUSE_WHEEL_PADDING },
  item: {
    height: PAUSE_WHEEL_ITEM_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  flatText: { ...TYPOGRAPHY.body, fontVariant: ["tabular-nums"] },
  animatedText: { ...TYPOGRAPHY.pickerValue, fontVariant: ["tabular-nums"] },
});
