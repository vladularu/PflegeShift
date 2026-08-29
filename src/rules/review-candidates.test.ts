import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import legalCandidate from "../../rules/packages/reviewed/de-arbzg-care/2026-01.json";
import holidayCandidate from "../../rules/packages/reviewed/de-holidays/2026.json";
import tariffCandidate from "../../rules/packages/reviewed/tvoed-vka-bt-k/2026-05.json";
import { validateRulePackage } from "./validation";

const candidates = [tariffCandidate, legalCandidate, holidayCandidate];
const holidaySourceSnapshots = {
  "de-hb-feiertg-2-2026": {
    relativePath: "../../rules/sources/de-hb-feiertg-2-2026.txt",
    url: "https://www.transparenz.bremen.de/metainformationen/gesetz-ueber-die-sonn-gedenk-und-feiertage-vom-12-november-1954-296390?template=20_gp_ifg_meta_detail_d",
    documentDate: "2025-09-02",
  },
  "de-he-holidays-2026": {
    relativePath: "../../rules/sources/de-he-holidays-2026.txt",
    url: "https://innen.hessen.de/Buerger-Staat/Feiertage",
    documentDate: "2026-08-29",
  },
  "de-hh-feiertg-1-2026": {
    relativePath: "../../rules/sources/de-hh-feiertg-1-2026.txt",
    url: "https://www.landesrecht-hamburg.de/bsha/document/jlr-FeiertGHArahmen",
    documentDate: "2021-02-17",
  },
  "de-by-holidays-2026": {
    relativePath: "../../rules/sources/de-by-ftg-art-1-2026.txt",
    url: "https://www.gesetze-bayern.de/Content/Document/BayFTG-1",
    documentDate: "2013-08-01",
  },
  "de-mv-ftg-2-2026": {
    relativePath: "../../rules/sources/de-mv-ftg-2-2026.txt",
    url: "https://www.landesrecht-mv.de/bsmv/document/jlr-FTGMVrahmen",
    documentDate: "2022-07-07",
  },
  "de-ni-nfeiertagsg-2-2026": {
    relativePath: "../../rules/sources/de-ni-nfeiertagsg-2-2026.txt",
    url: "https://voris.wolterskluwer-online.de/browse/document/b724111b-6c20-3862-b111-589842acacba",
    documentDate: "2018-06-22",
  },
  "de-nw-feiertg-2-2026": {
    relativePath: "../../rules/sources/de-nw-feiertg-2-2026.txt",
    url: "https://recht.nrw.de/lrgv/gesetz/01012000-bekanntmachung-der-neufassung-des-gesetzes-ueber-die-sonn-und-feiertage/",
    documentDate: "1994-12-20",
  },
  "de-rp-holidays-2026": {
    relativePath: "../../rules/sources/de-rp-holidays-2026.txt",
    url: "https://mdi.rlp.de/themen/buerger-und-staat/verfassung-und-verwaltung/sonn-und-feiertagsrecht",
    documentDate: "2026-08-29",
  },
  "de-sh-sftg-2-2018": {
    relativePath: "../../rules/sources/de-sh-sftg-2-2018.txt",
    url: "https://www.schleswig-holstein.de/DE/landesregierung/ministerien-behoerden/IV/Service/GVOBl/GVOBl/2018/gvobl_6_2018.pdf",
    documentDate: "2018-03-21",
  },
  "de-sl-sfg-2-2026": {
    relativePath: "../../rules/sources/de-sl-sfg-2-2026.txt",
    url: "https://recht.saarland.de/bssl/document/jlr-NNLSL0000A2D6NN00000000007",
    documentDate: "2010-11-18",
  },
  "de-sn-holidays-2026": {
    relativePath: "../../rules/sources/de-sn-saechssfg-1-2026.txt",
    url: "https://www.revosax.sachsen.de/vorschrift/3997-SaechsSFG",
    documentDate: "2025-04-23",
  },
  "de-th-holidays-2026": {
    relativePath: "../../rules/sources/de-th-thuerfgtg-2-2026.txt",
    url: "https://landesrecht.thueringen.de/perma?d=jlr-NNLTH00003E03NN00000000006",
    documentDate: "2019-03-26",
  },
} as const;

function snapshotSha256(relativePath: string): string {
  return createHash("sha256")
    .update(readFileSync(new URL(relativePath, import.meta.url)))
    .digest("hex");
}

function byId<T extends { id: string }>(entries: T[], id: string): T {
  const entry = entries.find((candidate) => candidate.id === id);
  expect(entry, `missing rule ${id}`).toBeDefined();
  return entry as T;
}

describe("generation 1 rule review candidates", () => {
  it("keeps every candidate schema-valid and review-consistent", () => {
    for (const candidate of candidates) {
      expect(validateRulePackage(candidate).ok).toBe(true);
      expect(["DRAFT", "REVIEWED"]).toContain(candidate.status);
      if (candidate.status === "DRAFT") {
        expect(candidate.review).toEqual({
          status: "DRAFT",
          reviewedBy: null,
          reviewedAt: null,
          gitCommit: null,
        });
      } else {
        expect(candidate.review).toEqual({
          status: "REVIEWED",
          reviewedBy: "project-owner",
          reviewedAt: "2026-08-29T00:58:25Z",
          gitCommit: "8aa225f44eca461b1d10231850ae5f620c60a8cd",
        });
      }

      for (const source of candidate.sources) {
        expect(source.url).toMatch(/^https:\/\//);
        expect(source.sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(source.sha256).not.toMatch(/^([a-f0-9])\1{63}$/);
      }
    }
  });

  it("locks the TVoeD-VKA table, premium and allowance boundaries", () => {
    expect(tariffCandidate.packageId).toBe("tvoed-vka-bt-k");
    expect(tariffCandidate.versionId).toBe("2026-05");
    expect(tariffCandidate.engineContractVersion).toBe(3);
    expect(tariffCandidate.validFrom).toBe("2026-05-01");
    expect(tariffCandidate.validTo).toBe("2027-03-31");
    expect(tariffCandidate.rules.selector).toEqual({
      agreementId: "tvoed-vka",
      specialPartIds: ["bt-k", "bt-b"],
      payTableId: "p-2026-05",
    });

    const entries = tariffCandidate.rules.payTables.flatMap((table) => table.entries);
    expect(entries).toHaveLength(50);
    expect(entries.every((entry) => !("hourlyCents" in entry))).toBe(true);
    expect(tariffCandidate.rules.hourlyCalculation).toEqual({
      monthlyFactorThousandths: 4348,
      rounding: "HALF_UP",
      sourceIds: ["vka-tvoed-hospitals-2026", "vka-tvoed-care-2026"],
    });
    expect(tariffCandidate.rules.weeklyWorkingTimeRules).toEqual([
      expect.objectContaining({
        sectors: ["BT_K"],
        tariffRegions: ["KAV_BW"],
        fullTimeWeeklyMinutes: 2340,
      }),
      expect.objectContaining({
        sectors: ["BT_K"],
        tariffRegions: ["OTHER"],
        fullTimeWeeklyMinutes: 2310,
      }),
      expect.objectContaining({
        sectors: ["BT_B"],
        tariffRegions: ["KAV_BW", "OTHER"],
        fullTimeWeeklyMinutes: 2340,
      }),
    ]);
    expect(
      byId(
        entries.map((entry) => ({ ...entry, id: `${entry.groupId}-${entry.stepId}` })),
        "p7-s2",
      ),
    ).toMatchObject({
      monthlyCents: 351030,
    });
    expect(
      byId(
        entries.map((entry) => ({ ...entry, id: `${entry.groupId}-${entry.stepId}` })),
        "p16-s6",
      ),
    ).toMatchObject({
      monthlyCents: 693770,
    });

    expect(tariffCandidate.rules.premiumRules).toHaveLength(8);
    expect(tariffCandidate.rules.overtimeBaseRule).toEqual({
      maximumStepId: "s4",
      sourceIds: ["vka-tvoed-hospitals-2026", "vka-tvoed-care-2026"],
    });
    expect(byId(tariffCandidate.rules.premiumRules, "night")).toMatchObject({
      percentageBasisPoints: 2000,
      referenceStepId: "s3",
      timeWindow: { startMinute: 1260, endMinute: 360 },
    });
    expect(byId(tariffCandidate.rules.premiumRules, "sunday").percentageBasisPoints).toBe(2500);
    expect(
      byId(tariffCandidate.rules.premiumRules, "holiday-with-time-off").percentageBasisPoints,
    ).toBe(3500);
    expect(
      byId(tariffCandidate.rules.premiumRules, "holiday-without-time-off").percentageBasisPoints,
    ).toBe(13500);
    expect(byId(tariffCandidate.rules.premiumRules, "saturday")).toMatchObject({
      percentageBasisPoints: 2000,
      timeWindow: { startMinute: 780, endMinute: 1260 },
    });
    expect(byId(tariffCandidate.rules.premiumRules, "pre-holiday")).toMatchObject({
      percentageBasisPoints: 3500,
      timeWindow: { startMinute: 360, endMinute: 0 },
      conditions: { monthDays: ["12-24", "12-31"] },
    });
    expect(byId(tariffCandidate.rules.premiumRules, "overtime-p7-p11")).toMatchObject({
      percentageBasisPoints: 3000,
      conditions: { payGroups: ["p7", "p8", "p9", "p10", "p11"] },
    });
    expect(byId(tariffCandidate.rules.premiumRules, "overtime-p12-p16")).toMatchObject({
      percentageBasisPoints: 1500,
      conditions: { payGroups: ["p12", "p13", "p14", "p15", "p16"] },
    });

    expect(tariffCandidate.rules.allowanceRules).toHaveLength(11);
    expect(byId(tariffCandidate.rules.allowanceRules, "shift-monthly-current").amountCents).toBe(
      10000,
    );
    expect(
      byId(tariffCandidate.rules.allowanceRules, "alternating-monthly-current").amountCents,
    ).toBe(25000);
    expect(byId(tariffCandidate.rules.allowanceRules, "care-monthly").amountCents).toBe(14182);
    expect(byId(tariffCandidate.rules.allowanceRules, "tvoed-monthly-bw").amountCents).toBe(3500);
    expect(byId(tariffCandidate.rules.allowanceRules, "tvoed-monthly-other").amountCents).toBe(
      2500,
    );
  });

  it("locks statutory ArbZG boundaries apart from labelled product heuristics", () => {
    expect(legalCandidate.packageId).toBe("de-arbzg-care");
    expect(legalCandidate.versionId).toBe("2026-01");
    expect(legalCandidate.engineContractVersion).toBe(6);
    expect(legalCandidate.rules.workingTime).toMatchObject({
      standardDailyMinutes: 480,
      maxDailyMinutes: 600,
      nightAverageMinutes: 480,
      standardAverage: {
        calendarMonths: 6,
        weeks: 24,
        assessmentMode: "FORWARD_FROM_EXTENDED_WORKDAY",
        neutralAbsenceTypes: ["VACATION", "SICK"],
      },
      sourceIds: ["arbzg-2024", "eu-2003-88", "pflegeshift-planning-policy-v1"],
    });
    expect(byId(legalCandidate.sources, "eu-2003-88")).toMatchObject({
      url: "https://eur-lex.europa.eu/legal-content/DE/TXT/PDF/?uri=CELEX:32003L0088",
      documentDate: "2003-11-04",
      section: "Art. 6 und 16; ABl. L 299 vom 18.11.2003, S. 9–19",
      sha256: "13ff399696ddd77d9e3e430026056041c1bf29a77b112fcbf3bb359edd67f1f7",
    });
    expect(legalCandidate.rules.breaks).toMatchObject({
      minimumSegmentMinutes: 15,
      tiers: [
        { overMinutes: 360, requiredMinutes: 30 },
        { overMinutes: 540, requiredMinutes: 45 },
      ],
    });
    expect(legalCandidate.rules.nightWork).toMatchObject({
      startMinute: 1380,
      endMinute: 360,
      qualification: { comparator: "GT", thresholdMinutes: 120 },
      workerQualification: {
        regularRotatingNightWorkRequiresConfirmation: true,
        annualNightWorkDaysThreshold: 48,
      },
      averageWindowDays: 28,
    });
    expect(legalCandidate.rules.restPeriod).toMatchObject({
      defaultMinutes: 660,
      deviations: [
        {
          id: "care-rest-deviation",
          sectorIds: ["hospital", "care"],
          minimumMinutes: 600,
          compensationMinutes: 720,
          compensationWithinDays: 28,
          compensationWithinCalendarMonths: 1,
        },
      ],
    });
    expect(legalCandidate.rules.sundayHolidayRest).toEqual({
      eligibleSectorIds: ["hospital", "care"],
      minimumFreeSundaysPerCalendarYear: 15,
      sundayCompensationPeriodDays: 14,
      weekdayHolidayCompensationPeriodDays: 56,
      replacementDayMinutes: 1440,
      connectedRestMinutes: 660,
      connectionExceptionMode: "TECHNICAL_OR_OPERATIONAL_REVIEW",
      evidenceShiftType: "FREE",
      matchingMode: "ONE_TO_ONE_EARLIEST_DEADLINE",
      sourceIds: ["arbzg-2024"],
    });
    expect(legalCandidate.rules.planning).toMatchObject({
      consecutiveWorkDaysWarning: 7,
      consecutiveNightShiftsWarning: 5,
      consecutiveWeekendGapDays: 7,
      lateEarlyDayGap: 1,
      sourceIds: ["pflegeshift-planning-policy-v1"],
    });
  });

  it("locks the 2026 nationwide, state and regional holiday scope", () => {
    const holidays = holidayCandidate.rules.holidays;
    expect(holidayCandidate.packageId).toBe("de-holidays");
    expect(holidayCandidate.versionId).toBe("2026");
    expect(holidayCandidate.engineContractVersion).toBe(2);
    expect(holidays).toHaveLength(23);
    expect(new Set(holidays.map((holiday) => holiday.id)).size).toBe(23);
    expect(holidays.filter((holiday) => holiday.scope === "NATIONWIDE")).toHaveLength(9);
    expect(holidays.filter((holiday) => holiday.scope === "REGIONAL")).toHaveLength(4);
    expect(holidays.every((holiday) => holiday.validFrom === "2026-01-01")).toBe(true);
    expect(holidays.every((holiday) => holiday.validTo === "2026-12-31")).toBe(true);
    expect(holidays.some((holiday) => holiday.calculation.type === "SPECIFIC_DATE")).toBe(false);

    expect(byId(holidays, "epiphany").federalStates).toEqual(["BW", "BY", "ST"]);
    expect(byId(holidays, "womens-day").federalStates).toEqual(["BE", "MV"]);
    expect(byId(holidays, "corpus-christi").federalStates).toEqual([
      "BW",
      "BY",
      "HE",
      "NW",
      "RP",
      "SL",
    ]);
    expect(byId(holidays, "corpus-christi").sourceIds).toEqual([
      "de-bw-holidays-2026",
      "de-by-holidays-2026",
      "de-he-holidays-2026",
      "de-nw-feiertg-2-2026",
      "de-rp-holidays-2026",
      "de-sl-sfg-2-2026",
    ]);
    expect(byId(holidays, "assumption-day-sl").federalStates).toEqual(["SL"]);
    expect(byId(holidays, "assumption-day-sl").sourceIds).toEqual(["de-sl-sfg-2-2026"]);
    expect(byId(holidays, "world-childrens-day-th").federalStates).toEqual(["TH"]);
    expect(byId(holidays, "world-childrens-day-th").sourceIds).toEqual(["de-th-holidays-2026"]);
    expect(byId(holidays, "reformation-day").federalStates).toEqual([
      "BB",
      "HB",
      "HH",
      "MV",
      "NI",
      "SN",
      "ST",
      "SH",
      "TH",
    ]);
    expect(byId(holidays, "reformation-day").sourceIds).toEqual([
      "de-bb-holidays-2026",
      "de-hb-feiertg-2-2026",
      "de-hh-feiertg-1-2026",
      "de-mv-ftg-2-2026",
      "de-ni-nfeiertagsg-2-2026",
      "de-sn-holidays-2026",
      "de-st-holidays-2026",
      "de-sh-sftg-2-2018",
      "de-th-holidays-2026",
    ]);
    expect(byId(holidays, "all-saints-day").federalStates).toEqual(["BW", "BY", "NW", "RP", "SL"]);
    expect(byId(holidays, "all-saints-day").sourceIds).toEqual([
      "de-bw-holidays-2026",
      "de-by-holidays-2026",
      "de-nw-feiertg-2-2026",
      "de-rp-holidays-2026",
      "de-sl-sfg-2-2026",
    ]);
    expect(byId(holidays, "repentance-day-sn").calculation.type).toBe("REPENTANCE_DAY");
    expect(byId(holidays, "easter-sunday-bb").calculation).toMatchObject({
      type: "EASTER_OFFSET",
      offsetDays: 0,
    });
    expect(byId(holidays, "whit-sunday-bb").calculation).toMatchObject({
      type: "EASTER_OFFSET",
      offsetDays: 49,
    });
    expect(byId(holidays, "assumption-day-by-regional").regionIds).toEqual([
      "by.maria-himmelfahrt",
      "by.augsburg",
    ]);
    expect(byId(holidays, "augsburg-peace-festival").regionIds).toEqual(["by.augsburg"]);
    expect(byId(holidays, "corpus-christi-sn-regional").regionIds).toEqual(["sn.fronleichnam"]);
    expect(byId(holidays, "corpus-christi-th-regional").regionIds).toEqual(["th.fronleichnam"]);

    for (const [sourceId, sourceSnapshot] of Object.entries(holidaySourceSnapshots)) {
      expect(byId(holidayCandidate.sources, sourceId)).toMatchObject({
        url: sourceSnapshot.url,
        documentDate: sourceSnapshot.documentDate,
        sha256: snapshotSha256(sourceSnapshot.relativePath),
      });
    }
  });
});
