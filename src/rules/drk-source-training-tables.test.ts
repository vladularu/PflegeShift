import { describe, expect, it } from "vitest";
import source from "../../rules/sources/drk-rtv-anlage-3-training-tables.json";

// Independently transcribed from the hashed BTG PDF, printed pages 104, 109 and 110.
const publishedTables = [
  {
    validFrom: "2024-06-01",
    validTo: "2025-08-31",
    rows: [
      ["anlage-3-general", 123074, 128727, 133913, 141108],
      ["anlage-3a-a", 136006, 142839, 153955, null],
      ["anlage-3a-b", 128246, null, null, null],
    ],
  },
  {
    validFrom: "2025-09-01",
    validTo: "2026-09-30",
    rows: [
      ["anlage-3-general", 132074, 137727, 142913, 150108],
      ["anlage-3a-a", 145006, 151839, 162955, null],
      ["anlage-3a-b", 137246, null, null, null],
    ],
  },
  {
    validFrom: "2026-10-01",
    validTo: null,
    rows: [
      ["anlage-3-general", 141074, 146727, 151913, 159108],
      ["anlage-3a-a", 154006, 160839, 171955, null],
      ["anlage-3a-b", 146246, null, null, null],
    ],
  },
] as const;

describe("DRK training pay source-only tables", () => {
  it("pins the official document, annexes, scope and valid training years", () => {
    expect(source.kind).toBe("SOURCE_TABLE_ONLY");
    expect(source.agreementId).toBe("drk-rtv");
    expect(source.source.sha256).toBe(
      "97c25f8030b40897c10d828a92382655847212d5f924ce0132073034a13b19d8",
    );
    expect(source.source.pdfPages).toEqual([102, 104, 109, 110]);
    expect(source.categories.map(({ id, annexId, years }) => [id, annexId, years])).toEqual([
      ["anlage-3-general", "anlage-3", [1, 2, 3, 4]],
      ["anlage-3a-a", "anlage-3a", [1, 2, 3]],
      ["anlage-3a-b", "anlage-3a", [1]],
    ]);
    expect(source.categories[0].scope).toContain("Ausschluss");
    expect(source.categories[1].scope).toContain("nicht automatisch");
  });

  it("matches all 24 printed monthly amounts and leaves unavailable years empty", () => {
    expect(source.tables).toEqual(publishedTables);
    expect(
      source.tables
        .flatMap((table) => table.rows.flatMap((row) => row.slice(1)))
        .filter((amount) => amount !== null),
    ).toHaveLength(24);
    for (const table of source.tables) {
      for (const row of table.rows) {
        expect(
          row.slice(1).every((amount) => amount === null || Number.isSafeInteger(amount)),
        ).toBe(true);
      }
    }
  });
});
