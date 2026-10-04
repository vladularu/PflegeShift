import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const SUE_GROUPS = Object.freeze([
  "s18",
  "s17",
  "s16",
  "s15",
  "s14",
  "s13",
  "s12",
  "s11b",
  "s11a",
  "s9",
  "s8b",
  "s8a",
  "s7",
  "s4",
  "s3",
  "s2",
]);
const HEADER = "group;stufe1;stufe2;stufe3;stufe4;stufe5;stufe6";
const PERIODS = new Set(["2025-04", "2026-05"]);

/** Literal transcription of BT-B Anlage C; no rounding or inferred vacant groups. */
export function readTvoedSueBtBSource(period, root = process.cwd()) {
  if (!PERIODS.has(period)) throw new Error("Unknown TVöD-SuE table period.");
  const lines = readFileSync(resolve(root, `docs/tvoed-vka-sue-bt-b-${period}.csv`), "utf8")
    .trim()
    .split(/\r?\n/u);
  if (lines.shift() !== HEADER || lines.length !== SUE_GROUPS.length)
    throw new Error(`Invalid TVöD-SuE table shape for ${period}.`);
  return lines.flatMap((line, index) => {
    const [groupId, ...amounts] = line.split(";");
    if (groupId !== SUE_GROUPS[index] || amounts.length !== 6)
      throw new Error(`Invalid TVöD-SuE group ${index + 1} for ${period}.`);
    return amounts.map((amount, stepIndex) => {
      if (!/^[1-9]\.\d{3},\d{2}$/u.test(amount))
        throw new Error(`Invalid TVöD-SuE amount ${groupId}/s${stepIndex + 1}.`);
      const monthlyCents = Number(amount.replace(".", "").replace(",", ""));
      return { groupId, stepId: `s${stepIndex + 1}`, monthlyCents };
    });
  });
}
