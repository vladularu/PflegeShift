import { describe, expect, it } from "vitest";

import type { ShiftTemplate } from "@/domain/types";
import { resolveShiftTypePreset } from "@/features/day-editor/shift-type-preset";

function template(
  input: Pick<
    ShiftTemplate,
    "id" | "name" | "type" | "startTime" | "endTime" | "breakMinutes" | "color" | "symbol"
  >,
): ShiftTemplate {
  return {
    ...input,
    sortOrder: 10,
    revision: 1,
    createdAt: "2026-07-31T08:00:00.000Z",
    updatedAt: "2026-07-31T08:00:00.000Z",
    deletedAt: null,
  };
}

describe("resolveShiftTypePreset", () => {
  it("übernimmt Zeiten, Pause und Darstellung aus der ersten passenden Vorlage", () => {
    const night = template({
      id: "night-custom",
      name: "Meine Nacht",
      type: "NIGHT",
      startTime: "20:45",
      endTime: "07:15",
      breakMinutes: 45,
      color: "#123456",
      symbol: "ND",
    });

    expect(resolveShiftTypePreset("NIGHT", [night])).toEqual({
      templateId: "night-custom",
      title: "Meine Nacht",
      startTime: "20:45",
      endTime: "07:15",
      breakMinutes: 45,
      color: "#123456",
      symbol: "ND",
    });
  });

  it("verwendet ohne Vorlage die Standardwerte des gewählten Diensttyps", () => {
    expect(resolveShiftTypePreset("LATE", [])).toMatchObject({
      templateId: null,
      startTime: "13:18",
      endTime: "21:30",
      breakMinutes: 30,
      symbol: "S",
    });
    expect(resolveShiftTypePreset("NIGHT", [])).toMatchObject({
      startTime: "21:00",
      endTime: "07:30",
      breakMinutes: 60,
      symbol: "N",
    });
  });

  it("entfernt bei Abwesenheiten Zeit- und Vorlagenbezug", () => {
    expect(resolveShiftTypePreset("VACATION", [])).toMatchObject({
      templateId: null,
      title: "Urlaub",
      startTime: null,
      endTime: null,
      breakMinutes: 0,
      symbol: "U",
    });
  });
});
