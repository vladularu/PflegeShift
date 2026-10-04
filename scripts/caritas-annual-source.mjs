import { caritasAvrText2025 } from "./caritas-time-premium-source.mjs";

// Publisher PDFs are byte-identified; the policy remains draft metadata until its
// personal basis, eligibility and payout paths are implemented and reviewed.
export const caritasAvrText2026 = {
  id: "caritas-avr-text-2026-03",
  title: "Deutscher Caritasverband / Lambertus, AVR-Caritas Gesamtausgabe 2026",
  url: "https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/AVR_Online-PDF_2026_final.pdf",
  documentDate: "2026-03-19",
  section:
    "Anlagen 31/32 § 4 Abs. 6–8, § 6 Abs. 1, § 12 Abs. 1 und § 16 (Überstunden und Jahressonderzahlung)",
  sha256: "cb6fc32981eb120d5c05e68d6563725436001409e9bc728bc47d52d08d705aa7",
};

export const caritasEastAnnualAmendment = {
  id: "caritas-bk-2025-03-east-annual",
  title: "Caritas Bundeskommission BK 3/2025, Bemessungssatz RK Ost",
  url: "https://caritas-dienstgeber.de/fileadmin/Beschluesse/BK/BK_2025-03_Beschluss_Berechnung_JSZ_und_Weihnachtsgeld_fuer_die_RK_Ost_gez.pdf",
  documentDate: "2025-10-09",
  section: "Abschnitt II und IV: § 16 Abs. 3 der Anlagen 31/32 entfällt zum 01.01.2026",
  sha256: "cb16c87710b42662d49e59666cee82c74d406f2da7569b6cfc7b9b9937c596c3",
};

export function caritasAnnualPaymentPolicy(validFrom, validTo, isOst) {
  const year = Number(validFrom.slice(0, 4));
  if (![2025, 2026].includes(year) || Number(validTo.slice(0, 4)) !== year)
    throw new Error(`No verified Caritas annual-payment policy for ${validFrom}–${validTo}`);
  return {
    validFrom,
    validTo,
    referenceMonths: [7, 8, 9],
    rateDateMonthDay: "09-01",
    claimDateMonthDay: "12-01",
    payoutMonth: 11,
    rateBands: [
      { groupIds: ["p4", "p6", "p7", "p8"], rateBasisPoints: 8600 },
      {
        groupIds: ["p9", "p10", "p11", "p12", "p13", "p14", "p15", "p16"],
        rateBasisPoints: 7600,
      },
    ],
    basisPolicy: "PAID_JULY_SEPTEMBER_WITH_EXCLUSIONS",
    lateEntryBasis: "FIRST_FULL_MONTH_AFTER_SEPTEMBER",
    reductionPolicy: "ONE_TWELFTH_WITH_STATUTORY_EXCEPTIONS",
    earlyExitVariantId: "ANLAGE_31",
    earlyExitBasis: "LAST_FULL_MONTH_TABLE_AND_FIXED_ALLOWANCES",
    eastTariff2025UsesWestTable: Boolean(isOst && year === 2025),
    sourceIds: [
      year === 2025 ? caritasAvrText2025.id : caritasAvrText2026.id,
      ...(isOst && year === 2026 ? [caritasEastAnnualAmendment.id] : []),
    ],
  };
}
