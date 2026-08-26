import { beforeEach, describe, expect, it } from "vitest";

import type { EntryLocation } from "@/domain/types";
import {
  consumeLocationPickerQuery,
  consumeLocationSelection,
  prepareLocationPicker,
  publishLocationSelection,
} from "@/features/location/location-selection";

const LOCATION: EntryLocation = {
  name: "Universitätsklinikum Bonn, Venusberg-Campus 1",
  latitude: 50.699,
  longitude: 7.103,
};

describe("location picker handoff", () => {
  beforeEach(() => {
    prepareLocationPicker(null);
    consumeLocationPickerQuery();
  });

  it("hands the current private location to the picker exactly once", () => {
    prepareLocationPicker(LOCATION);

    expect(consumeLocationPickerQuery()).toBe(LOCATION.name);
    expect(consumeLocationPickerQuery()).toBe("");
  });

  it("keeps the selected location in memory until the editor consumes it", () => {
    publishLocationSelection(LOCATION);

    expect(consumeLocationSelection()).toEqual(LOCATION);
    expect(consumeLocationSelection()).toBeUndefined();
  });

  it("clears a stale selection whenever a new picker session starts", () => {
    publishLocationSelection(LOCATION);
    prepareLocationPicker(null);

    expect(consumeLocationSelection()).toBeUndefined();
    expect(consumeLocationPickerQuery()).toBe("");
  });
});
