import type { PayGroup, PayLevel, TariffProfile } from "@/domain/types";

type TariffValues = Readonly<Record<PayLevel, number>>;
type TariffTable = Readonly<Record<PayGroup, TariffValues>>;

export interface TariffVersion {
  readonly id: string;
  readonly label: string;
  readonly validFrom: string;
  readonly validTo: string;
  readonly monthly: TariffTable;
  readonly hourly: TariffTable;
}

const MONTHLY_2026: TariffTable = {
  P7: { 2: 3510.30, 3: 3701.21, 4: 3998.33, 5: 4149.59, 6: 4305.40 },
  P8: { 2: 3701.21, 3: 3862.80, 4: 4075.58, 5: 4247.92, 6: 4488.98 },
  P9: { 2: 3992.39, 3: 4184.40, 4: 4312.38, 5: 4558.59, 6: 4662.42 },
  P10: { 2: 4184.40, 3: 4312.38, 4: 4675.42, 5: 4850.63, 6: 4960.96 },
  P11: { 2: 4419.71, 3: 4557.30, 4: 4901.27, 5: 5129.69, 6: 5233.54 },
  P12: { 2: 4657.22, 3: 4802.61, 4: 5166.04, 5: 5389.29, 6: 5493.13 },
  P13: { 2: 4894.78, 3: 5047.94, 4: 5430.82, 5: 5707.28, 6: 5778.68 },
  P14: { 2: 5013.53, 3: 5170.59, 4: 5563.22, 5: 6096.68, 6: 6194.02 },
  P15: { 2: 5132.29, 3: 5293.23, 4: 5695.60, 5: 6177.16, 6: 6361.06 },
  P16: { 2: 5240.04, 3: 5415.90, 4: 5983.76, 5: 6645.71, 6: 6937.70 },
};

const HOURLY_2026: TariffTable = {
  P7: { 2: 20.70, 3: 21.83, 4: 23.58, 5: 24.47, 6: 25.39 },
  P8: { 2: 21.83, 3: 22.78, 4: 24.03, 5: 25.05, 6: 26.47 },
  P9: { 2: 23.54, 3: 24.68, 4: 25.43, 5: 26.88, 6: 27.50 },
  P10: { 2: 24.68, 3: 25.43, 4: 27.57, 5: 28.61, 6: 29.26 },
  P11: { 2: 26.06, 3: 26.88, 4: 28.90, 5: 30.25, 6: 30.86 },
  P12: { 2: 27.46, 3: 28.32, 4: 30.47, 5: 31.78, 6: 32.39 },
  P13: { 2: 28.87, 3: 29.77, 4: 32.03, 5: 33.66, 6: 34.08 },
  P14: { 2: 29.57, 3: 30.49, 4: 32.81, 5: 35.95, 6: 36.53 },
  P15: { 2: 30.27, 3: 31.22, 4: 33.59, 5: 36.43, 6: 37.51 },
  P16: { 2: 30.90, 3: 31.94, 4: 35.29, 5: 39.19, 6: 40.91 },
};

function previousTable(table: TariffTable): TariffTable {
  return Object.fromEntries(
    Object.entries(table).map(([group, levels]) => [
      group,
      Object.fromEntries(
        Object.entries(levels).map(([level, value]) => [
          level,
          Math.round((value / 1.028) * 100) / 100,
        ]),
      ),
    ]),
  ) as TariffTable;
}

export const TARIFF_VERSIONS: readonly TariffVersion[] = [
  {
    id: "tvoed-p-vka-2025-04",
    label: "TVöD-P VKA · 01.04.2025–30.04.2026",
    validFrom: "2025-04-01",
    validTo: "2026-04-30",
    monthly: previousTable(MONTHLY_2026),
    hourly: previousTable(HOURLY_2026),
  },
  {
    id: "tvoed-p-vka-2026-05",
    label: "TVöD-P VKA · 01.05.2026–31.03.2027",
    validFrom: "2026-05-01",
    validTo: "2027-03-31",
    monthly: MONTHLY_2026,
    hourly: HOURLY_2026,
  },
] as const;

export function getTariffVersion(date: string): TariffVersion | null {
  return TARIFF_VERSIONS.find(
    (version) => version.validFrom <= date && date <= version.validTo,
  ) ?? null;
}

export function getMonthlyTableAmount(
  profile: TariffProfile,
  date: string,
): number | null {
  return getTariffVersion(date)?.monthly[profile.payGroup][profile.payLevel] ?? null;
}

export function getIndividualHourlyRate(
  profile: TariffProfile,
  date: string,
): number | null {
  return getTariffVersion(date)?.hourly[profile.payGroup][profile.payLevel] ?? null;
}

export function getPremiumHourlyRate(
  profile: TariffProfile,
  date: string,
): number | null {
  return getTariffVersion(date)?.hourly[profile.payGroup][3] ?? null;
}
