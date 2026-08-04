import { describe, expect, it } from "vitest";

import {
  APP_RENDER_FAILURE_MESSAGE,
  ConcurrencyError,
  DATA_LOAD_FAILURE_MESSAGE,
  UserFacingError,
  userFacingErrorMessage,
} from "@/domain/errors";

describe("user-facing error policy", () => {
  it("keeps explicit domain messages", () => {
    expect(userFacingErrorMessage(new UserFacingError("Bitte Eingabe prüfen."), "Fallback")).toBe(
      "Bitte Eingabe prüfen.",
    );
    expect(userFacingErrorMessage(new ConcurrencyError(), "Fallback")).toContain(
      "zwischenzeitlich geändert",
    );
  });

  it("never exposes unknown technical details", () => {
    const technical = new Error("SQL failure at C:\\secret\\database.db");

    expect(userFacingErrorMessage(technical, DATA_LOAD_FAILURE_MESSAGE)).toBe(
      DATA_LOAD_FAILURE_MESSAGE,
    );
    expect(userFacingErrorMessage(technical, APP_RENDER_FAILURE_MESSAGE)).not.toContain("SQL");
    expect(userFacingErrorMessage(technical, APP_RENDER_FAILURE_MESSAGE)).not.toContain("secret");
  });
});
