import MapView, { Marker } from "react-native-maps";

import type { GeocodedEntryLocation } from "@/domain/types";

export function LocationMap({ location }: { readonly location: GeocodedEntryLocation }) {
  return (
    <MapView
      initialRegion={{
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.018,
        longitudeDelta: 0.018,
      }}
      pointerEvents="none"
      style={{ flex: 1 }}
    >
      <Marker coordinate={location} />
    </MapView>
  );
}
