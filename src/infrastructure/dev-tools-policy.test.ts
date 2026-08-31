import { describe, expect, it, vi } from "vitest";

import {
  assertDevToolsAvailable,
  isDevToolsBuild,
  shouldLoadDevToolState,
} from "@/infrastructure/dev-tools-policy";

vi.mock("expo-updates", () => ({ channel: null }));

describe("developer tools build policy", () => {
  it("allows development, test, and preview-channel builds", () => {
    expect(isDevToolsBuild("development", null)).toBe(true);
    expect(isDevToolsBuild("test", null)).toBe(true);
    expect(isDevToolsBuild("production", "preview")).toBe(true);
    expect(isDevToolsBuild("production", "production")).toBe(false);
    expect(isDevToolsBuild("production", "e2e-test")).toBe(false);
    expect(isDevToolsBuild("production", null)).toBe(false);
    expect(isDevToolsBuild(undefined, null)).toBe(false);
  });

  it("fails closed outside development, tests, and preview", () => {
    expect(() => assertDevToolsAvailable("production", "preview")).not.toThrow();
    expect(() => assertDevToolsAvailable("production", "production")).toThrow("Preview-Builds");
    expect(() => assertDevToolsAvailable("production", "e2e-test")).toThrow("Preview-Builds");
    expect(() => assertDevToolsAvailable("production", null)).toThrow("Preview-Builds");
  });

  it("never loads developer database state in production", () => {
    expect(shouldLoadDevToolState(false, true, 1)).toBe(false);
    expect(shouldLoadDevToolState(true, false, 1)).toBe(false);
    expect(shouldLoadDevToolState(true, true, 0)).toBe(false);
    expect(shouldLoadDevToolState(true, true, 1)).toBe(true);
  });
});
