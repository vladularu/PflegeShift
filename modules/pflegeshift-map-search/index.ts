import { requireOptionalNativeModule } from "expo";

export interface MapSearchSuggestion {
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string;
}

export interface ResolvedMapLocation {
  readonly name: string;
  readonly address?: string;
  readonly latitude: number;
  readonly longitude: number;
}

interface NativeMapSearchSuggestion {
  readonly id?: unknown;
  readonly title?: unknown;
  readonly subtitle?: unknown;
}

interface NativeResolvedMapLocation {
  readonly name?: unknown;
  readonly address?: unknown;
  readonly latitude?: unknown;
  readonly longitude?: unknown;
}

interface PflegeShiftMapSearchNativeModule {
  readonly completeAsync: (query: string) => Promise<readonly NativeMapSearchSuggestion[]>;
  readonly resolveAsync: (identifier: string) => Promise<NativeResolvedMapLocation>;
}

const nativeModule =
  requireOptionalNativeModule<PflegeShiftMapSearchNativeModule>("PflegeShiftMapSearch");

function optionalText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function isMapSearchAvailable(): boolean {
  return nativeModule !== null;
}

export async function completeMapSearch(query: string): Promise<readonly MapSearchSuggestion[]> {
  if (!nativeModule) throw new Error("Die native MapKit-Ortssuche ist nicht verfügbar.");
  const results = await nativeModule.completeAsync(query);
  return results
    .flatMap((result): readonly MapSearchSuggestion[] => {
      const id = optionalText(result.id);
      const title = optionalText(result.title);
      if (!id || !title) return [];
      const subtitle = optionalText(result.subtitle);
      return [{ id, title, ...(subtitle ? { subtitle } : {}) }];
    })
    .slice(0, 5);
}

export async function resolveMapSearchSuggestion(identifier: string): Promise<ResolvedMapLocation> {
  if (!nativeModule) throw new Error("Die native MapKit-Ortssuche ist nicht verfügbar.");
  const result = await nativeModule.resolveAsync(identifier);
  const name = optionalText(result.name);
  const address = optionalText(result.address);
  const latitude = result.latitude;
  const longitude = result.longitude;
  if (
    !name ||
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    typeof longitude !== "number" ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new Error("MapKit hat einen ungültigen Ort zurückgegeben.");
  }
  return { name, ...(address ? { address } : {}), latitude, longitude };
}
