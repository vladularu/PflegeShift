import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const groups = [
  "P4",
  "P6",
  "P7",
  "P8",
  "P9",
  "P10",
  "P11",
  "P12",
  "P13",
  "P14",
  "P15",
  "P16",
] as const;
const stepColumns = [
  "step_1_cents",
  "step_2_cents",
  "step_3_cents",
  "step_4_cents",
  "step_5_cents",
  "step_6_cents",
] as const;

type SourceRow = {
  readonly date: string;
  readonly table: string | null;
  readonly group: string;
  readonly steps: readonly (number | null)[];
};

function readSource(name: string, withTable: boolean): SourceRow[] {
  const lines = readFileSync(new URL("../../docs/" + name, import.meta.url), "utf8")
    .trim()
    .split(/\r?\n/u);
  const header = lines.shift()?.split(",");
  if (!header) throw new Error("Empty source CSV " + name);
  expect(header).toEqual(["valid_from", ...(withTable ? ["table"] : []), "group", ...stepColumns]);
  return lines.map((line) => {
    const columns = line.split(",");
    expect(columns).toHaveLength(header?.length);
    return {
      date: columns[0],
      table: withTable ? columns[1] : null,
      group: columns[withTable ? 2 : 1],
      steps: columns.slice(withTable ? 3 : 2).map((value) => (value === "" ? null : Number(value))),
    };
  });
}

function expectSourceTable(rows: readonly SourceRow[], date: string, table: string | null): void {
  expect(rows).toHaveLength(groups.length);
  expect(rows.map((row) => row.group)).toEqual(groups);
  let valueCount = 0;
  for (const row of rows) {
    expect(row.date).toBe(date);
    expect(row.table).toBe(table);
    expect(row.steps).toHaveLength(6);
    expect(row.steps[0] === null).toBe(row.group !== "P4" && row.group !== "P6");
    for (const value of row.steps) {
      if (value === null) continue;
      expect(Number.isSafeInteger(value) && value > 0).toBe(true);
      valueCount++;
    }
  }
  expect(valueCount).toBe(62);
}

function group(rows: readonly SourceRow[], name: string): SourceRow {
  const row = rows.find((item) => item.group === name);
  if (!row) throw new Error("Missing source group " + name);
  return row;
}

describe("Caritas P-table source transcriptions remain DRAFT", () => {
  it("keeps both West dates, all 62 values each, and the printed 2.8 percent transition", () => {
    const rows = readSource("caritas-p-mittelwerte-2025-2026.csv", false);
    const previous = rows.filter((row) => row.date === "2025-07-01");
    const next = rows.filter((row) => row.date === "2026-02-01");
    expect(rows).toHaveLength(24);
    expectSourceTable(previous, "2025-07-01", null);
    expectSourceTable(next, "2026-02-01", null);
    expect(group(previous, "P6").steps).toEqual([293044, 310059, 327186, 363614, 372900, 390410]);
    expect(group(next, "P6").steps).toEqual([301249, 318741, 336347, 373795, 383341, 401341]);
    for (let rowIndex = 0; rowIndex < previous.length; rowIndex++) {
      for (let stepIndex = 0; stepIndex < 6; stepIndex++) {
        const oldValue = previous[rowIndex].steps[stepIndex];
        const newValue = next[rowIndex].steps[stepIndex];
        expect(newValue).toBe(
          oldValue === null ? null : Math.floor((oldValue * 1028 + 500) / 1000),
        );
      }
    }
  });

  it("keeps RK Ost 2025 common and Anlage 32 Tarifgebiet Ost separate", () => {
    const rows = readSource("caritas-p-ost-2025.csv", true);
    const common = rows.filter((row) => row.table === "COMMON");
    const special = rows.filter((row) => row.table === "ANLAGE_32_TARIF_OST");
    expect(rows).toHaveLength(24);
    expectSourceTable(common, "2025-01-01", "COMMON");
    expectSourceTable(special, "2025-01-01", "ANLAGE_32_TARIF_OST");
    expect(group(common, "P6").steps).toEqual([289095, 306535, 324091, 361429, 370948, 388515]);
    expect(group(special, "P6").steps).toEqual([287685, 305040, 322510, 359666, 369138, 386620]);
    expect(group(common, "P4").steps[0]).toBe(281992);
    expect(group(special, "P4").steps[0]).toBe(280616);
  });

  it("keeps one RK Ost 2026 table for both Anlagen and Tarifgebiete", () => {
    const rows = readSource("caritas-p-ost-2026.csv", false);
    expectSourceTable(rows, "2026-01-01", null);
    expect(group(rows, "P6").steps).toEqual([300370, 317810, 335366, 372704, 382223, 400170]);
    expect(group(rows, "P4").steps[0]).toBe(293267);
  });
});
