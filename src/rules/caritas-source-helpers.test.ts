import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import printed from "../testing/fixtures/caritas-care-policies-2026.json";

const root = fileURLToPath(new URL("../../", import.meta.url));
function run(code: string): unknown {
  return JSON.parse(
    execFileSync(process.execPath, ["--input-type=module", "-e", code], {
      cwd: root,
      encoding: "utf8",
    }),
  );
}
const imports = [
  'import { caritasAnnualPaymentPolicy, caritasAvrText2026 } from "./scripts/caritas-annual-source.mjs";',
  'import { caritasOvertimePolicy, caritasTimePremiumPolicy } from "./scripts/caritas-time-premium-source.mjs";',
].join("\n");

describe("original Caritas source functions against independent preserved policy data", () => {
  it("reproduces the three 2026 source-bound policies exactly", () => {
    const result = run(
      imports +
        "\nconsole.log(JSON.stringify({" +
        'caritasAnnualPaymentPolicy: caritasAnnualPaymentPolicy("2026-02-01","2026-12-31",false),' +
        'caritasOvertimePolicy: caritasOvertimePolicy("2026-02-01","2026-12-31",caritasAvrText2026),' +
        'caritasTimePremiumPolicy: caritasTimePremiumPolicy("2026-02-01","2026-12-31")' +
        "}));",
    );
    expect(result).toEqual(printed.rules);
  });
  it("rejects all three unverified 2027 extensions", () => {
    const result = run(
      imports +
        "\nconst cases=[" +
        '()=>caritasAnnualPaymentPolicy("2027-01-01","2027-12-31",false),' +
        '()=>caritasOvertimePolicy("2027-01-01","2027-12-31",caritasAvrText2026),' +
        '()=>caritasTimePremiumPolicy("2027-01-01","2027-12-31")' +
        "];console.log(JSON.stringify(cases.map(fn=>{try{fn();return false;}catch{return true;}})));",
    );
    expect(result).toEqual([true, true, true]);
  });
});
