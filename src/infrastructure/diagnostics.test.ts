import { beforeEach, describe, expect, it } from "vitest";

import {
  clearDiagnosticEvents,
  listDiagnosticEvents,
  recordDiagnostic,
} from "@/infrastructure/diagnostics";

describe("privacy-safe diagnostics", () => {
  beforeEach(clearDiagnosticEvents);

  it("records only fixed metadata and never raw messages, stacks or user content", () => {
    const error = new Error("Patientin Erika · Nachtdienst · private Notiz");
    error.stack = "sensitive stack with shift title";
    recordDiagnostic("provider", "PROVIDER_RELOAD_FAILED", error);

    const serialized = JSON.stringify(listDiagnosticEvents());
    expect(serialized).toContain("PROVIDER_RELOAD_FAILED");
    expect(serialized).toContain("Error");
    expect(serialized).not.toContain("Erika");
    expect(serialized).not.toContain("Nachtdienst");
    expect(serialized).not.toContain("private Notiz");
    expect(serialized).not.toContain("sensitive stack");
  });

  it("sanitizes caller-controlled classes and bounds retained events", () => {
    const malformed = new Error("raw");
    malformed.name = "Alice Nachtschicht";
    for (let index = 0; index < 60; index += 1) {
      recordDiagnostic("app", "APP_RENDER_FAILED", malformed);
    }

    expect(listDiagnosticEvents()).toHaveLength(50);
    expect(listDiagnosticEvents()[0].errorClass).toBe("UnknownError");
  });
});
