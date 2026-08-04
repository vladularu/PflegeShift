import { describe, expect, it } from "vitest";

import { appRuntimeLabel } from "@/infrastructure/app-version-label";

describe("app runtime version", () => {
  it("formats the version and SDK from runtime configuration", () => {
    expect(appRuntimeLabel("1.2.3", "54.0.0")).toBe("Version 1.2.3 · Expo SDK 54");
  });

  it("does not invent an application version when runtime metadata is missing", () => {
    expect(appRuntimeLabel(undefined, "54.0.0")).toBe("Version unbekannt · Expo SDK 54");
  });
});
