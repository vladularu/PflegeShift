import { describe, expect, it, vi } from "vitest";

import type { ShiftEntry, ShiftTemplate } from "@/domain/types";
import {
  buildQuickEntryActions,
  isQuickEntryStampAction,
  quickEntryEditorTarget,
  saveQuickEntryAction,
} from "@/features/calendar/quick-entry-actions";

const template: ShiftTemplate = {
  id: "early",
  name: "Früh",
  type: "EARLY",
  startTime: "07:00",
  endTime: "15:00",
  breakMinutes: 30,
  color: "#62B94C",
  symbol: "F",
  sortOrder: 1,
  revision: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  deletedAt: null,
};

describe("shared quick-entry actions", () => {
  it("builds one ordered catalog for popup and dock", () => {
    const popupActions = buildQuickEntryActions([template]);
    const dockActions = buildQuickEntryActions([template]);

    expect(popupActions.map((action) => action.key)).toEqual([
      "template:early",
      "absence:VACATION",
      "absence:SICK",
      "absence:FREE",
      "editor:shift",
      "editor:appointment",
    ]);
    expect(dockActions.map((action) => action.key)).toEqual(
      popupActions.map((action) => action.key),
    );
  });

  it("saves templates and absences immediately through the same helper", async () => {
    const actions = buildQuickEntryActions([template]);
    const upsertShift = vi.fn(async (input) => input as ShiftEntry);
    const templateAction = actions[0];
    const vacationAction = actions[1];

    if (!isQuickEntryStampAction(templateAction) || !isQuickEntryStampAction(vacationAction)) {
      throw new Error("Expected stamp actions");
    }

    const saved = await saveQuickEntryAction(templateAction, "2026-08-13", upsertShift);
    await saveQuickEntryAction(vacationAction, "2026-08-14", upsertShift);

    expect(saved).toEqual(expect.objectContaining({ date: "2026-08-13", type: "EARLY" }));

    expect(upsertShift).toHaveBeenNthCalledWith(1, expect.objectContaining({
      date: "2026-08-13",
      templateId: "early",
      type: "EARLY",
    }));
    expect(upsertShift).toHaveBeenNthCalledWith(2, expect.objectContaining({
      date: "2026-08-14",
      type: "VACATION",
    }));
  });

  it("opens the correct editor mode for Dienst and Termin", () => {
    const actions = buildQuickEntryActions([]);
    expect(quickEntryEditorTarget(actions[3], "2026-08-13")).toEqual({
      date: "2026-08-13",
      mode: "SHIFT",
    });
    expect(quickEntryEditorTarget(actions[4], "2026-08-14")).toEqual({
      date: "2026-08-14",
      mode: "APPOINTMENT",
    });
    expect(quickEntryEditorTarget(actions[0], "2026-08-15")).toBeNull();
  });
});
