import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Sources: ARK.DD AVR.DD 01.01.2026, Anlage 2; ARK.DD RS 11.07.2025, p. 9.
const stages = ["entry", "base", "exp1", "exp2", "exp3"] as const;
type Stage = (typeof stages)[number];
type Row = {
  group: string;
  cents: Record<Stage, number | null>;
  months: Record<Stage, number | null>;
};

function sourceRows(file: string): Row[] {
  const lines = readFileSync(new URL(`../../docs/${file}`, import.meta.url), "utf8")
    .trim()
    .split(/\r?\n/u);
  expect(lines.shift()).toBe(
    "group,entry_cents,entry_months,base_cents,base_months,exp1_cents,exp1_months,exp2_cents,exp2_months,exp3_cents",
  );
  return lines.map((line) => {
    const fields = line.split(",");
    expect(fields).toHaveLength(10);
    const [group, entry, entryMonths, base, baseMonths, exp1, exp1Months, exp2, exp2Months, exp3] =
      fields;
    const cents = { entry, base, exp1, exp2, exp3 };
    const months = {
      entry: entryMonths,
      base: baseMonths,
      exp1: exp1Months,
      exp2: exp2Months,
      exp3: "",
    };
    const parse = (value: string) => (value === "" ? null : Number(value));
    return {
      group,
      cents: Object.fromEntries(
        stages.map((stage) => [stage, parse(cents[stage])]),
      ) as Row["cents"],
      months: Object.fromEntries(
        stages.map((stage) => [stage, parse(months[stage])]),
      ) as Row["months"],
    };
  });
}

describe("AVR.DD source table capture, not an activated tariff", () => {
  const oldRows = sourceRows("avrdd-anlage2-2025-03.csv");
  const newRows = sourceRows("avrdd-anlage2-2026-09.csv");

  it.each([[oldRows], [newRows]])("preserves every EG's exact stage shape", (rows) => {
    expect(rows.map((row) => row.group)).toEqual(
      Array.from({ length: 13 }, (_, index) => `eg${index + 1}`),
    );
    expect(rows.map((row) => stages.filter((stage) => row.cents[stage] !== null).length)).toEqual([
      2, 2, 3, 3, 4, 4, 5, 5, 5, 5, 5, 5, 5,
    ]);
    for (const row of rows) {
      for (const stage of stages) {
        const cents = row.cents[stage];
        const months = row.months[stage];
        if (cents === null) expect(months).toBeNull();
        else {
          expect(Number.isSafeInteger(cents) && cents > 0).toBe(true);
          if (stage === stages.filter((item) => row.cents[item] !== null).at(-1))
            expect(months).toBeNull();
          else expect(Number.isSafeInteger(months) && (months ?? 0) > 0).toBe(true);
        }
      }
    }
  });

  it("checks the official 3% September transition except the separately set EG 1", () => {
    expect(newRows[0].cents).toMatchObject({ base: 250_119, exp1: 257_749 });
    for (let index = 1; index < 13; index++) {
      for (const stage of stages) {
        const old = oldRows[index].cents[stage];
        const current = newRows[index].cents[stage];
        expect(current).toBe(old === null ? null : Math.round(old * 1.03));
        expect(newRows[index].months[stage]).toBe(oldRows[index].months[stage]);
      }
    }
    expect(newRows[6].cents).toMatchObject({ entry: 387_415, base: 405_951, exp3: 454_576 });
  });
});
