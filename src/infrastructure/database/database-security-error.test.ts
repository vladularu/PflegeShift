import { describe, expect, it } from "vitest";

import {
  DatabaseSecurityError,
  databaseSecurityMessage,
} from "@/infrastructure/database/database-security-error";

describe("database security errors", () => {
  it("shows approved recovery messages", () => {
    const error = new DatabaseSecurityError("missing-key", "Der lokale Datenbankschlüssel fehlt.");

    expect(databaseSecurityMessage(error)).toBe("Der lokale Datenbankschlüssel fehlt.");
  });

  it("never exposes raw native SQL errors", () => {
    const secret = "PRAGMA key = x'0123456789abcdef'";
    const message = databaseSecurityMessage(new Error(secret));

    expect(message).not.toContain("PRAGMA");
    expect(message).not.toContain("0123456789abcdef");
  });
});
