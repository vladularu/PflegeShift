import { describe, expect, it, vi } from "vitest";

import type { ShiftEntry, ShiftTemplate } from "@/domain/types";
import {
  buildQuickEntryActions,
  isQuickEntryStampAction,
  matchingQuickEntries,
  quickEntryServiceActions,
  quickEntryTemplateActions,
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

const absenceTemplate: ShiftTemplate = {
  ...template,
  id: "sick",
  name: "Krank",
  type: "SICK",
  startTime: null,
  endTime: null,
  breakMinutes: 0,
  color: "#F09A3E",
  symbol: "K",
  sortOrder: 2,
};

describe("shared quick-entry actions", () => {
  it("builds one ordered catalog for popup and dock", () => {
    const popupActions = buildQuickEntryActions([template, absenceTemplate]);
    const dockActions = buildQuickEntryActions([template, absenceTemplate]);

    expect(popupActions.map((action) => action.key)).toEqual([
      "template:early",
      "template:sick",
      "editor:shift",
      "editor:appointment",
    ]);
    expect(dockActions.map((action) => action.key)).toEqual(
      popupActions.map((action) => action.key),
    );
  });

  it("keeps editable absence presets in the shared template catalog", () => {
    const actions = buildQuickEntryActions([template, absenceTemplate]);
    expect(quickEntryTemplateActions(actions).map((action) => action.key)).toEqual([
      "template:early",
      "template:sick",
    ]);
    expect(quickEntryServiceActions(actions).map((action) => action.key)).toEqual([
      "template:early",
      "template:sick",
    ]);
  });

  it("saves templates and absences immediately through the same helper", async () => {
    const actions = buildQuickEntryActions([template, absenceTemplate]);
    const upsertShift = vi.fn(async (input) => input as ShiftEntry);
    const templateAction = actions[0];
    const sickAction = actions[1];

    if (!isQuickEntryStampAction(templateAction) || !isQuickEntryStampAction(sickAction)) {
      throw new Error("Expected stamp actions");
    }

    const saved = await saveQuickEntryAction(templateAction, "2026-08-13", upsertShift);
    await saveQuickEntryAction(sickAction, "2026-08-14", upsertShift);

    expect(saved).toEqual(expect.objectContaining({ date: "2026-08-13", type: "EARLY" }));

    expect(upsertShift).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        date: "2026-08-13",
        templateId: "early",
        type: "EARLY",
      }),
    );
    expect(upsertShift).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        date: "2026-08-14",
        templateId: "sick",
        type: "SICK",
      }),
    );
  });

  it("finds every identical stamp on the same day for toggle deletion", () => {
    const action = buildQuickEntryActions([template])[0];
    if (!isQuickEntryStampAction(action)) throw new Error("Expected stamp action");
    const existing = (id: string, date: string, templateId: string | null): ShiftEntry => ({
      kind: "SHIFT",
      id,
      date,
      templateId,
      title: "Früh",
      type: "EARLY",
      startTime: "07:00",
      endTime: "15:00",
      breakMinutes: 30,
      color: "#62B94C",
      symbol: "F",
      note: null,
      overtimeMinutes: 0,
      holidayPremiumMode: "WITH_TIME_OFF",
      revision: 1,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      deletedAt: null,
    });
    expect(
      matchingQuickEntries(action, "2026-08-14", [
        existing("first", "2026-08-14", "early"),
        existing("duplicate", "2026-08-14", "early"),
        existing("other-day", "2026-08-15", "early"),
        existing("custom", "2026-08-14", null),
      ]).map((entry) => entry.id),
    ).toEqual(["first", "duplicate"]);
  });

  it("recognizes legacy unlinked absences for toggle deletion", () => {
    const action = buildQuickEntryActions([absenceTemplate])[0];
    if (!isQuickEntryStampAction(action)) throw new Error("Expected stamp action");
    const existing: ShiftEntry = {
      kind: "SHIFT",
      id: "legacy-sick",
      date: "2026-08-14",
      templateId: null,
      title: "Krank",
      type: "SICK",
      startTime: null,
      endTime: null,
      breakMinutes: 0,
      color: "#F09A3E",
      symbol: "K",
      note: null,
      overtimeMinutes: 0,
      holidayPremiumMode: "WITH_TIME_OFF",
      revision: 1,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      deletedAt: null,
    };
    expect(matchingQuickEntries(action, existing.date, [existing])).toEqual([existing]);
  });

  it("opens the correct editor mode for Dienst and Termin", () => {
    const actions = buildQuickEntryActions([]);
    expect(quickEntryEditorTarget(actions[0], "2026-08-13")).toEqual({
      date: "2026-08-13",
      mode: "SHIFT",
    });
    expect(quickEntryEditorTarget(actions[1], "2026-08-14")).toEqual({
      date: "2026-08-14",
      mode: "APPOINTMENT",
    });
    expect(quickEntryEditorTarget(buildQuickEntryActions([template])[0], "2026-08-15")).toBeNull();
  });
});
