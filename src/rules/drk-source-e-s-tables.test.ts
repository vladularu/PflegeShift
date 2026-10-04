import { createHash } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";
import eRaw from "../../rules/sources/drk-rtv-anlage-a1-e-tables.json";
import sRaw from "../../rules/sources/drk-rtv-anlage-a3-s-tables.json";

type SourceRow = readonly [string, number | null, number, number, number, number, number];
interface SourceTables {
  readonly kind: string;
  readonly agreementId: string;
  readonly annexId: string;
  readonly source: {
    readonly sha256: string;
    readonly pdfPages: readonly number[];
  };
  readonly columns: readonly string[];
  readonly tables: readonly {
    readonly validFrom: string;
    readonly validTo: string | null;
    readonly pdfPage: number;
    readonly rows: readonly SourceRow[];
  }[];
}

const E = eRaw as unknown as SourceTables;
const S = sRaw as unknown as SourceTables;

// Calculated independently from the official PDF tables, not from these JSON files.
const DIGESTS = {
  E: [
    "8a293020d0ac5c8f5134e50ec1deeceaf2510fd6acee64708ea30ada505e92f3",
    "84e50bb158a432495a40d86711a5ad9f8dbb5cbe28255cbb10297ea43f99aee1",
    "9ae4c653eb4333db2322aa65aec8c91f62feb584ce1c9a42397cbc07e2312165",
    "ef1392925932ef1ee61fc26029aef8ac85eadbcea3878585266e1f52adc3a36b",
  ],
  S: [
    "890f2b9cf7ebadbedce25959b92275da9e9115622b918a03cf070f32e34194e4",
    "0ba434eff87d49600f868b9736b6c8dd409b9fcd2b6bb476aa03af7cb6f72e37",
    "61ff892be05c9530d464ff8522e8227dde2036b8fd89c1d2d486fc613b4b30f2",
  ],
} as const;

function tableDigest(rows: readonly SourceRow[]): string {
  const canonical = rows
    .map(
      ([groupId, ...cells]) =>
        `${groupId}:${cells.map((value) => (value === null ? "_" : String(value))).join(",")}`,
    )
    .join("\n");
  return createHash("sha256").update(`${canonical}\n`, "utf8").digest("hex");
}

function amount(source: SourceTables, tableIndex: number, groupId: string, step: number) {
  return source.tables[tableIndex].rows.find(([group]) => group === groupId)?.[step];
}

describe("DRK-RTV Anlage A1/E and A3/S published source matrices", () => {
  it.each([
    [E, "anlage-a1", ["2024-06-01", "2025-09-01", "2026-10-01", "2027-10-01"], 21, 125, DIGESTS.E],
    [S, "anlage-a3", ["2024-10-01", "2025-09-01", "2026-10-01"], 16, 96, DIGESTS.S],
  ] as const)(
    "preserves every %s source table cell and its date boundary",
    (source, annexId, dates, groupCount, cellCount, digests) => {
      expect(source.kind).toBe("SOURCE_TABLE_ONLY");
      expect(source.agreementId).toBe("drk-rtv");
      expect(source.annexId).toBe(annexId);
      expect(source.source.sha256).toBe(
        "97c25f8030b40897c10d828a92382655847212d5f924ce0132073034a13b19d8",
      );
      expect(source.columns).toEqual(["groupId", "s1", "s2", "s3", "s4", "s5", "s6"]);
      expect(source.tables.map((table) => table.validFrom)).toEqual(dates);
      for (const [index, table] of source.tables.entries()) {
        expect(source.source.pdfPages).toContain(table.pdfPage);
        expect(table.rows).toHaveLength(groupCount);
        expect(new Set(table.rows.map(([groupId]) => groupId)).size).toBe(groupCount);
        expect(
          table.rows.reduce(
            (total, row) => total + row.slice(1).filter(Number.isInteger).length,
            0,
          ),
        ).toBe(cellCount);
        expect(tableDigest(table.rows)).toBe(digests[index]);
        for (const row of table.rows) {
          expect(row).toHaveLength(7);
          const [, ...cells] = row;
          for (const cell of cells) {
            if (cell !== null) expect(Number.isSafeInteger(cell) && cell > 0).toBe(true);
          }
        }
        if (index < source.tables.length - 1) {
          expect(Temporal.PlainDate.from(table.validTo!).add({ days: 1 }).toString()).toBe(
            source.tables[index + 1].validFrom,
          );
        }
      }
      expect(source.tables.at(-1)?.validTo).toBeNull();
    },
  );

  it("keeps the E9c October 2027 change and never invents E1 stage 1", () => {
    expect(amount(E, 1, "e9c", 4)).toBe(397408);
    expect(amount(E, 2, "e9c", 4)).toBe(449655);
    expect(amount(E, 3, "e9c", 4)).toBe(454655);
    for (let index = 0; index < E.tables.length; index++)
      expect(amount(E, index, "e1", 1)).toBeNull();
  });

  it("preserves independent S-group values rather than reusing TVöD SuE", () => {
    expect(amount(S, 1, "s18", 1)).toBe(461365);
    expect(amount(S, 2, "s2", 6)).toBe(344744);
  });
});
