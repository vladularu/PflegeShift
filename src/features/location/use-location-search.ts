import * as Location from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";

import type { GeocodedEntryLocation } from "@/domain/types";
import {
  completeMapSearch,
  isMapSearchAvailable,
  resolveMapSearchSuggestion,
} from "@/features/location/native-map-search";

const SEARCH_DELAY_MS = 280;
const SEARCH_RESULT_LIMIT = 5;

export type LocationSearchResult =
  | {
      readonly id: string;
      readonly kind: "MAPKIT";
      readonly name: string;
      readonly address?: string;
      readonly suggestionIdentifier: string;
    }
  | {
      readonly id: string;
      readonly kind: "GEOCODED";
      readonly name: string;
      readonly address?: string;
      readonly location: GeocodedEntryLocation;
    };

function cleanPart(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function uniqueParts(parts: readonly string[]): string[] {
  const seen = new Set<string>();
  return parts.filter((part) => {
    if (!part) return false;
    const key = part.toLocaleLowerCase("de-DE");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function locationFromGeocode(
  address: Location.LocationGeocodedAddress,
  coordinate: Location.LocationGeocodedLocation,
  fallback: string,
): GeocodedEntryLocation {
  const street = uniqueParts([cleanPart(address.street), cleanPart(address.streetNumber)]).join(
    " ",
  );
  const locality = uniqueParts([
    cleanPart(address.postalCode),
    cleanPart(address.city ?? address.subregion),
  ]).join(" ");
  const name =
    cleanPart(address.name) || street || cleanPart(address.city ?? address.subregion) || fallback;
  const addressParts = uniqueParts([
    street,
    locality,
    cleanPart(address.region),
    cleanPart(address.country),
  ]).filter((part) => part.toLocaleLowerCase("de-DE") !== name.toLocaleLowerCase("de-DE"));
  const addressLabel = addressParts.join(", ");

  return {
    name,
    ...(addressLabel ? { address: addressLabel } : {}),
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
  };
}

function deduplicate(
  locations: readonly GeocodedEntryLocation[],
): readonly GeocodedEntryLocation[] {
  return locations.filter((location, index, all) => {
    const key = `${location.name}|${location.address ?? ""}|${location.latitude}|${location.longitude}`;
    return (
      all.findIndex(
        (candidate) =>
          `${candidate.name}|${candidate.address ?? ""}|${candidate.latitude}|${candidate.longitude}` ===
          key,
      ) === index
    );
  });
}

async function searchWithGeocoder(query: string): Promise<readonly LocationSearchResult[]> {
  if (process.env.EXPO_OS === "android") {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) throw new Error("Standortberechtigung fehlt.");
  }

  const coordinates = (await Location.geocodeAsync(query)).slice(0, SEARCH_RESULT_LIMIT);
  const resolved = await Promise.all(
    coordinates.map(async (coordinate) => {
      try {
        const addresses = await Location.reverseGeocodeAsync(coordinate);
        return locationFromGeocode(addresses[0] ?? {}, coordinate, query);
      } catch {
        return null;
      }
    }),
  );
  return deduplicate(
    resolved.filter((location): location is GeocodedEntryLocation => location !== null),
  ).map((location) => ({
    id: `geocoded:${location.latitude}:${location.longitude}`,
    kind: "GEOCODED" as const,
    name: location.name,
    ...(location.address ? { address: location.address } : {}),
    location,
  }));
}

export async function searchLocations(query: string): Promise<readonly LocationSearchResult[]> {
  if (!isMapSearchAvailable()) return searchWithGeocoder(query);
  const suggestions = await completeMapSearch(query);
  return suggestions.map((suggestion) => ({
    id: `mapkit:${suggestion.id}`,
    kind: "MAPKIT" as const,
    name: suggestion.title,
    ...(suggestion.subtitle ? { address: suggestion.subtitle } : {}),
    suggestionIdentifier: suggestion.id,
  }));
}

export async function resolveLocationSearchResult(
  result: LocationSearchResult,
): Promise<GeocodedEntryLocation> {
  if (result.kind === "GEOCODED") return result.location;
  return resolveMapSearchSuggestion(result.suggestionIdentifier);
}

export function useLocationSearch(query: string): {
  readonly error: string | null;
  readonly loading: boolean;
  readonly resolveResult: (result: LocationSearchResult) => Promise<GeocodedEntryLocation>;
  readonly results: readonly LocationSearchResult[];
} {
  const [results, setResults] = useState<readonly LocationSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef(new Map<string, readonly LocationSearchResult[]>());

  useEffect(() => {
    const trimmed = query.trim();
    const cacheKey = trimmed.toLocaleLowerCase("de-DE");
    if (trimmed.length < 3) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setResults(cached);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          setLoading(true);
          setError(null);
          const nextResults = await searchLocations(trimmed);
          if (!active) return;
          cacheRef.current.set(cacheKey, nextResults);
          setResults(nextResults);
        } catch {
          if (active) {
            setResults([]);
            setError("Adressen nicht verfügbar. Du kannst den Ort trotzdem übernehmen.");
          }
        } finally {
          if (active) setLoading(false);
        }
      })();
    }, SEARCH_DELAY_MS);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  const resolveResult = useCallback(
    (result: LocationSearchResult) => resolveLocationSearchResult(result),
    [],
  );

  return { error, loading, resolveResult, results };
}
