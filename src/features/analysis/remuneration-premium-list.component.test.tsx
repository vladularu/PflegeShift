import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render } from "@testing-library/react-native";
import type {
  TimeRemunerationPosition,
  TimeRemunerationResult,
} from "@/domain/remuneration-result";
import { shift } from "@/engine/remuneration-test-fixtures";
import { LIGHT_PALETTE as mockLightPalette } from "@/theme/palette-values";
import { RemunerationPremiumList } from "./remuneration-premium-list";
jest.mock("@/theme/palette", () => ({ usePalette: () => mockLightPalette }));
jest.mock("@/ui/haptics", () => ({ selectionFeedback: jest.fn() }));
function position(change: Partial<TimeRemunerationPosition> = {}): TimeRemunerationPosition {
  return {
    id: "night",
    kind: "time-premium",
    label: "Nacht",
    from: "2026-09-06",
    through: "2026-09-06",
    fromEpochMinutes: 29812080,
    untilEpochMinutes: 29812140,
    shiftId: "night",
    status: "calculated",
    amountCents: 150,
    source: {
      kind: "tariff",
      profileEffectiveFrom: "2026-09-01",
      profileRevision: 1,
      requestedPackageId: "test-tariff",
      packageId: "test-tariff",
      versionId: "2026-09",
      packageValidFrom: "2026-09-01",
      packageValidTo: "2026-12-31",
      references: [],
    },
    basis: {
      ruleId: "test-night",
      minutes: 60,
      hourlyRateCents: 1500,
      percentageBasisPoints: 1000,
      pauseMethod: "none",
    },
    issue: null,
    ...change,
  };
}
function result(positions: readonly TimeRemunerationPosition[]): TimeRemunerationResult {
  const complete = positions.every((p) => p.amountCents !== null);
  const knownSubtotalCents = positions.reduce((sum, p) => sum + (p.amountCents ?? 0), 0);
  return {
    positions,
    netMinutes: 60,
    complete,
    totalCents: complete ? knownSubtotalCents : null,
    knownSubtotalCents,
    status: complete ? "calculated" : "unavailable",
  };
}
describe("reference premium service cards", () => {
  it("groups exact calculated cents by service and filters without recalculating them", async () => {
    const positions = [
      position(),
      position({ id: "holiday", label: "Feiertag mit Freizeitausgleich", amountCents: 275 }),
      position({
        id: "sun",
        shiftId: "sun",
        label: "Sonntag",
        amountCents: 90,
        from: "2026-09-07",
        through: "2026-09-07",
      }),
    ];
    const screen = await render(
      <RemunerationPremiumList
        month="2026-09"
        result={result(positions)}
        shifts={[
          shift({ id: "night", title: "Nachtdienst" }),
          shift({ id: "sun", title: "Sonntagsdienst" }),
        ]}
      />,
    );
    expect(screen.getAllByText("5,15 €").length).toBeGreaterThan(0);
    expect(screen.queryByText("Berechnungsgrundlage & Quellen")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: /Nachtdienst, 4,25/ }));
    expect(screen.getByText("Feiertag mit Freizeitausgleich")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Nacht, 1,50 €" }));
    expect(screen.getByText(/Gefiltert: Nacht/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Sonntagsdienst/ })).toBeNull();
    expect(
      screen.getByRole("button", { name: /Nachtdienst, 1,50/ }).props.accessibilityState.expanded,
    ).toBe(false);
    await fireEvent.press(screen.getByRole("button", { name: "Feiertag, 2,75 €" }));
    expect(screen.getByText(/Gefiltert: Feiertag/)).toBeTruthy();
  });
  it("keeps an unresolved component visible as a partial amount", async () => {
    const screen = await render(
      <RemunerationPremiumList
        month="2026-09"
        result={result([
          position({ amountCents: 100 }),
          position({
            id: "missing",
            amountCents: null,
            status: "unavailable",
            issue: { code: "PREMIUM_RATE_MISSING", message: "Die Zuschlagsgrundlage fehlt." },
          }),
        ])}
        shifts={[shift({ id: "night" })]}
      />,
    );
    expect(screen.getAllByText("Teilbetrag: 1,00 €").length).toBeGreaterThan(0);
    expect(screen.getByText("Die Zuschlagsgrundlage fehlt.")).toBeTruthy();
    expect(screen.queryByText("0,00 €")).toBeNull();
    expect(screen.queryByText("1,00 €")).toBeNull();
  });
  it("keeps daily aggregates separate and uses the accounting date for carry-in", async () => {
    const screen = await render(
      <RemunerationPremiumList
        month="2026-09"
        result={result([
          position({ id: "carry", from: "2026-09-01", through: "2026-09-01" }),
          position({
            id: "daily",
            shiftId: null,
            from: "2026-09-01",
            through: "2026-09-01",
            amountCents: 275,
          }),
        ])}
        shifts={[shift({ id: "night", date: "2026-08-31", title: "Nachtdienst" })]}
      />,
    );
    expect(screen.getByRole("button", { name: /Zeitzuschläge des Tages, 2,75/ })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: /Nachtdienst, 1,50/ }));
    expect(screen.getByText("01.09.2026")).toBeTruthy();
    expect(screen.queryByText("31.08.2026")).toBeNull();
    expect(screen.queryByRole("button", { name: /Nachtdienst, 4,25/ })).toBeNull();
  });
});
