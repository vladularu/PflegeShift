import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";

type DrkRow = readonly [string, number | null, number, number, number, number, number];

interface DrkSourceTables {
  readonly kind: string;
  readonly agreementId: string;
  readonly annexId: string;
  readonly source: {
    readonly url: string;
    readonly sha256: string;
    readonly pdfPages: readonly number[];
  };
  readonly columns: readonly string[];
  readonly tables: readonly {
    readonly validFrom: string;
    readonly validTo: string | null;
    readonly pdfPage: number;
    readonly rows: readonly DrkRow[];
  }[];
}

const source = JSON.parse(
  readFileSync(join(process.cwd(), "rules/sources/drk-rtv-anlage-a2-p-tables.json"), "utf8"),
) as DrkSourceTables;

// Digests were calculated independently from the published PDF pages 44–45.
const OFFICIAL_TABLE_DIGESTS = [
  "6243b684c42372084a7529f5cf3424aba3a27b16c52302ffe486ace0027403f7",
  "47c459fe3165303037caaa05e8540262f8d72a3bd4844c9e3bf5de37154f791a",
  "1bfa7e0da6872d4ddb32e1b3f39a586898b5e91cc591d506b5788b107e563063",
] as const;

function tableDigest(rows: readonly DrkRow[]): string {
  const canonical = rows
    .map(
      ([groupId, ...cells]) =>
        `${groupId}:${cells.map((value) => (value === null ? "_" : String(value))).join(",")}`,
    )
    .join("\n");
  return createHash("sha256").update(`${canonical}\n`, "utf8").digest("hex");
}

describe("DRK-RTV Anlage A2 P source tables", () => {
  it("keeps published identity and non-activatable source-only status", () => {
    expect(source.kind).toBe("SOURCE_TABLE_ONLY");
    expect(source.agreementId).toBe("drk-rtv");
    expect(source.annexId).toBe("anlage-a2");
    expect(source.source.url).toBe(
      "https://btg.drk.de/fileadmin/user_upload/Bundestarifgemeinschaft/05_grundlagen_news/DRK-RTV_idF_52.AETV_14.AETV-TVUE_durchgeschriebene_Fassung.pdf",
    );
    expect(source.source.sha256).toBe(
      "97c25f8030b40897c10d828a92382655847212d5f924ce0132073034a13b19d8",
    );
    expect(source.source.pdfPages).toEqual([44, 45]);
    expect(source.columns).toEqual(["groupId", "s1", "s2", "s3", "s4", "s5", "s6"]);
  });

  it("covers all three published periods without gaps and only valid P stages", () => {
    expect(source.tables).toHaveLength(3);
    expect(source.tables.map(({ validFrom, validTo }) => [validFrom, validTo])).toEqual([
      ["2024-06-01", "2025-08-31"],
      ["2025-09-01", "2026-09-30"],
      ["2026-10-01", null],
    ]);
    for (let index = 0; index < source.tables.length - 1; index++)
      expect(
        Temporal.PlainDate.from(source.tables[index].validTo!).add({ days: 1 }).toString(),
      ).toBe(source.tables[index + 1].validFrom);

    const expectedGroups = Array.from({ length: 12 }, (_, index) => `p${16 - index}`);
    for (const [tableIndex, table] of source.tables.entries()) {
      expect(source.source.pdfPages).toContain(table.pdfPage);
      expect(table.rows.map(([groupId]) => groupId)).toEqual(expectedGroups);
      expect(new Set(table.rows.map(([groupId]) => groupId)).size).toBe(12);
      expect(
        table.rows.reduce((total, row) => total + row.slice(1).filter(Number.isInteger).length, 0),
      ).toBe(62);
      for (const [groupId, ...cells] of table.rows) {
        expect(cells).toHaveLength(6);
        expect(cells[0] === null).toBe(Number(groupId.slice(1)) >= 7);
        for (const amount of cells) {
          if (amount !== null) expect(Number.isSafeInteger(amount) && amount > 0).toBe(true);
        }
      }
      expect(tableDigest(table.rows)).toBe(OFFICIAL_TABLE_DIGESTS[tableIndex]);
    }
  });

  it("preserves P5/P6 reference amounts across the October 2026 boundary", () => {
    const amount = (index: number, groupId: string, step: number) =>
      source.tables[index].rows.find(([group]) => group === groupId)?.[step];
    expect(amount(0, "p6", 1)).toBe(281253);
    expect(amount(1, "p6", 1)).toBe(294207);
    expect(amount(2, "p6", 1)).toBe(302445);
    expect(amount(0, "p5", 6)).toBe(342614);
    expect(amount(1, "p5", 6)).toBe(353614);
    expect(amount(2, "p5", 6)).toBe(363515);
    for (let index = 0; index < source.tables.length; index++)
      expect(amount(index, "p7", 1)).toBeNull();
  });
});
