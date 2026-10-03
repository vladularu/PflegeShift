import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "./contracts.generated";
import { RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS } from "./rule-catalog-engine-support";
import { resolveTariffSelection } from "./tariff-selection";
import { validateRulePackage } from "./validation";

// Independently transcribed cents from the four TdL Anlage-C tables, in ascending group order.
// Blank step 1 in KR7–17 is NOT shifted into an invented step 1.
const expectedTables = {
  "2025-11":
    "5 275229 300514 307823 319719 328642 349608\n6 286358 304853 322692 360614 370280 388124\n7 337561 356895 386641 401510 416829\n8 356895 373257 394235 411179 434676\n9 386055 404933 417515 441427 451495\n10 404933 417515 452753 469743 480440\n11 427962 441300 474652 496800 506866\n12 450990 465087 500322 521969 532035\n13 474023 488873 525996 552801 559723\n14 485537 500765 538835 590555 599993\n15 497052 512656 551668 598357 616189\n16 507499 524549 579609 643787 672098\n17 519014 536441 592443 651590 688294",
  "2026-04":
    "5 285229 310514 317823 329719 338642 359608\n6 296358 314853 332692 370711 380648 398991\n7 347561 366895 397467 412752 428500\n8 366895 383708 405274 422692 446847\n9 396865 416271 429205 453787 464137\n10 416271 429205 465430 482896 493892\n11 439945 453656 487942 510710 521058\n12 463618 478109 514331 536584 546932\n13 487296 502561 540724 568279 575395\n14 499132 514786 553922 607091 616793\n15 510969 527010 567115 615111 633442\n16 521709 539236 595838 661813 690917\n17 533546 551461 609031 669835 707566",
  "2027-03":
    "5 290934 316724 324179 336313 345415 366800\n6 302285 321150 339346 378125 388261 406971\n7 354512 374233 405416 421007 437070\n8 374233 391382 413379 431146 455784\n9 404802 424596 437789 462863 473420\n10 424596 437789 474739 492554 503770\n11 448744 462729 497701 520924 531479\n12 472890 487671 524618 547316 557871\n13 497042 512612 551538 579645 586903\n14 509115 525082 565000 619233 629129\n15 521188 537550 578457 627413 646111\n16 532143 550021 607755 675049 704735\n17 544217 562490 621212 683232 721717",
  "2028-01":
    "5 293843 319891 327421 339676 348869 370468\n6 305308 324362 342739 381906 392144 411041\n7 358057 377975 409470 425217 441441\n8 377975 395296 417513 435457 460342\n9 408850 428842 442167 467492 478154\n10 428842 442167 479486 497480 508808\n11 453231 467356 502678 526133 536794\n12 477619 492548 529864 552789 563450\n13 502012 517738 557053 585441 592772\n14 514206 530333 570650 625425 635420\n15 526400 542926 584242 633687 652572\n16 537464 555521 613833 681799 711782\n17 549659 568115 627424 690064 728934",
};

function candidate(version = "2026-04"): RuleTariffPackage {
  return JSON.parse(
    readFileSync(
      new URL(`../../rules/packages/reviewed/tvl-kr-tdl/${version}.json`, import.meta.url),
      "utf8",
    ),
  ) as RuleTariffPackage;
}
function expectIssue(pkg: RuleTariffPackage, code: string) {
  const result = validateRulePackage(pkg);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.issues.map((issue) => issue.code)).toContain(code);
}

describe("TV-L/KR contract and official tables", () => {
  it.each(Object.entries(expectedTables))(
    "%s has all 67 exact source cells and valid steps",
    (version, rows) => {
      const pkg = candidate(version);
      expect(validateRulePackage(pkg)).toEqual({ ok: true, value: pkg });
      const entries = pkg.rules.payTables[0]!.entries;
      expect(entries).toHaveLength(67);
      for (const row of rows.split("\n")) {
        const [group, ...cents] = row.split(" ").map(Number);
        const actual = entries
          .filter((entry) => entry.groupId === `kr${group}`)
          .sort((a, b) => Number(a.stepId) - Number(b.stepId));
        expect(actual.map((entry) => entry.monthlyCents)).toEqual(cents);
        expect(actual.map((entry) => entry.stepId)).toEqual(
          group! <= 6 ? ["1", "2", "3", "4", "5", "6"] : ["2", "3", "4", "5", "6"],
        );
      }
      const selection = resolveTariffSelection(pkg, "SECTION_43", "WEST_38_5");
      expect(selection?.familyId).toBe("tvl-kr");
    },
  );
  it("does not activate unfinished TV-L remotely or forge review metadata", () => {
    expect([...RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS]).not.toContain(12);
    for (const version of Object.keys(expectedTables)) {
      const pkg = candidate(version);
      expect(pkg.status).toBe("DRAFT");
      expect(pkg.review).toEqual({
        status: "DRAFT",
        reviewedBy: null,
        reviewedAt: null,
        gitCommit: null,
      });
      expect(pkg.rules.selection?.capabilities).toEqual({
        basePay: "SUPPORTED",
        timePremiums: "SUPPORTED",
        allowances: "UNSUPPORTED",
        overtime: "SUPPORTED",
        annualPayment: "SUPPORTED",
      });
      expect(pkg.rules.weeklyWorkingTimeRules).toBeUndefined();
      const table = pkg.rules.payTables[0]!;
      const source = pkg.sources.find((item) => item.id === table.sourceIds[0])!;
      expect(source.url).toContain("https://www.tdl-online.de/");
      expect(source.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(pkg.sources.find((item) => item.id === "tdl-tv-l-2026")?.sha256).toBe(
        "05de64ee356df189690875a491e5d52d8ac8171328b43f7fd401d8b0c04f94f9",
      );
    }
  });
  it("keeps table periods contiguous without inventing pre-November-2025 coverage", () => {
    expect(
      Object.keys(expectedTables).map((version) => {
        const pkg = candidate(version);
        return [pkg.validFrom, pkg.validTo];
      }),
    ).toEqual([
      ["2025-11-01", "2026-03-31"],
      ["2026-04-01", "2027-02-28"],
      ["2027-03-01", "2027-12-31"],
      ["2028-01-01", null],
    ]);
  });
  it.each([
    ["2026-04", "2026-12-31", 2400],
    ["2026-04", "2027-01-01", 2370],
    ["2027-03", "2027-12-31", 2370],
    ["2028-01", "2028-01-01", 2340],
    ["2028-01", "2028-12-31", 2340],
    ["2028-01", "2029-01-01", 2310],
  ])("separates East university hours in %s on %s", (version, date, minutes) => {
    const pkg = candidate(String(version));
    const matches = pkg.rules.employmentWorkingTimeRules!.filter(
      (rule) =>
        rule.regionId === "EAST_UNIVERSITY_HOSPITAL" &&
        rule.validFrom <= String(date) &&
        (rule.validTo === null || rule.validTo >= String(date)),
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.fullTimeWeeklyMinutes).toBe(minutes);
    expect(
      pkg.rules.employmentWorkingTimeRules!.find((rule) => rule.regionId === "EAST")!
        .fullTimeWeeklyMinutes,
    ).toBe(2400);
    expect(
      pkg.rules.employmentWorkingTimeRules!.find((rule) => rule.regionId === "WEST_38_5")!
        .fullTimeWeeklyMinutes,
    ).toBe(2310);
  });
  it.each([
    [
      "foreign family",
      (p: RuleTariffPackage) => {
        p.rules.selection!.familyId = "tvoed-p";
      },
      "TVL_KR_IDENTITY",
    ],
    [
      "foreign agreement",
      (p: RuleTariffPackage) => {
        p.rules.selector.agreementId = "tvoed-vka";
      },
      "TVL_KR_IDENTITY",
    ],
    [
      "training",
      (p: RuleTariffPackage) => {
        p.rules.selection!.employmentKind = "APPRENTICE";
      },
      "TVL_KR_IDENTITY",
    ],
    [
      "TVöD variant",
      (p: RuleTariffPackage) => {
        p.rules.selection!.variants[0]!.id = "BT_K";
      },
      "TVL_KR_VARIANT",
    ],
    [
      "unproven premiums",
      (p: RuleTariffPackage) => {
        delete p.rules.tvlTimePremiumPolicy;
      },
      "TVL_KR_COMPONENT_COVERAGE",
    ],
    [
      "missing cell",
      (p: RuleTariffPackage) => {
        p.rules.payTables[0]!.entries.pop();
      },
      "TVL_KR_TABLE_INCOMPLETE",
    ],
    [
      "duplicate cell",
      (p: RuleTariffPackage) => {
        p.rules.payTables[0]!.entries.push(p.rules.payTables[0]!.entries[0]!);
      },
      "TVL_KR_TABLE_CELL",
    ],
    [
      "invented step",
      (p: RuleTariffPackage) => {
        p.rules.payTables[0]!.entries[0]!.stepId = "1";
      },
      "TVL_KR_TABLE_CELL",
    ],
    [
      "P group",
      (p: RuleTariffPackage) => {
        p.rules.payTables[0]!.entries[0]!.groupId = "p17";
      },
      "TVL_KR_TABLE_CELL",
    ],
    [
      "zero salary",
      (p: RuleTariffPackage) => {
        p.rules.payTables[0]!.entries[0]!.monthlyCents = 0;
      },
      "TVL_KR_TABLE_CELL",
    ],
    [
      "extra table",
      (p: RuleTariffPackage) => {
        p.rules.payTables.push(structuredClone(p.rules.payTables[0]!));
      },
      "TVL_KR_TABLE_COUNT",
    ],
    [
      "missing times",
      (p: RuleTariffPackage) => {
        delete p.rules.employmentWorkingTimeRules;
      },
      "TVL_KR_WORKING_TIME_MISSING",
    ],
    [
      "undeclared region",
      (p: RuleTariffPackage) => {
        p.rules.employmentWorkingTimeRules![0]!.regionId = "OTHER";
      },
      "UNKNOWN_WORKING_TIME_SELECTION",
    ],
    [
      "missing region",
      (p: RuleTariffPackage) => {
        p.rules.selection!.variants[0]!.regions.pop();
      },
      "TVL_KR_REGIONS",
    ],
    [
      "unknown source",
      (p: RuleTariffPackage) => {
        p.rules.employmentWorkingTimeRules![0]!.sourceIds = ["missing"];
      },
      "UNKNOWN_SOURCE_ID",
    ],
    [
      "impossible date",
      (p: RuleTariffPackage) => {
        p.rules.employmentWorkingTimeRules![0]!.validFrom = "2026-02-30";
      },
      "TVL_KR_WORKING_TIME_RANGE",
    ],
    [
      "outside package",
      (p: RuleTariffPackage) => {
        p.rules.employmentWorkingTimeRules![0]!.validTo = null;
      },
      "TVL_KR_WORKING_TIME_RANGE",
    ],
    [
      "gap",
      (p: RuleTariffPackage) => {
        p.rules.employmentWorkingTimeRules![0]!.validFrom = "2026-04-02";
      },
      "TVL_KR_WORKING_TIME_COVERAGE",
    ],
    [
      "overlap",
      (p: RuleTariffPackage) => {
        p.rules.employmentWorkingTimeRules!.push(
          structuredClone(p.rules.employmentWorkingTimeRules![0]!),
        );
      },
      "TVL_KR_WORKING_TIME_COVERAGE",
    ],
    [
      "downgrade",
      (p: RuleTariffPackage) => {
        p.engineContractVersion = 11;
      },
      "UNSUPPORTED_EMPLOYMENT_WORKING_TIME",
    ],
  ] as const)("rejects %s", (_label, mutate, code) => {
    const pkg = candidate();
    mutate(pkg);
    expectIssue(pkg, code);
  });
  it("rejects a gap after an open-ended regional rule", () => {
    const pkg = candidate("2028-01");
    const rule = structuredClone(pkg.rules.employmentWorkingTimeRules![0]!);
    rule.id = "extra-west";
    rule.validFrom = "2030-01-01";
    pkg.rules.employmentWorkingTimeRules!.push(rule);
    expectIssue(pkg, "TVL_KR_WORKING_TIME_COVERAGE");
  });
});
