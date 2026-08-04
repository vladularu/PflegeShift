import { describe, expect, it } from "vitest";

import {
  assertDevToolsAvailable,
  isDevToolsBuild,
  shouldLoadDevToolState,
} from "@/infrastructure/dev-tools-policy";

describe("developer tools build policy", () => {
  it("allows only explicit development and test builds", () => {
    expect(isDevToolsBuild("development", undefined)).toBe(true);
    expect(isDevToolsBuild("test", undefined)).toBe(true);
    expect(isDevToolsBuild("production", undefined)).toBe(false);
    expect(isDevToolsBuild(undefined, undefined)).toBe(false);
    expect(isDevToolsBuild("preview", "0")).toBe(false);
    expect(isDevToolsBuild("production", "1")).toBe(true);
  });

  it("fails closed outside development and tests", () => {
    expect(() => assertDevToolsAvailable("production", "0")).toThrow("Entwicklungs-Builds");
    expect(() => assertDevToolsAvailable("preview", undefined)).toThrow("Entwicklungs-Builds");
  });

  it("never loads developer database state in production", () => {
    expect(shouldLoadDevToolState(false, true, 1)).toBe(false);
    expect(shouldLoadDevToolState(true, false, 1)).toBe(false);
    expect(shouldLoadDevToolState(true, true, 0)).toBe(false);
    expect(shouldLoadDevToolState(true, true, 1)).toBe(true);
  });
});
