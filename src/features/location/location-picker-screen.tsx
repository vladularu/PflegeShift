import Ionicons from "@expo/vector-icons/Ionicons";
import * as Location from "expo-location";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import type { EntryLocation } from "@/domain/types";
import { publishLocationSelection } from "@/features/location/location-selection";
import type { RouteParam } from "@/navigation/route-params";
import { usePalette } from "@/theme/palette";
import { CardSeparator, SurfaceCard } from "@/ui/design-system";
import { warningFeedback } from "@/ui/haptics";

function firstParam(value: RouteParam): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function addressLabel(address: Location.LocationGeocodedAddress, fallback: string): string {
  const street = [address.street, address.streetNumber].filter(Boolean).join(" ");
  const locality = [address.postalCode, address.city ?? address.subregion]
    .filter(Boolean)
    .join(" ");
  return [street, locality, address.region, address.country].filter(Boolean).join(", ") || fallback;
}

export function LocationPickerScreen() {
  const palette = usePalette();
  const params = useLocalSearchParams<{ current?: RouteParam }>();
  const [query, setQuery] = useState(firstParam(params.current));
  const [results, setResults] = useState<readonly EntryLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setResults([]);
      setError(null);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          setLoading(true);
          setError(null);
          if (process.env.EXPO_OS === "android") {
            const permission = await Location.requestForegroundPermissionsAsync();
            if (!permission.granted) throw new Error("Standortberechtigung fehlt.");
          }
          const coordinates = (await Location.geocodeAsync(trimmed)).slice(0, 6);
          const resolved = await Promise.all(
            coordinates.map(async (coordinate) => {
              const addresses = await Location.reverseGeocodeAsync(coordinate);
              return {
                name: addressLabel(addresses[0] ?? {}, trimmed),
                latitude: coordinate.latitude,
                longitude: coordinate.longitude,
              } satisfies EntryLocation;
            }),
          );
          if (!active) return;
          setResults(
            resolved.filter(
              (result, index, all) => all.findIndex((item) => item.name === result.name) === index,
            ),
          );
        } catch {
          if (active) setError("Ort konnte nicht gesucht werden. Prüfe deine Verbindung.");
        } finally {
          if (active) setLoading(false);
        }
      })();
    }, 450);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  function choose(location: EntryLocation) {
    publishLocationSelection(location);
    router.back();
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.background, padding: 16, gap: 14 }}>
      <Stack.Screen options={{ title: "Ort" }} />
      <View
        style={{
          minHeight: 48,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          borderRadius: 14,
          backgroundColor: palette.surfaceRaised,
          paddingHorizontal: 14,
        }}
      >
        <Ionicons color={palette.textMuted} name="search" size={20} />
        <TextInput
          autoCorrect={false}
          autoFocus
          onChangeText={setQuery}
          placeholder="Ort oder Adresse"
          placeholderTextColor={palette.textMuted}
          returnKeyType="search"
          style={{ flex: 1, color: palette.text, fontSize: 16 }}
          value={query}
        />
        {loading ? <ActivityIndicator color={palette.primary} size="small" /> : null}
      </View>
      {error ? <Text style={{ color: palette.danger }}>{error}</Text> : null}
      <ScrollView keyboardShouldPersistTaps="handled">
        <SurfaceCard>
          {results.map((result, index) => (
            <View key={`${result.latitude}:${result.longitude}`}>
              {index > 0 ? <CardSeparator inset={54} /> : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => choose(result)}
                style={({ pressed }) => ({
                  minHeight: 58,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  opacity: pressed ? 0.58 : 1,
                  paddingHorizontal: 14,
                })}
              >
                <Ionicons color={palette.danger} name="location" size={24} />
                <Text style={{ flex: 1, color: palette.text, fontSize: 15 }}>{result.name}</Text>
              </Pressable>
            </View>
          ))}
        </SurfaceCard>
      </ScrollView>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          warningFeedback();
          publishLocationSelection(null);
          router.back();
        }}
        style={{ minHeight: 48, alignItems: "center", justifyContent: "center" }}
      >
        <Text style={{ color: palette.danger, fontWeight: "600" }}>Ort entfernen</Text>
      </Pressable>
    </View>
  );
}
