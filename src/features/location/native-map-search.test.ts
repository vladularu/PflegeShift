import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  completeMapSearch,
  isMapSearchAvailable,
  resolveMapSearchSuggestion,
} from "@/features/location/native-map-search";

const nativeModule = vi.hoisted(() => ({
  completeAsync: vi.fn(),
  resolveAsync: vi.fn(),
}));

vi.mock("expo", () => ({
  requireOptionalNativeModule: () => nativeModule,
}));

describe("native MapKit location search", () => {
  beforeEach(() => {
    nativeModule.completeAsync.mockReset();
    nativeModule.resolveAsync.mockReset();
  });

  it("validates, trims and limits native completion data", async () => {
    nativeModule.completeAsync.mockResolvedValue([
      { id: " 1 ", title: " Hepp ", subtitle: " Bonn " },
      { id: "2", title: "Klinikum" },
      { id: "3", title: "Station" },
      { id: "4", title: "Praxis" },
      { id: "5", title: "Pflegeheim" },
      { id: "6", title: "Zu viel" },
      { id: "", title: "Ungültig" },
    ]);

    await expect(completeMapSearch("Hepp")).resolves.toEqual([
      { id: "1", title: "Hepp", subtitle: "Bonn" },
      { id: "2", title: "Klinikum" },
      { id: "3", title: "Station" },
      { id: "4", title: "Praxis" },
      { id: "5", title: "Pflegeheim" },
    ]);
    expect(isMapSearchAvailable()).toBe(true);
  });

  it("accepts only resolved locations with valid coordinates", async () => {
    nativeModule.resolveAsync.mockResolvedValue({
      name: " Heppy Green ",
      address: " Stiftstraße 6 ",
      latitude: 50.112,
      longitude: 8.671,
    });

    await expect(resolveMapSearchSuggestion("1")).resolves.toEqual({
      name: "Heppy Green",
      address: "Stiftstraße 6",
      latitude: 50.112,
      longitude: 8.671,
    });

    nativeModule.resolveAsync.mockResolvedValue({
      name: "Defekt",
      latitude: 120,
      longitude: 8.671,
    });
    await expect(resolveMapSearchSuggestion("2")).rejects.toThrow(
      "MapKit hat einen ungültigen Ort zurückgegeben.",
    );
  });

  it("declares the Apple-only Expo module and the required MapKit flow", () => {
    const moduleRoot = fileURLToPath(
      new URL("../../../modules/pflegeshift-map-search/", import.meta.url),
    );
    const config = JSON.parse(readFileSync(`${moduleRoot}/expo-module.config.json`, "utf8")) as {
      readonly platforms: readonly string[];
      readonly apple: { readonly modules: readonly string[]; readonly podspecPath: string };
    };
    const swift = readFileSync(`${moduleRoot}/ios/PflegeShiftMapSearchModule.swift`, "utf8");
    const rootLayout = readFileSync(
      fileURLToPath(new URL("../../../app/_layout.tsx", import.meta.url)),
      "utf8",
    );

    expect(config.platforms).toEqual(["apple"]);
    expect(config.apple).toEqual({
      modules: ["PflegeShiftMapSearchModule"],
      podspecPath: "ios/PflegeShiftMapSearch.podspec",
    });
    expect(swift).toContain("MKLocalSearchCompleter");
    expect(swift).toContain("MKLocalSearch.Request(completion: completion)");
    expect(swift).toContain("if exportedResults.count == resultLimit");
    expect(swift).toContain("latitude: 51.1657, longitude: 10.4515");
    expect(rootLayout).toMatch(
      /name="location-picker"[\s\S]*sheetAllowedDetents: \[0\.72, 0\.92\][\s\S]*sheetExpandsWhenScrolledToEdge: false/,
    );
  });
});
