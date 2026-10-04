// The SHA-256 values identify the original publisher PDFs, not an extracted HTML page.
export const caritasAvrText2025 = {
  id: "caritas-avr-text-2025-1",
  title: "Deutscher Caritasverband / Lambertus, AVR-Caritas Gesamtausgabe 2025/1",
  url: "https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/AVR-PDF_Version_2025_1.pdf",
  documentDate: "2025-09-25",
  section:
    "Anlagen 31/32 § 4 Abs. 5–8, § 6 Abs. 1 und 3, § 12 Abs. 1 und § 16; Anlage 1 Abschnitt X(b)",
  sha256: "6b02381f7424744c1c8a5c60c55c65ab8a77c64f22444740e1e7be950117a6fc",
};

export const caritasTimePremiumTables = {
  2025: {
    id: "caritas-time-premiums-2025",
    title: "DCV Arbeits- und Tarifrecht, Zeitzuschlagstabellen 2025",
    url: "https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/Zeitzuschlagstabellen_2025_AVR.pdf",
    documentDate: "2025-09-03",
    section: "S. 8-10: Anlagen 31/32, Feiertage, Nachtfenster, Stufe 3, Samstag und Kollisionen",
    sha256: "43b73882a5f9e06f7d48fe6034febb38f6a3a9e69c41c6098669646b3950df80",
  },
  2026: {
    id: "caritas-time-premiums-2026",
    title: "DCV Arbeits- und Tarifrecht, Zeitzuschlagstabellen 2026",
    url: "https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/Zeitzuschlagstabellen2026_AVR_und_bundesweite_Feiertage_31.10.2025_.pdf",
    documentDate: "2025-10-31",
    section: "S. 8-10: Anlagen 31/32, Feiertage, Nachtfenster, Stufe 3, Samstag und Kollisionen",
    sha256: "0e0869710b087a72ee3452d2caf9d65e1234f16e50b8d93a6c59989e3e12ade4",
  },
};

export function caritasTimePremiumPolicy(validFrom, validTo) {
  const firstYear = Number(validFrom.slice(0, 4));
  const lastYear = Number(validTo.slice(0, 4));
  const annual = Array.from(
    { length: lastYear - firstYear + 1 },
    (_, index) => caritasTimePremiumTables[firstYear + index],
  );
  if (!annual.length || annual.some((source) => !source))
    throw new Error(`No verified Caritas time-premium table for ${validFrom}–${validTo}`);
  return {
    validFrom,
    validTo,
    referenceStepId: "3",
    monthlyFactorThousandths: 4348,
    nightWindow: { startMinute: 1260, endMinute: 360 },
    nightBasisPoints: 2000,
    sundayBasisPoints: 2500,
    holidayWithTimeOffBasisPoints: 3500,
    holidayWithoutTimeOffBasisPoints: 13500,
    preHolidayWindow: { startMinute: 360, endMinute: 0 },
    preHolidayMonthDays: ["12-24", "12-31"],
    preHolidayBasisPoints: 3500,
    saturdayWindow: { startMinute: 780, endMinute: 1260 },
    saturdayBasisPoints: 2000,
    saturdayOnlyOutsideShiftWork: true,
    competition: "HIGHEST_SUNDAY_HOLIDAY_PREHOLIDAY_SATURDAY",
    nightStacks: true,
    holidayWithoutTimeOffMaximumTotalBasisPoints: 23500,
    localAgreementMayIncrease: true,
    sourceIds: [caritasAvrText2025.id, ...annual.map((source) => source.id)],
  };
}

// Anlage 31/32 § 4(6-8), § 6(1) and § 12(1). These are pay rates, not a
// determination that particular recorded minutes legally qualify as overtime.
export function caritasOvertimePolicy(validFrom, validTo, avrTextSource) {
  const year = validFrom.slice(0, 4);
  const expectedSourceId = year === "2025" ? caritasAvrText2025.id : "caritas-avr-text-2026-03";
  if (
    validFrom < "2025-01-01" ||
    validTo > "2026-12-31" ||
    validTo < validFrom ||
    (year === "2025" && validTo > "2026-01-31") ||
    avrTextSource?.id !== expectedSourceId
  )
    throw new Error(`No reviewed Caritas overtime policy for ${validFrom}–${validTo}`);
  return {
    validFrom,
    validTo,
    premiumReferenceStepId: "3",
    workPayMaximumStepId: "4",
    monthlyFactorThousandths: 4348,
    rateBands: [
      {
        groupIds: ["p4", "p6", "p7", "p8", "p9", "p10", "p11"],
        premiumBasisPoints: 3000,
      },
      {
        groupIds: ["p12", "p13", "p14", "p15", "p16"],
        premiumBasisPoints: 1500,
      },
    ],
    requiresConfirmedClassification: true,
    requiresSettlementChoice: true,
    timeConversionAllowed: true,
    sourceIds: [avrTextSource.id],
  };
}
