import appConfig from "../../../app.json";
import { describe, expect, it } from "vitest";

describe("native database security configuration", () => {
  it("builds expo-sqlite with SQLCipher support", () => {
    const sqlitePlugin = appConfig.expo.plugins.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === "expo-sqlite",
    );

    expect(sqlitePlugin).toEqual(["expo-sqlite", expect.objectContaining({ useSQLCipher: true })]);
  });

  it("registers SecureStore for the database key", () => {
    expect(appConfig.expo.plugins).toContain("expo-secure-store");
  });

  it("prevents Android from restoring an encrypted database without its device key", () => {
    expect(appConfig.expo.android.allowBackup).toBe(false);
  });
});
