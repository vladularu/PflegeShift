import type { PayGroup, PayLevel, TariffRegion, TariffSector, UserProfile } from "@/domain/types";
import type { RuleResolver } from "@/rules/rule-resolver";
import type { RemunerationContext } from "./remuneration-context";

const BOUND_RESOLVERS = new WeakMap<RuleResolver, Map<string, RuleResolver>>();

/** No fallback: all legacy tariff helper calls use this explicit, already resolved track. */
export function bindRemunerationTariffResolver(
  resolver: RuleResolver,
  packageId: string,
): RuleResolver {
  const existing = BOUND_RESOLVERS.get(resolver);
  const cached = existing?.get(packageId);
  if (cached) return cached;
  const bound: RuleResolver = Object.freeze({
    resolveTariff: (date: string, requested = packageId) => resolver.resolveTariff(date, requested),
    resolveLegal: resolver.resolveLegal,
    resolveHoliday: resolver.resolveHoliday,
  });
  const next = existing ?? new Map<string, RuleResolver>();
  next.set(packageId, bound);
  if (!existing) BOUND_RESOLVERS.set(resolver, next);
  return bound;
}

/** Adapter for the currently supported TVöD engine; region/timezone remain work-profile data. */
export function remunerationTariffProfile(
  base: UserProfile,
  context: Extract<RemunerationContext, { kind: "tariff" }>,
): UserProfile {
  const selection = context.profile?.data.selection;
  if (!selection || selection.kind !== "tariff") throw new Error("Vergütungsprofil fehlt.");
  return {
    ...base,
    weeklyMinutes: context.weeklyMinutes,
    manualMonthlyGrossCents: null,
    updatedAt: context.profile!.updatedAt,
    tariff: {
      payGroup: selection.group as PayGroup,
      payLevel: Number(selection.level) as PayLevel,
      sector: selection.variant as TariffSector,
      tariffRegion: selection.region as TariffRegion,
      fullTimeWeeklyMinutes: context.fullTimeWeeklyMinutes,
    },
  };
}
