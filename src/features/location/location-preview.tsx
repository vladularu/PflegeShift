import { ActionSheetIOS, Linking, Pressable } from "react-native";

import type { EntryLocation } from "@/domain/types";
import { LocationMap } from "@/features/location/location-map";
import { usePalette } from "@/theme/palette";

export function LocationPreview({ location }: { readonly location: EntryLocation }) {
  const palette = usePalette();

  function openMap() {
    const encodedName = encodeURIComponent(location.name);
    const apple = `https://maps.apple.com/?q=${encodedName}&ll=${location.latitude},${location.longitude}`;
    const google = `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`;
    if (process.env.EXPO_OS !== "ios") {
      void Linking.openURL(google);
      return;
    }
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ["Abbrechen", "Apple Karten", "Google Maps"], cancelButtonIndex: 0 },
      (index) => {
        if (index === 1) void Linking.openURL(apple);
        if (index === 2) void Linking.openURL(google);
      },
    );
  }

  return (
    <Pressable
      accessibilityLabel={`${location.name} in Karten öffnen`}
      accessibilityRole="button"
      onPress={openMap}
      style={{
        height: 126,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: palette.border,
        borderRadius: 16,
      }}
    >
      <LocationMap location={location} />
    </Pressable>
  );
}
