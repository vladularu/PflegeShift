import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";

import { shiftSymbolDefinition } from "@/theme/shift-symbols";
import { COMPACT_TEXT_MAX_SCALE } from "@/theme/typography";

export function ShiftSymbol({
  value,
  color,
  size,
  style,
}: {
  readonly value: string;
  readonly color: string;
  readonly size: number;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const definition = shiftSymbolDefinition(value);
  return (
    <View style={[{ alignItems: "center", justifyContent: "center" }, style]}>
      {definition ? (
        <MaterialCommunityIcons color={color} name={definition.icon} size={size} />
      ) : (
        <Text
          adjustsFontSizeToFit
          maxFontSizeMultiplier={COMPACT_TEXT_MAX_SCALE}
          numberOfLines={1}
          style={
            {
              maxWidth: size * 1.5,
              color,
              fontSize: size < 16 ? size : size * 0.72,
              fontWeight: "700",
              textAlign: "center",
            } satisfies TextStyle
          }
        >
          {value}
        </Text>
      )}
    </View>
  );
}
