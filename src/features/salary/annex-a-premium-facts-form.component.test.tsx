import { act, fireEvent, render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import type { ComponentProps, PropsWithChildren } from "react";
import { ActionSheetIOS } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import { validateSavedTvoedAnnexAPremiumFacts } from "@/domain/saved-tvoed-annex-a-premium-facts";
import { history, shift, work } from "@/engine/remuneration-test-fixtures";
import { LIGHT_PALETTE } from "@/theme/palette-values";
import { AnnexAPremiumFactsForm } from "./annex-a-premium-facts-form";
import { annexAPremiumDayChoices } from "./annex-a-premium-facts-model";

const mockPalette = LIGHT_PALETTE;
jest.mock("@/theme/palette", () => ({ usePalette: () => mockPalette }));
jest.mock("@/ui/haptics", () => ({ successFeedback: jest.fn() }));

const profile: DatedRemunerationProfile = {
  ...history("2026-09-01"),
  data: {
    version: 1,
    weeklyMinutes: 2340,
    selection: {
      kind: "tariff",
      packageId: "tvoed-vka-anlage-a",
      variant: "BT_K",
      region: "VKA",
      group: "EG8",
      level: "3",
      fullTimeWeeklyMinutes: 2340,
    },
  },
};
const entry = shift({ date: "2026-09-19", startTime: "15:00", endTime: "18:00" });
const choice = annexAPremiumDayChoices("2026-09", [entry], profile, work.timeZone)[0];
const saved = validateSavedTvoedAnnexAPremiumFacts({
  month: "2026-09",
  profileEffectiveFrom: "2026-09-01",
  profileRevision: profile.revision,
  packageId: "tvoed-vka-anlage-a",
  ruleVersionId: "2026-05-01-draft1",
  variantId: "BT_K",
  regionId: "VKA",
  groupId: "eg8",
  stepId: "s3",
  contractedWeeklyMinutes: 2340,
  comparableFullTimeWeeklyMinutes: 2340,
  timeZoneId: "Europe/Berlin",
  cashPaymentConfirmed: true,
  localAgreement: "NONE_CONFIRMED",
  dayDecisions: [
    {
      shiftId: entry.id,
      date: choice.date,
      origin: "confirmed",
      shiftBinding: choice.shiftBinding,
      workKind: "REGULAR_ACTIVE",
      holidayTimeOff: null,
      shiftWork: true,
      legacyAngestellteClass: false,
    },
  ],
  revision: 2,
  confirmedAt: "2026-09-24T09:00:00.000Z",
  updatedAt: "2026-09-24T09:00:00.000Z",
});

function TestContext({ children }: PropsWithChildren) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { width: 430, height: 932, x: 0, y: 0 },
        insets: { top: 59, bottom: 34, left: 0, right: 0 },
      }}
    >
      {children}
    </SafeAreaProvider>
  );
}

async function setup(changes: Partial<ComponentProps<typeof AnnexAPremiumFactsForm>> = {}) {
  jest.spyOn(ActionSheetIOS, "showActionSheetWithOptions").mockImplementation(() => {});
  const onSave = jest.fn(async () => ({ ...saved, revision: saved.revision + 1 }));
  const props: ComponentProps<typeof AnnexAPremiumFactsForm> = {
    month: "2026-09",
    profileEffectiveFrom: "2026-09-01",
    profileRevision: profile.revision,
    ruleVersionId: "2026-05-01-draft1",
    choices: [choice],
    holidays: new Map(),
    saved: null,
    current: false,
    onSave,
    onReload: jest.fn(),
    ...changes,
  };
  const screen = await render(<AnnexAPremiumFactsForm {...props} />, { wrapper: TestContext });
  const rerender = (next: Partial<ComponentProps<typeof AnnexAPremiumFactsForm>>) =>
    screen.rerender(<AnnexAPremiumFactsForm {...props} {...next} />);
  return { screen, onSave, rerender };
}

async function choose(
  screen: Awaited<ReturnType<typeof setup>>["screen"],
  field: RegExp,
  label: string,
) {
  await fireEvent.press(screen.getByRole("button", { name: field }));
  const [options, select] = jest
    .mocked(ActionSheetIOS.showActionSheetWithOptions)
    .mock.calls.at(-1)!;
  const index = options.options.indexOf(label);
  expect(index).toBeGreaterThanOrEqual(0);
  await act(async () => select(index));
}

describe("TVöD Anlage A premium facts form", () => {
  it("stores unanswered facts as unknown and binds one decision to the exact work day", async () => {
    const { screen, onSave } = await setup();
    await fireEvent.press(screen.getByText("Zuschlagsangaben speichern"));
    expect(onSave).toHaveBeenCalledWith({
      month: "2026-09",
      profileEffectiveFrom: "2026-09-01",
      expectedProfileRevision: profile.revision,
      ruleVersionId: "2026-05-01-draft1",
      cashPaymentConfirmed: null,
      localAgreement: "UNKNOWN",
      dayDecisions: [
        {
          shiftId: entry.id,
          date: choice.date,
          origin: "confirmed",
          shiftBinding: choice.shiftBinding,
          workKind: null,
          holidayTimeOff: null,
          shiftWork: null,
          legacyAngestellteClass: null,
        },
      ],
      expectedRevision: 0,
    });
  });

  it("exposes Saturday follow-up only after confirming shift work", async () => {
    const { screen, onSave } = await setup();
    expect(
      screen.queryByRole("button", { name: /Altvertragliche Angestellten-Regelung/ }),
    ).toBeNull();
    await choose(screen, /Schichtarbeit am Samstag/, "Ja");
    expect(
      screen.getByRole("button", { name: /Altvertragliche Angestellten-Regelung/ }),
    ).toBeTruthy();
    await choose(screen, /Altvertragliche Angestellten-Regelung/, "Nein");
    await choose(screen, /Arbeitsart an diesem Tag/, "Reguläre aktive Arbeit");
    await fireEvent.press(screen.getByText("Zuschlagsangaben speichern"));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        dayDecisions: [
          expect.objectContaining({
            shiftWork: true,
            legacyAngestellteClass: false,
            workKind: "REGULAR_ACTIVE",
          }),
        ],
      }),
    );
  });

  it("discards old answers after changed shift content but keeps the conflict revision", async () => {
    const changed = annexAPremiumDayChoices(
      "2026-09",
      [shift({ ...entry, startTime: "14:00" })],
      profile,
      work.timeZone,
    )[0];
    const { screen, onSave } = await setup({ choices: [changed], saved, current: true });
    expect(
      screen.getByRole("button", { name: /Arbeitsart an diesem Tag.*Ungeklärt/ }),
    ).toBeTruthy();
    await fireEvent.press(screen.getByText("Zuschlagsangaben speichern"));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedRevision: 2,
        dayDecisions: [
          expect.objectContaining({ workKind: null, shiftBinding: changed.shiftBinding }),
        ],
      }),
    );
  });
});
