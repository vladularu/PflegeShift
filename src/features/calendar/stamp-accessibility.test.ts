import { describe, expect, it } from "vitest";

import {
  announceStampResult,
  stampDayAccessibilityHint,
  stampResultAnnouncement,
  stampToolSelectedAnnouncement,
} from "@/features/calendar/stamp-accessibility";

describe("stamp accessibility messages", () => {
  it("explains days before and after selecting a stamp tool", () => {
    expect(stampDayAccessibilityHint(null)).toContain("Vorlage");
    expect(stampDayAccessibilityHint("Frühdienst")).toContain("Frühdienst");
    expect(stampToolSelectedAnnouncement("Frühdienst")).toContain("Kalendertage");
  });

  it("announces additions and removals with action and date", () => {
    expect(stampResultAnnouncement("Frühdienst", "2026-08-04", 0)).toBe(
      "Frühdienst am Dienstag, 04. August 2026 hinzugefügt.",
    );
    expect(stampResultAnnouncement("Frühdienst", "2026-08-04", 1)).toBe(
      "Frühdienst am Dienstag, 04. August 2026 entfernt.",
    );
    expect(stampResultAnnouncement("Frühdienst", "2026-08-04", 2)).toContain("2 passende Einträge");

    const messages: string[] = [];
    announceStampResult((message) => messages.push(message), "Frühdienst", "2026-08-04", 1);
    expect(messages).toEqual(["Frühdienst am Dienstag, 04. August 2026 entfernt."]);
  });
});
