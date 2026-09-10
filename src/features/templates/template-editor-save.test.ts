import { describe, expect, it, vi } from "vitest";

import type { SaveShiftTemplateInput, ShiftEntry, ShiftTemplate } from "@/domain/types";
import { saveTemplateWithOptionalCalendarEntry } from "@/features/templates/template-editor-save";

const template: ShiftTemplate = {
  id: "early",
  name: "Früh",
  type: "EARLY",
  allDay: false,
  startTime: "06:00",
  endTime: "14:12",
  breakMinutes: 30,
  color: "#7C4DCC",
  symbol: "F",
  notification: { amount: 30, unit: "MINUTE", direction: "BEFORE", reference: "START" },
  location: { name: "Heppenheim", latitude: 49.64, longitude: 8.64 },
  sortOrder: 10,
  revision: 1,
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-15T00:00:00.000Z",
  deletedAt: null,
};

const input: SaveShiftTemplateInput = {
  name: template.name,
  type: template.type,
  allDay: template.allDay,
  startTime: template.startTime,
  endTime: template.endTime,
  breakMinutes: template.breakMinutes,
  color: template.color,
  symbol: template.symbol,
  notification: template.notification,
  location: template.location,
  sortOrder: template.sortOrder,
};

function entry(): ShiftEntry {
  return {
    kind: "SHIFT",
    id: "shift-early",
    date: "2026-08-15",
    templateId: template.id,
    title: template.name,
    type: template.type,
    allDay: false,
    startTime: template.startTime,
    endTime: template.endTime,
    breakMinutes: template.breakMinutes,
    color: template.color,
    symbol: template.symbol,
    notification: null,
    location: null,
    note: null,
    overtimeMinutes: 0,
    holidayPremiumMode: "WITH_TIME_OFF",
    revision: 1,
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:00:00.000Z",
    deletedAt: null,
  };
}

describe("template editor quick-entry completion", () => {
  it("saves the template and applies it to the selected calendar day", async () => {
    const upsertTemplate = vi.fn(async () => template);
    const upsertShift = vi.fn(async () => entry());

    await saveTemplateWithOptionalCalendarEntry({
      entries: [],
      input,
      quickEntryDate: "2026-08-15",
      upsertShift,
      upsertTemplate,
    });

    expect(upsertTemplate).toHaveBeenCalledWith(input);
    expect(upsertShift).toHaveBeenCalledWith(
      expect.objectContaining({
        date: "2026-08-15",
        templateId: "early",
        title: "Früh",
        location: template.location,
        notification: template.notification,
      }),
    );
  });

  it("does not duplicate a service that is already assigned to the day", async () => {
    const upsertShift = vi.fn(async () => entry());

    await saveTemplateWithOptionalCalendarEntry({
      entries: [entry()],
      input,
      quickEntryDate: "2026-08-15",
      upsertShift,
      upsertTemplate: vi.fn(async () => template),
    });

    expect(upsertShift).not.toHaveBeenCalled();
  });
});
