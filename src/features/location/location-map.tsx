import Ionicons from "@expo/vector-icons/Ionicons";
import { View } from "react-native";

import type { GeocodedEntryLocation } from "@/domain/types";
import { usePalette } from "@/theme/palette";

export function LocationMap({ location: _location }: { readonly location: GeocodedEntryLocation }) {
  const palette = usePalette();
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: palette.surfaceMuted,
      }}
    >
      <Ionicons color={palette.danger} name="location" size={30} />
    </View>
  );
}
