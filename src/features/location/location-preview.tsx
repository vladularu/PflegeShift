import { ActionSheetIOS, Linking, Pressable } from "react-native";

import type { EntryLocation, GeocodedEntryLocation } from "@/domain/types";
import { LocationMap } from "@/features/location/location-map";
import { usePalette } from "@/theme/palette";

export function LocationPreview({ location }: { readonly location: EntryLocation }) {
  const palette = usePalette();

  if (typeof location.latitude !== "number" || typeof location.longitude !== "number") {
    return null;
  }

  const geocodedLocation: GeocodedEntryLocation = {
    ...location,
    latitude: location.latitude,
    longitude: location.longitude,
  };

  function openMap() {
    const encodedName = encodeURIComponent(geocodedLocation.name);
    const apple = `https://maps.apple.com/?q=${encodedName}&ll=${geocodedLocation.latitude},${geocodedLocation.longitude}`;
    const google = `https://www.google.com/maps/search/?api=1&query=${geocodedLocation.latitude},${geocodedLocation.longitude}`;
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
      accessibilityLabel={`${geocodedLocation.name} in Karten öffnen`}
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
      <LocationMap location={geocodedLocation} />
    </Pressable>
  );
}
