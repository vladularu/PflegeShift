import { Image, type ColorValue, type ImageURISource } from "react-native";
import images from "./calendar-tab-icons.json";

const sources: readonly ImageURISource[] = images.map((image) => ({
  uri: `data:image/png;base64,${image}`,
  width: 28,
  height: 28,
  scale: 3,
}));

export function calendarTabIconSource(day: number): ImageURISource {
  const source = sources[day - 1];
  if (!source) throw new RangeError("Kalendertag muss zwischen 1 und 31 liegen.");
  return source;
}

export function CalendarTabIcon({
  day,
  color,
  size,
}: {
  readonly day: number;
  readonly color: ColorValue;
  readonly size: number;
}) {
  return (
    <Image
      testID="calendar-tab-day-icon"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      source={calendarTabIconSource(day)}
      resizeMode="contain"
      style={{ width: size, height: size, tintColor: color }}
    />
  );
}
