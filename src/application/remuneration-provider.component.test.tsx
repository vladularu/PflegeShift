import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { Pressable, Text } from "react-native";
import {
  RemunerationProvider,
  useRemunerationData,
  useRemunerationHistory,
  REMUNERATION_LOAD_FAILURE_MESSAGE,
} from "./remuneration-provider";
import type {
  DatedRemunerationProfile,
  SaveDatedRemunerationProfileInput,
} from "@/domain/remuneration-profile";
import type { RemunerationRepositoryPort, RemunerationSnapshot } from "./pflegeshift-ports";
import type { MonthlyAllowanceDecisions } from "@/domain/allowance-decisions";
import type { SavedOvertimeAllocation } from "@/domain/overtime-allocation";
import type { SavedPaidAbsence } from "@/domain/paid-absence";
import type { SavedActualOwnAnnualPayment } from "@/domain/saved-annual-payment";
import type { SavedTariffAnnualClaim } from "@/domain/saved-tariff-annual-claim";
import { tariffAnnualFixture } from "@/engine/tariff-annual-test-fixtures";
import { validateSavedCaritasMonthFacts } from "@/domain/saved-caritas-month-facts";
import { validateSavedDrkEmployeeMonthConfirmation } from "@/domain/saved-drk-employee-month-confirmation";
import { validateSavedDrkTrainingMonthConfirmation } from "@/domain/saved-drk-training-month-confirmation";
import { validateSavedTvoedAnnexAMonthConfirmation } from "@/domain/saved-tvoed-annex-a-month-confirmation";
import { validateSavedTvoedAnnexAPremiumFacts } from "@/domain/saved-tvoed-annex-a-premium-facts";
import { validateSavedTvoedSueAllowanceConfirmation } from "@/domain/saved-tvoed-sue-allowance-confirmation";

const caritasMonthFacts = validateSavedCaritasMonthFacts({
  month: "2026-09",
  profileEffectiveFrom: "2026-09-01",
  profileRevision: 1,
  packageId: "avr-caritas-p-bw",
  ruleVersionId: "2026-02-01-draft1",
  variantId: "ANLAGE_31",
  regionId: "BW",
  fullMonthEmploymentConfirmed: true,
  fullMonthlyBaseEntitlementConfirmed: null,
  fixedAllowanceClaim: "UNKNOWN",
  careAllowanceClaim: "UNKNOWN",
  localAgreement: "UNKNOWN",
  revision: 1,
  confirmedAt: "2026-09-22T00:00:00Z",
  updatedAt: "2026-09-22T00:00:00Z",
});
const drkMonthConfirmation = validateSavedDrkEmployeeMonthConfirmation({
  month: "2026-10",
  profileEffectiveFrom: "2026-10-01",
  profileRevision: 1,
  packageId: "drk-rtv-p",
  ruleVersionId: "2026-10-01-draft1",
  variantId: "ANLAGE_A2",
  regionId: "BTG",
  groupId: "p6",
  stepId: "s1",
  contractedWeeklyMinutes: 1200,
  fullTimeWeeklyMinutes: 2340,
  drkApplicabilityConfirmed: true,
  annexAssignmentConfirmed: true,
  payGroupAndStepConfirmed: true,
  weeklyTimeBasisConfirmed: true,
  fullMonthBaseEntitlementConfirmed: null,
  revision: 1,
  confirmedAt: "2026-09-22T00:00:00Z",
  updatedAt: "2026-09-22T00:00:00Z",
});
const drkInput = {
  month: "2026-10",
  profileEffectiveFrom: "2026-10-01",
  expectedProfileRevision: 1,
  ruleVersionId: "2026-10-01-draft1",
  drkApplicabilityConfirmed: true,
  annexAssignmentConfirmed: true,
  payGroupAndStepConfirmed: true,
  weeklyTimeBasisConfirmed: true,
  fullMonthBaseEntitlementConfirmed: null,
  expectedRevision: 0,
} as const;
const drkTrainingMonthConfirmation = validateSavedDrkTrainingMonthConfirmation({
  month: "2026-10",
  remunerationProfileEffectiveFrom: "2026-10-01",
  remunerationProfileRevision: 1,
  trainingProfileEffectiveFrom: "2026-09-01",
  trainingProfileRevision: 1,
  packageId: "drk-rtv-training",
  ruleVersionId: "2026-10-01-draft1",
  variantId: "ANLAGE_3A_A",
  regionId: "BTG",
  groupId: "anlage-3a-a",
  trainingYear: 1,
  weeklyMinutes: 2340,
  fullTimeWeeklyMinutes: 2340,
  trainingProfession: "Pflegefachperson",
  trainingLegalBasis: "PFLBG",
  trainingStartedOn: "2026-09-01",
  trainingExpectedEndOn: null,
  trainingYearConfirmedFrom: "2026-09-01",
  drkApplicabilityConfirmed: true,
  trainingCategoryConfirmed: true,
  trainingYearConfirmed: true,
  fullMonthBaseEntitlementConfirmed: null,
  fullTimeTrainingConfirmed: true,
  revision: 1,
  confirmedAt: "2026-09-22T00:00:00Z",
  updatedAt: "2026-09-22T00:00:00Z",
});
const drkTrainingInput = {
  month: "2026-10",
  remunerationProfileEffectiveFrom: "2026-10-01",
  expectedRemunerationProfileRevision: 1,
  trainingProfileEffectiveFrom: "2026-09-01",
  expectedTrainingProfileRevision: 1,
  ruleVersionId: "2026-10-01-draft1",
  drkApplicabilityConfirmed: true,
  trainingCategoryConfirmed: true,
  trainingYearConfirmed: true,
  fullMonthBaseEntitlementConfirmed: null,
  fullTimeTrainingConfirmed: true,
  expectedRevision: 0,
} as const;
const caritasInput = {
  month: "2026-09",
  profileEffectiveFrom: "2026-09-01",
  expectedProfileRevision: 1,
  ruleVersionId: "2026-02-01-draft1",
  fullMonthEmploymentConfirmed: true,
  fullMonthlyBaseEntitlementConfirmed: null,
  fixedAllowanceClaim: "UNKNOWN",
  careAllowanceClaim: "UNKNOWN",
  localAgreement: "UNKNOWN",
  expectedRevision: 0,
} as const;
const annexAConfirmation = validateSavedTvoedAnnexAMonthConfirmation({
  month: "2026-09",
  profileEffectiveFrom: "2026-09-01",
  profileRevision: 1,
  packageId: "tvoed-vka-anlage-a",
  ruleVersionId: "2026-05-01-draft1",
  variantId: "BT_K",
  regionId: "VKA",
  groupId: "eg5",
  stepId: "s2",
  contractedWeeklyMinutes: 2340,
  comparableFullTimeWeeklyMinutes: 2340,
  applicabilityConfirmed: true,
  comparableFullTimeConfirmed: true,
  fullMonthBaseEntitlementConfirmed: true,
  fullMonthSameContractConfirmed: null,
  revision: 1,
  confirmedAt: "2026-09-22T00:00:00Z",
  updatedAt: "2026-09-22T00:00:00Z",
});
const annexAInput = {
  month: "2026-09",
  profileEffectiveFrom: "2026-09-01",
  expectedProfileRevision: 1,
  ruleVersionId: "2026-05-01-draft1",
  applicabilityConfirmed: true,
  comparableFullTimeConfirmed: true,
  fullMonthBaseEntitlementConfirmed: true,
  fullMonthSameContractConfirmed: null,
  expectedRevision: 0,
} as const;
const annexAPremiumFacts = validateSavedTvoedAnnexAPremiumFacts({
  month: "2026-09",
  profileEffectiveFrom: "2026-09-01",
  profileRevision: 1,
  packageId: "tvoed-vka-anlage-a",
  ruleVersionId: "2026-05-01-draft1",
  variantId: "BT_K",
  regionId: "VKA",
  groupId: "eg5",
  stepId: "s2",
  contractedWeeklyMinutes: 2340,
  comparableFullTimeWeeklyMinutes: 2340,
  timeZoneId: "Europe/Berlin",
  cashPaymentConfirmed: true,
  localAgreement: "NONE_CONFIRMED",
  dayDecisions: [],
  revision: 1,
  confirmedAt: "2026-09-22T00:00:00Z",
  updatedAt: "2026-09-22T00:00:00Z",
});
const annexAPremiumInput = {
  month: "2026-09",
  profileEffectiveFrom: "2026-09-01",
  expectedProfileRevision: 1,
  ruleVersionId: "2026-05-01-draft1",
  cashPaymentConfirmed: true,
  localAgreement: "NONE_CONFIRMED",
  dayDecisions: [],
  expectedRevision: 0,
} as const;
const sueAllowanceConfirmation = validateSavedTvoedSueAllowanceConfirmation({
  month: "2026-09",
  profileEffectiveFrom: "2026-09-01",
  profileRevision: 1,
  packageId: "tvoed-vka-sue-bt-b",
  ruleVersionId: "2026-05-01-draft1",
  variantId: "BT_B",
  regionId: "VKA",
  groupId: "s8a",
  stepId: "s3",
  contractedWeeklyMinutes: 2340,
  standardFullTimeWeeklyMinutes: 2340,
  sectionXxivClassificationConfirmed: true,
  fullMonthAllowanceEntitlementConfirmed: true,
  caseGroup: null,
  conversionDays: "NONE_CONFIRMED",
  revision: 1,
  confirmedAt: "2026-09-22T00:00:00Z",
  updatedAt: "2026-09-22T00:00:00Z",
});
const sueAllowanceInput = {
  month: "2026-09",
  profileEffectiveFrom: "2026-09-01",
  expectedProfileRevision: 1,
  ruleVersionId: "2026-05-01-draft1",
  sectionXxivClassificationConfirmed: true,
  fullMonthAllowanceEntitlementConfirmed: true,
  caseGroup: null,
  conversionDays: "NONE_CONFIRMED",
  expectedRevision: 0,
} as const;

const tariffClaim: SavedTariffAnnualClaim = {
  claim: tariffAnnualFixture().claim,
  actualPayment: { grossCents: 87654, payoutMonth: "2027-01" },
  revoked: false,
  revision: 1,
  updatedAt: "2026-11-01T00:00:00Z",
};
const tariffClaimInput = {
  claim: tariffClaim.claim,
  actualPayment: tariffClaim.actualPayment,
  expected: null,
};

const annualPayment: SavedActualOwnAnnualPayment = {
  payment: {
    version: 1,
    revision: 1,
    paymentId: "annual",
    entitlementYear: 2026,
    payoutMonth: "2026-11",
    title: "Sonderzahlung",
    grossCents: 54321,
  },
  revoked: false,
  updatedAt: "2026-11-01T00:00:00Z",
};
const annualInput = {
  payment: {
    paymentId: "annual",
    entitlementYear: 2026,
    payoutMonth: "2026-11",
    title: "Sonderzahlung",
    grossCents: 54321,
  },
  expected: null,
};

const paidAbsence: SavedPaidAbsence = {
  shiftId: "absence-1",
  shiftRevision: 1,
  shiftDate: "2026-09-15",
  shiftUpdatedAt: "2026-09-01T00:00:00Z",
  timeZone: "Europe/Berlin",
  paidMinutes: 462,
  revision: 1,
  confirmedAt: "2026-09-02T00:00:00Z",
  updatedAt: "2026-09-02T00:00:00Z",
};
const paidAbsenceInput = {
  shiftId: paidAbsence.shiftId,
  expectedShiftRevision: paidAbsence.shiftRevision,
  expectedShiftDate: paidAbsence.shiftDate,
  expectedShiftUpdatedAt: paidAbsence.shiftUpdatedAt,
  timeZone: paidAbsence.timeZone,
  expectedRevision: 0,
  paidMinutes: 462,
};

const overtime: SavedOvertimeAllocation = {
  shiftId: "shift-1",
  shiftRevision: 3,
  timeZone: "Europe/Berlin",
  allocations: [{ date: "2026-09-30", minutes: 60 }],
  revision: 2,
  confirmedAt: "2026-09-30T22:00:00Z",
  updatedAt: "2026-09-30T22:00:00Z",
};
const overtimeInput = {
  shiftId: overtime.shiftId,
  expectedShiftRevision: overtime.shiftRevision,
  expectedRevision: 1,
  timeZone: overtime.timeZone,
  allocations: overtime.allocations,
};

const allowanceMonth: MonthlyAllowanceDecisions = {
  month: "2026-09",
  revision: 2,
  updatedAt: "2026-09-01T00:00:00Z",
  decisions: [],
};
const allowanceInput = { month: "2026-09", expectedRevision: 1, decisions: [] } as const;
function snapshot(
  profiles: readonly DatedRemunerationProfile[],
  allowanceDecisions: readonly MonthlyAllowanceDecisions[] = [],
  overtimeAllocations: readonly SavedOvertimeAllocation[] = [],
  paidAbsences: readonly SavedPaidAbsence[] = [],
  actualAnnualPayments: readonly SavedActualOwnAnnualPayment[] = [],
  tariffAnnualClaims: readonly SavedTariffAnnualClaim[] = [],
  tvlShiftWork: readonly import("@/domain/saved-tvl-shift-work").SavedTvlShiftWork[] = [],
): RemunerationSnapshot {
  return {
    drkEmployeeMonthConfirmations: [],
    drkTrainingMonthConfirmations: [],
    caritasMonthFacts: [],
    tvoedAnnexAMonthConfirmations: [],
    tvoedAnnexAPremiumFacts: [],
    tvoedSueMonthConfirmations: [],
    tvoedSueAllowanceConfirmations: [],
    profiles,
    allowanceDecisions,
    overtimeAllocations,
    paidAbsences,
    actualAnnualPayments,
    tariffAnnualClaims,
    tvlShiftWork,
  };
}

const data = {
  version: 1,
  weeklyMinutes: 2310,
  selection: { kind: "own-monthly", monthlyGrossCents: 300000 },
} as const;
const baseline: DatedRemunerationProfile = {
  effectiveFrom: null,
  data,
  revision: 1,
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
};
const dated: DatedRemunerationProfile = { ...baseline, effectiveFrom: "2026-10-01" };
const input: SaveDatedRemunerationProfileInput = {
  effectiveFrom: "2026-10-01",
  data,
  expectedRevision: 0,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function createPorts() {
  return {
    repository: {
      saveDrkEmployeeMonthConfirmation:
        jest.fn<RemunerationRepositoryPort["saveDrkEmployeeMonthConfirmation"]>(),
      saveDrkTrainingMonthConfirmation:
        jest.fn<RemunerationRepositoryPort["saveDrkTrainingMonthConfirmation"]>(),
      saveCaritasMonthFacts: jest.fn<RemunerationRepositoryPort["saveCaritasMonthFacts"]>(),
      saveTvoedAnnexAMonthConfirmation:
        jest.fn<RemunerationRepositoryPort["saveTvoedAnnexAMonthConfirmation"]>(),
      saveTvoedAnnexAPremiumFacts:
        jest.fn<RemunerationRepositoryPort["saveTvoedAnnexAPremiumFacts"]>(),
      saveTvoedSueMonthConfirmation:
        jest.fn<RemunerationRepositoryPort["saveTvoedSueMonthConfirmation"]>(),
      saveTvoedSueAllowanceConfirmation:
        jest.fn<RemunerationRepositoryPort["saveTvoedSueAllowanceConfirmation"]>(),
      saveTvlShiftWork: jest.fn<RemunerationRepositoryPort["saveTvlShiftWork"]>(),
      saveTariffAnnualClaim: jest.fn<RemunerationRepositoryPort["saveTariffAnnualClaim"]>(),
      revokeTariffAnnualClaim: jest.fn<RemunerationRepositoryPort["revokeTariffAnnualClaim"]>(),
      saveActualAnnualPayment: jest.fn<RemunerationRepositoryPort["saveActualAnnualPayment"]>(),
      revokeActualAnnualPayment: jest.fn<RemunerationRepositoryPort["revokeActualAnnualPayment"]>(),
      savePaidAbsence: jest
        .fn<RemunerationRepositoryPort["savePaidAbsence"]>()
        .mockResolvedValue(paidAbsence),
      loadSnapshot: jest
        .fn<RemunerationRepositoryPort["loadSnapshot"]>()
        .mockResolvedValue(snapshot([baseline])),
      saveProfile: jest.fn<RemunerationRepositoryPort["saveProfile"]>().mockResolvedValue(dated),
      saveOvertimeAllocation: jest
        .fn<RemunerationRepositoryPort["saveOvertimeAllocation"]>()
        .mockResolvedValue(overtime),
      saveAllowanceDecisions: jest
        .fn<RemunerationRepositoryPort["saveAllowanceDecisions"]>()
        .mockResolvedValue(allowanceMonth),
    },
    diagnostics: { record: jest.fn() },
  };
}
function Harness({
  onSaved = () => {},
  onError = () => {},
  onAllowanceSaved = () => {},
  onOvertimeSaved = () => {},
}: {
  readonly onSaved?: (profile: DatedRemunerationProfile) => void;
  readonly onError?: (error: unknown) => void;
  readonly onAllowanceSaved?: (month: MonthlyAllowanceDecisions) => void;
  readonly onOvertimeSaved?: (value: SavedOvertimeAllocation) => void;
}) {
  const state = useRemunerationData();
  const history = useRemunerationHistory();
  return (
    <>
      <Text testID="status">{state.status}</Text>
      <Text testID="caritas-month-facts">
        {state.caritasMonthFacts.map((row) => `${row.month}:${row.revision}`).join(",")}
      </Text>
      <Text testID="drk-month-confirmations">
        {state.drkEmployeeMonthConfirmations.map((row) => `${row.month}:${row.revision}`).join(",")}
      </Text>
      <Text testID="drk-training-month-confirmations">
        {state.drkTrainingMonthConfirmations.map((row) => `${row.month}:${row.revision}`).join(",")}
      </Text>
      <Pressable
        onPress={() =>
          void state.saveDrkEmployeeMonthConfirmation(drkInput).then(() => {}, onError)
        }
      >
        <Text>DRK-Monatsangaben speichern</Text>
      </Pressable>
      <Pressable
        onPress={() =>
          void state.saveDrkTrainingMonthConfirmation(drkTrainingInput).then(() => {}, onError)
        }
      >
        <Text>DRK-Ausbildungsangaben speichern</Text>
      </Pressable>
      <Text testID="annex-a-confirmations">
        {state.tvoedAnnexAMonthConfirmations.map((row) => `${row.month}:${row.revision}`).join(",")}
      </Text>
      <Text testID="annex-a-premium-facts">
        {state.tvoedAnnexAPremiumFacts.map((row) => `${row.month}:${row.revision}`).join(",")}
      </Text>
      <Text testID="sue-allowance-confirmations">
        {state.tvoedSueAllowanceConfirmations
          .map((row) => `${row.month}:${row.revision}`)
          .join(",")}
      </Text>
      <Pressable
        onPress={() =>
          void state.saveTvoedSueAllowanceConfirmation(sueAllowanceInput).then(() => {}, onError)
        }
      >
        <Text>SuE-Zulagenangaben speichern</Text>
      </Pressable>
      <Pressable
        onPress={() =>
          void state.saveTvoedAnnexAMonthConfirmation(annexAInput).then(() => {}, onError)
        }
      >
        <Text>EG-Monatsangaben speichern</Text>
      </Pressable>
      <Pressable
        onPress={() =>
          void state.saveTvoedAnnexAPremiumFacts(annexAPremiumInput).then(() => {}, onError)
        }
      >
        <Text>EG-Zuschlagsangaben speichern</Text>
      </Pressable>
      <Pressable
        onPress={() => void state.saveCaritasMonthFacts(caritasInput).then(() => {}, onError)}
      >
        <Text>Caritas-Monatsangaben speichern</Text>
      </Pressable>
      <Text testID="tariff-claims">
        {state.tariffAnnualClaims
          .map(
            (row) =>
              `${row.actualPayment?.grossCents ?? "estimated"}:${row.revision}:${row.revoked}`,
          )
          .join(",")}
      </Text>
      <Pressable
        onPress={() => void state.saveTariffAnnualClaim(tariffClaimInput).then(() => {}, onError)}
      >
        <Text>Tarifanspruch speichern</Text>
      </Pressable>
      <Pressable
        onPress={() => void state.revokeTariffAnnualClaim(tariffClaim).then(() => {}, onError)}
      >
        <Text>Tarifanspruch widerrufen</Text>
      </Pressable>
      <Text testID="annual-payments">
        {state.actualAnnualPayments
          .map(
            (record) => `${record.payment.grossCents}:${record.payment.revision}:${record.revoked}`,
          )
          .join(",")}
      </Text>
      <Pressable
        onPress={() => void state.saveActualAnnualPayment(annualInput).then(() => {}, onError)}
      >
        <Text>Sonderzahlung bestätigen</Text>
      </Pressable>
      <Pressable
        onPress={() => void state.revokeActualAnnualPayment(annualPayment).then(() => {}, onError)}
      >
        <Text>Bestätigung widerrufen</Text>
      </Pressable>
      <Text testID="paid-absences">
        {state.paidAbsences
          .map(
            (item) =>
              `${item.shiftId}:${item.revision}:${item.paidMinutes === null ? "cleared" : item.paidMinutes}`,
          )
          .join(",")}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => void state.savePaidAbsence(paidAbsenceInput).then(() => {}, onError)}
      >
        <Text>Abwesenheit speichern</Text>
      </Pressable>
      <Text testID="history-status">{history.status}</Text>
      <Text testID="overtime">
        {state.overtimeAllocations
          .map(
            (item) =>
              `${item.shiftId}:${item.revision}:${item.allocations === null ? "cleared" : item.shiftRevision}`,
          )
          .join(",")}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          void state.saveOvertimeAllocation(overtimeInput).then(onOvertimeSaved, onError)
        }
      >
        <Text>Überstunden speichern</Text>
      </Pressable>
      <Text testID="profiles">
        {state.profiles.map((p) => `${p.effectiveFrom ?? "undatiert"}:${p.revision}`).join(",")}
      </Text>
      <Text testID="allowances">
        {state.allowanceDecisions.map((item) => `${item.month}:${item.revision}`).join(",")}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          void state.saveAllowanceDecisions(allowanceInput).then(onAllowanceSaved, onError)
        }
      >
        <Text>Zulage speichern</Text>
      </Pressable>
      {state.error ? <Text>{state.error}</Text> : null}
      <Pressable accessibilityRole="button" onPress={() => void state.reload()}>
        <Text>Neu laden</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => void state.saveProfile(input).then(onSaved, onError)}
      >
        <Text>Speichern</Text>
      </Pressable>
    </>
  );
}

describe("remuneration provider", () => {
  it("reloads DRK training month answers after a committed write", async () => {
    const ports = createPorts();
    ports.repository.saveDrkTrainingMonthConfirmation.mockResolvedValue(
      drkTrainingMonthConfirmation,
    );
    const view = await render(
      <RemunerationProvider {...ports} reloadRevision={0}>
        <Harness />
      </RemunerationProvider>,
    );
    await waitFor(() => expect(view.getByTestId("status").props.children).toBe("ready"));
    ports.repository.loadSnapshot.mockResolvedValue({
      ...snapshot([baseline]),
      drkTrainingMonthConfirmations: [drkTrainingMonthConfirmation],
    });
    await fireEvent.press(view.getByText("DRK-Ausbildungsangaben speichern"));
    await waitFor(() =>
      expect(view.getByTestId("drk-training-month-confirmations").props.children).toBe("2026-10:1"),
    );
    expect(ports.repository.saveDrkTrainingMonthConfirmation).toHaveBeenCalledWith(
      drkTrainingInput,
    );
  });
  it("reloads DRK month answers after a committed write", async () => {
    const ports = createPorts();
    ports.repository.saveDrkEmployeeMonthConfirmation.mockResolvedValue(drkMonthConfirmation);
    const view = await render(
      <RemunerationProvider {...ports} reloadRevision={0}>
        <Harness />
      </RemunerationProvider>,
    );
    await waitFor(() => expect(view.getByTestId("status").props.children).toBe("ready"));
    ports.repository.loadSnapshot.mockResolvedValue({
      ...snapshot([baseline]),
      drkEmployeeMonthConfirmations: [drkMonthConfirmation],
    });
    await fireEvent.press(view.getByText("DRK-Monatsangaben speichern"));
    await waitFor(() =>
      expect(view.getByTestId("drk-month-confirmations").props.children).toBe("2026-10:1"),
    );
    expect(ports.repository.saveDrkEmployeeMonthConfirmation).toHaveBeenCalledWith(drkInput);
  });
  it("reloads Anlage-A premium facts after a committed write", async () => {
    const ports = createPorts();
    ports.repository.saveTvoedAnnexAPremiumFacts.mockResolvedValue(annexAPremiumFacts);
    const view = await render(
      <RemunerationProvider {...ports} reloadRevision={0}>
        <Harness />
      </RemunerationProvider>,
    );
    await waitFor(() => expect(view.getByTestId("status").props.children).toBe("ready"));
    ports.repository.loadSnapshot.mockResolvedValue({
      ...snapshot([baseline]),
      tvoedAnnexAPremiumFacts: [annexAPremiumFacts],
    });
    await fireEvent.press(view.getByText("EG-Zuschlagsangaben speichern"));
    await waitFor(() =>
      expect(view.getByTestId("annex-a-premium-facts").props.children).toBe("2026-09:1"),
    );
    expect(ports.repository.saveTvoedAnnexAPremiumFacts).toHaveBeenCalledWith(annexAPremiumInput);
  });
  it("reloads Anlage-A month answers after a committed write", async () => {
    const ports = createPorts();
    ports.repository.saveTvoedAnnexAMonthConfirmation.mockResolvedValue(annexAConfirmation);
    const view = await render(
      <RemunerationProvider {...ports} reloadRevision={0}>
        <Harness />
      </RemunerationProvider>,
    );
    await waitFor(() => expect(view.getByTestId("status").props.children).toBe("ready"));
    ports.repository.loadSnapshot.mockResolvedValue({
      ...snapshot([baseline]),
      tvoedAnnexAMonthConfirmations: [annexAConfirmation],
    });
    await fireEvent.press(view.getByText("EG-Monatsangaben speichern"));
    await waitFor(() =>
      expect(view.getByTestId("annex-a-confirmations").props.children).toBe("2026-09:1"),
    );
    expect(ports.repository.saveTvoedAnnexAMonthConfirmation).toHaveBeenCalledWith(annexAInput);
  });
  it("reloads SuE allowance answers after a committed write", async () => {
    const ports = createPorts();
    ports.repository.saveTvoedSueAllowanceConfirmation.mockResolvedValue(sueAllowanceConfirmation);
    const view = await render(
      <RemunerationProvider {...ports} reloadRevision={0}>
        <Harness />
      </RemunerationProvider>,
    );
    await waitFor(() => expect(view.getByTestId("status").props.children).toBe("ready"));
    ports.repository.loadSnapshot.mockResolvedValue({
      ...snapshot([baseline]),
      tvoedSueAllowanceConfirmations: [sueAllowanceConfirmation],
    });
    await fireEvent.press(view.getByText("SuE-Zulagenangaben speichern"));
    await waitFor(() =>
      expect(view.getByTestId("sue-allowance-confirmations").props.children).toBe("2026-09:1"),
    );
    expect(ports.repository.saveTvoedSueAllowanceConfirmation).toHaveBeenCalledWith(
      sueAllowanceInput,
    );
  });
  it("reloads Caritas month facts after a committed write", async () => {
    const ports = createPorts();
    ports.repository.saveCaritasMonthFacts.mockResolvedValue(caritasMonthFacts);
    const view = await render(
      <RemunerationProvider {...ports} reloadRevision={0}>
        <Harness />
      </RemunerationProvider>,
    );
    await waitFor(() => expect(view.getByTestId("status").props.children).toBe("ready"));
    ports.repository.loadSnapshot.mockResolvedValue({
      ...snapshot([baseline]),
      caritasMonthFacts: [caritasMonthFacts],
    });
    await fireEvent.press(view.getByText("Caritas-Monatsangaben speichern"));
    await waitFor(() =>
      expect(view.getByTestId("caritas-month-facts").props.children).toBe("2026-09:1"),
    );
    expect(ports.repository.saveCaritasMonthFacts).toHaveBeenCalledWith(caritasInput);
  });
  it.each([false, true])(
    "reloads the whole snapshot after a tariff claim write (revoked=%s)",
    async (revoked) => {
      const ports = createPorts();
      const pending = deferred<SavedTariffAnnualClaim>();
      const saved = {
        ...tariffClaim,
        revoked,
        revision: 2,
        actualPayment: { grossCents: 0, payoutMonth: "2027-01" },
      };
      const method = revoked
        ? ports.repository.revokeTariffAnnualClaim
        : ports.repository.saveTariffAnnualClaim;
      method.mockReturnValue(pending.promise);
      const view = await render(
        <RemunerationProvider {...ports} reloadRevision={0}>
          <Harness />
        </RemunerationProvider>,
      );
      await waitFor(() => expect(view.getByTestId("status").props.children).toBe("ready"));
      await fireEvent.press(
        view.getByText(revoked ? "Tarifanspruch widerrufen" : "Tarifanspruch speichern"),
      );
      expect(view.getByTestId("status").props.children).toBe("loading");
      ports.repository.loadSnapshot.mockResolvedValue(snapshot([dated], [], [], [], [], [saved]));
      await act(async () => pending.resolve(saved));
      await waitFor(() => expect(view.getByTestId("status").props.children).toBe("ready"));
      expect(view.getByTestId("tariff-claims").props.children).toBe(`0:2:${revoked}`);
      expect(view.getByTestId("profiles").props.children).toBe("2026-10-01:1");
      expect(method).toHaveBeenCalledWith(revoked ? tariffClaim : tariffClaimInput);
    },
  );

  it("invalidates tariff claims on restore and exposes changed same-revision contents", async () => {
    const ports = createPorts();
    ports.repository.loadSnapshot.mockResolvedValue(
      snapshot([baseline], [], [], [], [], [tariffClaim]),
    );
    const view = await render(
      <RemunerationProvider {...ports} reloadRevision={0}>
        <Harness />
      </RemunerationProvider>,
    );
    await waitFor(() =>
      expect(view.getByTestId("tariff-claims").props.children).toBe("87654:1:false"),
    );
    const pending = deferred<RemunerationSnapshot>();
    ports.repository.loadSnapshot.mockReturnValue(pending.promise);
    await view.rerender(
      <RemunerationProvider {...ports} reloadRevision={1}>
        <Harness />
      </RemunerationProvider>,
    );
    expect(view.getByTestId("status").props.children).toBe("loading");
    await act(async () =>
      pending.resolve(
        snapshot([baseline], [], [], [], [], [{ ...tariffClaim, actualPayment: null }]),
      ),
    );
    await waitFor(() =>
      expect(view.getByTestId("tariff-claims").props.children).toBe("estimated:1:false"),
    );
    expect(view.getByTestId("status").props.children).toBe("ready");
  });

  it("does not accept a stale tariff snapshot after a newer write", async () => {
    const ports = createPorts();
    const view = await render(
      <RemunerationProvider {...ports} reloadRevision={0}>
        <Harness />
      </RemunerationProvider>,
    );
    await waitFor(() => expect(view.getByTestId("status").props.children).toBe("ready"));
    const stale = deferred<RemunerationSnapshot>();
    ports.repository.loadSnapshot.mockReturnValueOnce(stale.promise);
    await fireEvent.press(view.getByText("Neu laden"));
    ports.repository.saveTariffAnnualClaim.mockResolvedValue(tariffClaim);
    ports.repository.loadSnapshot.mockResolvedValue(
      snapshot([baseline], [], [], [], [], [tariffClaim]),
    );
    await fireEvent.press(view.getByText("Tarifanspruch speichern"));
    await waitFor(() =>
      expect(view.getByTestId("tariff-claims").props.children).toBe("87654:1:false"),
    );
    await act(async () => stale.resolve(snapshot([baseline])));
    expect(view.getByTestId("tariff-claims").props.children).toBe("87654:1:false");
    expect(view.getByTestId("status").props.children).toBe("ready");
  });

  it("waits for all pending tariff writes before reloading and ignores a mid-write reload", async () => {
    const ports = createPorts();
    const first = deferred<SavedTariffAnnualClaim>();
    const second = deferred<SavedTariffAnnualClaim>();
    ports.repository.saveTariffAnnualClaim.mockReturnValue(first.promise);
    ports.repository.revokeTariffAnnualClaim.mockReturnValue(second.promise);
    const view = await render(
      <RemunerationProvider {...ports} reloadRevision={0}>
        <Harness />
      </RemunerationProvider>,
    );
    await waitFor(() => expect(view.getByTestId("status").props.children).toBe("ready"));
    const reads = ports.repository.loadSnapshot.mock.calls.length;
    await fireEvent.press(view.getByText("Tarifanspruch speichern"));
    await fireEvent.press(view.getByText("Tarifanspruch widerrufen"));
    await fireEvent.press(view.getByText("Neu laden"));
    expect(ports.repository.loadSnapshot).toHaveBeenCalledTimes(reads);
    await act(async () => first.resolve(tariffClaim));
    expect(view.getByTestId("status").props.children).toBe("loading");
    expect(ports.repository.loadSnapshot).toHaveBeenCalledTimes(reads);
    const revoked = { ...tariffClaim, revision: 2, revoked: true };
    ports.repository.loadSnapshot.mockResolvedValue(
      snapshot([baseline], [], [], [], [], [revoked]),
    );
    await act(async () => second.resolve(revoked));
    await waitFor(() => expect(view.getByTestId("status").props.children).toBe("ready"));
    expect(ports.repository.loadSnapshot).toHaveBeenCalledTimes(reads + 1);
    expect(view.getByTestId("tariff-claims").props.children).toBe("87654:2:true");
  });

  it("keeps a committed tariff write successful while a failed refresh blocks calculations and redacts diagnostics", async () => {
    const ports = createPorts();
    const onError = jest.fn();
    const view = await render(
      <RemunerationProvider {...ports} reloadRevision={0}>
        <Harness onError={onError} />
      </RemunerationProvider>,
    );
    await waitFor(() => expect(view.getByTestId("status").props.children).toBe("ready"));
    ports.repository.saveTariffAnnualClaim.mockResolvedValue(tariffClaim);
    ports.repository.loadSnapshot.mockRejectedValueOnce(new Error("private claim 87654"));
    await fireEvent.press(view.getByText("Tarifanspruch speichern"));
    await waitFor(() => expect(view.getByTestId("status").props.children).toBe("error"));
    expect(onError).not.toHaveBeenCalled();
    expect(JSON.stringify(ports.diagnostics.record.mock.calls)).not.toContain("87654");
    ports.repository.loadSnapshot.mockResolvedValue(
      snapshot([baseline], [], [], [], [], [tariffClaim]),
    );
    await fireEvent.press(view.getByText("Neu laden"));
    await waitFor(() =>
      expect(view.getByTestId("tariff-claims").props.children).toBe("87654:1:false"),
    );
  });

  it("reports a rejected tariff write and reloads the unchanged committed state", async () => {
    const ports = createPorts();
    ports.repository.loadSnapshot.mockResolvedValue(
      snapshot([baseline], [], [], [], [], [tariffClaim]),
    );
    const onError = jest.fn();
    const view = await render(
      <RemunerationProvider {...ports} reloadRevision={0}>
        <Harness onError={onError} />
      </RemunerationProvider>,
    );
    await waitFor(() => expect(view.getByTestId("status").props.children).toBe("ready"));
    const error = new Error("stale claim");
    ports.repository.revokeTariffAnnualClaim.mockRejectedValueOnce(error);
    await fireEvent.press(view.getByText("Tarifanspruch widerrufen"));
    await waitFor(() => expect(onError).toHaveBeenCalledWith(error));
    expect(view.getByTestId("status").props.children).toBe("ready");
    expect(view.getByTestId("tariff-claims").props.children).toBe("87654:1:false");
  });

  it("does not expose a late tariff write from a replaced database context", async () => {
    const old = createPorts();
    const fresh = createPorts();
    const pending = deferred<SavedTariffAnnualClaim>();
    old.repository.saveTariffAnnualClaim.mockReturnValue(pending.promise);
    const view = await render(
      <RemunerationProvider {...old} reloadRevision={0}>
        <Harness />
      </RemunerationProvider>,
    );
    await waitFor(() => expect(view.getByTestId("status").props.children).toBe("ready"));
    await fireEvent.press(view.getByText("Tarifanspruch speichern"));
    await view.rerender(
      <RemunerationProvider {...fresh} reloadRevision={0}>
        <Harness />
      </RemunerationProvider>,
    );
    await waitFor(() => expect(view.getByTestId("status").props.children).toBe("ready"));
    await act(async () => pending.resolve(tariffClaim));
    expect(view.getByTestId("tariff-claims").props.children).toBe("");
    expect(old.repository.loadSnapshot).toHaveBeenCalledTimes(1);
    expect(fresh.repository.loadSnapshot).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])(
    "reloads the complete snapshot after annual payment write (revoked=%s)",
    async (revoked) => {
      const ports = createPorts();
      const saved = {
        ...annualPayment,
        revoked,
        payment: { ...annualPayment.payment, revision: 2, grossCents: 0 },
      };
      const pending = deferred<SavedActualOwnAnnualPayment>();
      const method = revoked
        ? ports.repository.revokeActualAnnualPayment
        : ports.repository.saveActualAnnualPayment;
      method.mockReturnValue(pending.promise);
      const view = await render(
        <RemunerationProvider {...ports} reloadRevision={0}>
          <Harness />
        </RemunerationProvider>,
      );
      await waitFor(() => expect(view.getByTestId("status").props.children).toBe("ready"));
      await fireEvent.press(
        view.getByText(revoked ? "Bestätigung widerrufen" : "Sonderzahlung bestätigen"),
      );
      expect(view.getByTestId("status").props.children).toBe("loading");
      ports.repository.loadSnapshot.mockResolvedValue(snapshot([baseline], [], [], [], [saved]));
      await act(async () => pending.resolve(saved));
      await waitFor(() => expect(view.getByTestId("status").props.children).toBe("ready"));
      expect(view.getByTestId("annual-payments").props.children).toBe(`0:2:${revoked}`);
      expect(method).toHaveBeenCalledWith(revoked ? annualPayment : annualInput);
    },
  );

  it("invalidates confirmed payments during restore and exposes changed same-revision contents", async () => {
    const ports = createPorts();
    ports.repository.loadSnapshot.mockResolvedValue(
      snapshot([baseline], [], [], [], [annualPayment]),
    );
    const view = await render(
      <RemunerationProvider {...ports} reloadRevision={0}>
        <Harness />
      </RemunerationProvider>,
    );
    await waitFor(() =>
      expect(view.getByTestId("annual-payments").props.children).toBe("54321:1:false"),
    );
    const pending = deferred<RemunerationSnapshot>();
    ports.repository.loadSnapshot.mockReturnValue(pending.promise);
    await view.rerender(
      <RemunerationProvider {...ports} reloadRevision={1}>
        <Harness />
      </RemunerationProvider>,
    );
    expect(view.getByTestId("status").props.children).toBe("loading");
    await act(async () =>
      pending.resolve(
        snapshot(
          [baseline],
          [],
          [],
          [],
          [{ ...annualPayment, payment: { ...annualPayment.payment, grossCents: 12345 } }],
        ),
      ),
    );
    await waitFor(() =>
      expect(view.getByTestId("annual-payments").props.children).toBe("12345:1:false"),
    );
  });

  it("does not turn a committed confirmation with failed refresh into a failed write or ready calculation", async () => {
    const ports = createPorts();
    const onError = jest.fn();
    const view = await render(
      <RemunerationProvider {...ports} reloadRevision={0}>
        <Harness onError={onError} />
      </RemunerationProvider>,
    );
    await waitFor(() => expect(view.getByTestId("status").props.children).toBe("ready"));
    ports.repository.saveActualAnnualPayment.mockResolvedValue(annualPayment);
    ports.repository.loadSnapshot.mockRejectedValueOnce(new Error("private annual payment 54321"));
    await fireEvent.press(view.getByText("Sonderzahlung bestätigen"));
    await waitFor(() => expect(view.getByTestId("status").props.children).toBe("error"));
    expect(onError).not.toHaveBeenCalled();
    expect(JSON.stringify(ports.diagnostics.record.mock.calls)).not.toContain("54321");
    ports.repository.loadSnapshot.mockResolvedValue(
      snapshot([baseline], [], [], [], [annualPayment]),
    );
    await fireEvent.press(view.getByText("Neu laden"));
    await waitFor(() =>
      expect(view.getByTestId("annual-payments").props.children).toBe("54321:1:false"),
    );
  });
  it("reloads paid absence writes, zero and revocation through the complete snapshot", async () => {
    const ports = createPorts();
    const view = await render(
      <RemunerationProvider {...ports} reloadRevision={0}>
        <Harness />
      </RemunerationProvider>,
    );
    await waitFor(() => expect(view.getByTestId("status").props.children).toBe("ready"));
    for (const minutes of [462, 0, null]) {
      const value = { ...paidAbsence, paidMinutes: minutes };
      ports.repository.savePaidAbsence.mockResolvedValue(value);
      ports.repository.loadSnapshot.mockResolvedValue(snapshot([baseline], [], [], [value]));
      await fireEvent.press(view.getByText("Abwesenheit speichern"));
      await waitFor(() =>
        expect(view.getByTestId("paid-absences").props.children).toBe(
          `absence-1:1:${minutes === null ? "cleared" : minutes}`,
        ),
      );
    }
    expect(ports.repository.savePaidAbsence).toHaveBeenCalledWith(paidAbsenceInput);
  });
  it("keeps a failed paid absence refresh unavailable without logging personal values", async () => {
    const ports = createPorts();
    const onError = jest.fn();
    const view = await render(
      <RemunerationProvider {...ports} reloadRevision={0}>
        <Harness onError={onError} />
      </RemunerationProvider>,
    );
    await waitFor(() => expect(view.getByTestId("status").props.children).toBe("ready"));
    ports.repository.loadSnapshot.mockRejectedValueOnce(new Error("private 462 minute details"));
    await fireEvent.press(view.getByText("Abwesenheit speichern"));
    await waitFor(() => expect(view.getByTestId("status").props.children).toBe("error"));
    expect(onError).not.toHaveBeenCalled();
    expect(ports.diagnostics.record).toHaveBeenCalledWith(
      "provider",
      "REMUNERATION_LOAD_FAILED",
      expect.objectContaining({ message: REMUNERATION_LOAD_FAILURE_MESSAGE }),
    );
  });
  it("keeps a committed overtime write successful when refresh fails and refreshes after conflict", async () => {
    const ports = createPorts();
    ports.repository.loadSnapshot.mockResolvedValue(snapshot([dated], [], [overtime]));
    const saved = jest.fn();
    const failed = jest.fn();
    const view = await render(
      <RemunerationProvider {...ports} reloadRevision={0}>
        <Harness onOvertimeSaved={saved} onError={failed} />
      </RemunerationProvider>,
    );
    await waitFor(() => expect(view.getByTestId("status").props.children).toBe("ready"));
    ports.repository.loadSnapshot.mockRejectedValueOnce(new Error("private overtime JSON"));
    await fireEvent.press(view.getByText("Überstunden speichern"));
    await waitFor(() => expect(saved).toHaveBeenCalledWith(overtime));
    expect(failed).not.toHaveBeenCalled();
    expect(view.getByTestId("status").props.children).toBe("error");
    expect(view.getByTestId("history-status").props.children).toBe("error");
    expect(view.getByTestId("overtime").props.children).toBe("shift-1:2:3");
    expect(ports.diagnostics.record).toHaveBeenCalledWith(
      "provider",
      "REMUNERATION_LOAD_FAILED",
      expect.objectContaining({ message: REMUNERATION_LOAD_FAILURE_MESSAGE }),
    );
    const conflict = new Error("Revision conflict");
    ports.repository.saveOvertimeAllocation.mockRejectedValueOnce(conflict);
    ports.repository.loadSnapshot.mockResolvedValue(
      snapshot([dated], [], [{ ...overtime, revision: 3, allocations: null }]),
    );
    await fireEvent.press(view.getByText("Überstunden speichern"));
    await waitFor(() => expect(failed).toHaveBeenCalledWith(conflict));
    expect(saved).toHaveBeenCalledTimes(1);
    expect(view.getByTestId("status").props.children).toBe("ready");
    expect(view.getByTestId("overtime").props.children).toBe("shift-1:3:cleared");
  });

  it.each(["replace", "unmount"] as const)(
    "ignores old overtime reads and writes after %s",
    async (mode) => {
      const old = createPorts();
      const next = createPorts();
      const read = deferred<RemunerationSnapshot>();
      const write = deferred<SavedOvertimeAllocation>();
      old.repository.loadSnapshot.mockImplementationOnce(() => read.promise);
      old.repository.saveOvertimeAllocation.mockImplementationOnce(() => write.promise);
      const view = await render(
        <RemunerationProvider {...old} reloadRevision={0}>
          <Harness />
        </RemunerationProvider>,
      );
      await fireEvent.press(view.getByText("Überstunden speichern"));
      if (mode === "replace") {
        await view.rerender(
          <RemunerationProvider {...next} reloadRevision={0}>
            <Harness />
          </RemunerationProvider>,
        );
        await waitFor(() => expect(view.getByTestId("status").props.children).toBe("ready"));
      } else {
        await view.unmount();
      }
      await act(async () => {
        read.reject(new Error("private old overtime data"));
        write.resolve(overtime);
      });
      expect(old.repository.loadSnapshot).toHaveBeenCalledTimes(1);
      expect(old.diagnostics.record).not.toHaveBeenCalled();
      if (mode === "replace") {
        expect(next.repository.loadSnapshot).toHaveBeenCalledTimes(1);
        expect(view.getByTestId("overtime").props.children).toBe("");
      }
    },
  );

  it("rejects a stale read after overtime commit and stays incomplete during restore reload", async () => {
    const ports = createPorts();
    const oldRead = deferred<RemunerationSnapshot>();
    const write = deferred<SavedOvertimeAllocation>();
    const freshRead = deferred<RemunerationSnapshot>();
    ports.repository.loadSnapshot
      .mockImplementationOnce(() => oldRead.promise)
      .mockImplementationOnce(() => freshRead.promise);
    ports.repository.saveOvertimeAllocation.mockImplementationOnce(() => write.promise);
    const saved = jest.fn();
    const view = await render(
      <RemunerationProvider {...ports} reloadRevision={0}>
        <Harness onOvertimeSaved={saved} />
      </RemunerationProvider>,
    );
    await fireEvent.press(view.getByText("Überstunden speichern"));
    await view.rerender(
      <RemunerationProvider {...ports} reloadRevision={1}>
        <Harness onOvertimeSaved={saved} />
      </RemunerationProvider>,
    );
    await act(async () => write.resolve(overtime));
    expect(view.getByTestId("status").props.children).toBe("loading");
    expect(view.getByTestId("history-status").props.children).toBe("loading");
    expect(ports.repository.loadSnapshot).toHaveBeenCalledTimes(2);
    await act(async () => freshRead.resolve(snapshot([dated], [allowanceMonth], [overtime])));
    await waitFor(() => expect(saved).toHaveBeenCalledWith(overtime));
    await act(async () => oldRead.resolve(snapshot([])));
    expect(view.getByTestId("status").props.children).toBe("ready");
    expect(view.getByTestId("profiles").props.children).toBe("2026-10-01:1");
    expect(view.getByTestId("allowances").props.children).toBe("2026-09:2");
    expect(view.getByTestId("overtime").props.children).toBe("shift-1:2:3");
  });

  it("loads confirmations atomically with profiles and replaces them after a restore reload", async () => {
    const ports = createPorts();
    ports.repository.loadSnapshot.mockResolvedValue(
      snapshot(
        [dated],
        [allowanceMonth],
        [overtime, { ...overtime, shiftId: "cleared", allocations: null }],
      ),
    );
    const view = await render(
      <RemunerationProvider {...ports} reloadRevision={0}>
        <Harness />
      </RemunerationProvider>,
    );
    await waitFor(() => expect(view.getByTestId("status").props.children).toBe("ready"));
    expect(view.getByTestId("allowances").props.children).toBe("2026-09:2");
    expect(view.getByTestId("overtime").props.children).toBe("shift-1:2:3,cleared:2:cleared");
    const pending = deferred<RemunerationSnapshot>();
    ports.repository.loadSnapshot.mockImplementationOnce(() => pending.promise);
    await view.rerender(
      <RemunerationProvider {...ports} reloadRevision={1}>
        <Harness />
      </RemunerationProvider>,
    );
    expect(view.getByTestId("status").props.children).toBe("loading");
    await act(async () => pending.resolve(snapshot([baseline])));
    expect(view.getByTestId("allowances").props.children).toBe("");
    expect(view.getByTestId("overtime").props.children).toBe("");
    expect(view.getByTestId("profiles").props.children).toBe("undatiert:1");
  });

  it("waits for profile, allowance and overtime writes before refreshing all three datasets", async () => {
    const ports = createPorts();
    const profileWrite = deferred<DatedRemunerationProfile>();
    const allowanceWrite = deferred<MonthlyAllowanceDecisions>();
    const overtimeWrite = deferred<SavedOvertimeAllocation>();
    ports.repository.saveOvertimeAllocation.mockImplementationOnce(() => overtimeWrite.promise);
    ports.repository.saveProfile.mockImplementationOnce(() => profileWrite.promise);
    ports.repository.saveAllowanceDecisions.mockImplementationOnce(() => allowanceWrite.promise);
    const saved = jest.fn();
    const view = await render(
      <RemunerationProvider {...ports} reloadRevision={0}>
        <Harness onAllowanceSaved={saved} />
      </RemunerationProvider>,
    );
    await waitFor(() => expect(view.getByTestId("status").props.children).toBe("ready"));
    await fireEvent.press(view.getByText("Speichern"));
    await fireEvent.press(view.getByText("Zulage speichern"));
    await fireEvent.press(view.getByText("Überstunden speichern"));
    await fireEvent.press(view.getByText("Neu laden"));
    await act(async () => allowanceWrite.resolve(allowanceMonth));
    expect(ports.repository.saveAllowanceDecisions).toHaveBeenCalledWith(allowanceInput);
    expect(saved).toHaveBeenCalledWith(allowanceMonth);
    expect(view.getByTestId("status").props.children).toBe("loading");
    expect(ports.repository.loadSnapshot).toHaveBeenCalledTimes(1);
    await act(async () => profileWrite.resolve(dated));
    expect(view.getByTestId("status").props.children).toBe("loading");
    expect(view.getByTestId("history-status").props.children).toBe("loading");
    expect(ports.repository.loadSnapshot).toHaveBeenCalledTimes(1);
    ports.repository.loadSnapshot.mockResolvedValue(
      snapshot([dated], [allowanceMonth], [overtime]),
    );
    await act(async () => overtimeWrite.resolve(overtime));
    expect(ports.repository.loadSnapshot).toHaveBeenCalledTimes(2);
    expect(view.getByTestId("allowances").props.children).toBe("2026-09:2");
    expect(view.getByTestId("profiles").props.children).toBe("2026-10-01:1");
    expect(view.getByTestId("overtime").props.children).toBe("shift-1:2:3");
    expect(ports.repository.saveOvertimeAllocation).toHaveBeenCalledWith(overtimeInput);
  });

  it("reports a saved confirmation separately from a failed refresh and recovers after a conflict", async () => {
    const ports = createPorts();
    const saved = jest.fn();
    const failed = jest.fn();
    const view = await render(
      <RemunerationProvider {...ports} reloadRevision={0}>
        <Harness onAllowanceSaved={saved} onError={failed} />
      </RemunerationProvider>,
    );
    await waitFor(() => expect(view.getByTestId("status").props.children).toBe("ready"));
    ports.repository.loadSnapshot.mockRejectedValueOnce(new Error("private decision data"));
    await fireEvent.press(view.getByText("Zulage speichern"));
    await waitFor(() => expect(saved).toHaveBeenCalledWith(allowanceMonth));
    expect(failed).not.toHaveBeenCalled();
    expect(view.getByTestId("status").props.children).toBe("error");
    expect(ports.diagnostics.record).toHaveBeenCalledWith(
      "provider",
      "REMUNERATION_LOAD_FAILED",
      expect.objectContaining({ message: REMUNERATION_LOAD_FAILURE_MESSAGE }),
    );
    const conflict = new Error("Revision conflict");
    ports.repository.saveAllowanceDecisions.mockRejectedValueOnce(conflict);
    ports.repository.loadSnapshot.mockResolvedValue(snapshot([dated], [allowanceMonth]));
    await fireEvent.press(view.getByText("Zulage speichern"));
    await waitFor(() => expect(failed).toHaveBeenCalledWith(conflict));
    expect(saved).toHaveBeenCalledTimes(1);
    expect(view.getByTestId("status").props.children).toBe("ready");
    expect(view.getByTestId("allowances").props.children).toBe("2026-09:2");
  });

  it("ignores a pending confirmation write from a replaced repository", async () => {
    const old = createPorts();
    const next = createPorts();
    const write = deferred<MonthlyAllowanceDecisions>();
    old.repository.saveAllowanceDecisions.mockImplementationOnce(() => write.promise);
    next.repository.loadSnapshot.mockResolvedValue(snapshot([], []));
    const view = await render(
      <RemunerationProvider {...old} reloadRevision={0}>
        <Harness />
      </RemunerationProvider>,
    );
    await waitFor(() => expect(view.getByTestId("status").props.children).toBe("ready"));
    await fireEvent.press(view.getByText("Zulage speichern"));
    await view.rerender(
      <RemunerationProvider {...next} reloadRevision={0}>
        <Harness />
      </RemunerationProvider>,
    );
    await waitFor(() => expect(view.getByTestId("status").props.children).toBe("ready"));
    await act(async () => write.resolve(allowanceMonth));
    expect(view.getByTestId("allowances").props.children).toBe("");
    expect(next.repository.loadSnapshot).toHaveBeenCalledTimes(1);
    expect(old.repository.loadSnapshot).toHaveBeenCalledTimes(1);
  });

  it("loads history on mount, reload token and remount, including a successful empty state", async () => {
    const ports = createPorts();
    const view = await render(
      <RemunerationProvider {...ports} reloadRevision={0}>
        <Harness />
      </RemunerationProvider>,
    );
    await waitFor(() => expect(view.getByTestId("status").props.children).toBe("ready"));
    expect(view.getByTestId("profiles").props.children).toBe("undatiert:1");
    ports.repository.loadSnapshot.mockResolvedValue(snapshot([baseline, dated]));
    await view.rerender(
      <RemunerationProvider {...ports} reloadRevision={1}>
        <Harness />
      </RemunerationProvider>,
    );
    await waitFor(() =>
      expect(view.getByTestId("profiles").props.children).toContain("2026-10-01"),
    );
    await view.unmount();
    ports.repository.loadSnapshot.mockResolvedValue(snapshot([]));
    const empty = await render(
      <RemunerationProvider {...ports} reloadRevision={0}>
        <Harness />
      </RemunerationProvider>,
    );
    await waitFor(() => expect(empty.getByTestId("status").props.children).toBe("ready"));
    expect(empty.getByTestId("profiles").props.children).toBe("");
  });

  it("exposes failed reads as errors, preserves last known data and never logs personal parser text", async () => {
    const ports = createPorts();
    const view = await render(
      <RemunerationProvider {...ports} reloadRevision={0}>
        <Harness />
      </RemunerationProvider>,
    );
    await waitFor(() => expect(view.getByTestId("status").props.children).toBe("ready"));
    ports.repository.loadSnapshot.mockRejectedValueOnce(
      new Error('Invalid JSON: {"salary":123456}'),
    );
    await fireEvent.press(view.getByText("Neu laden"));
    await waitFor(() => expect(view.getByText(REMUNERATION_LOAD_FAILURE_MESSAGE)).toBeTruthy());
    expect(view.getByTestId("status").props.children).toBe("error");
    expect(view.getByTestId("profiles").props.children).toBe("undatiert:1");
    expect(ports.diagnostics.record).toHaveBeenCalledWith(
      "provider",
      "REMUNERATION_LOAD_FAILED",
      expect.objectContaining({ message: REMUNERATION_LOAD_FAILURE_MESSAGE }),
    );
    await fireEvent.press(view.getByText("Neu laden"));
    await waitFor(() => expect(view.getByTestId("status").props.children).toBe("ready"));
  });

  it("does not let an older in-flight read replace committed history", async () => {
    const ports = createPorts();
    const stale = deferred<RemunerationSnapshot>();
    ports.repository.loadSnapshot
      .mockImplementationOnce(() => stale.promise)
      .mockResolvedValue(snapshot([baseline, dated]));
    const saved = jest.fn();
    const view = await render(
      <RemunerationProvider {...ports} reloadRevision={0}>
        <Harness onSaved={saved} />
      </RemunerationProvider>,
    );
    await fireEvent.press(view.getByText("Speichern"));
    await waitFor(() => expect(saved).toHaveBeenCalledWith(dated));
    expect(ports.repository.saveProfile).toHaveBeenCalledWith(input);
    await act(async () => stale.resolve(snapshot([])));
    expect(view.getByTestId("profiles").props.children).toContain("2026-10-01");
  });

  it("reloads only after the last overlapping writer, including a manual refresh while saving", async () => {
    const ports = createPorts();
    const first = deferred<DatedRemunerationProfile>();
    const second = deferred<DatedRemunerationProfile>();
    ports.repository.saveProfile
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const view = await render(
      <RemunerationProvider {...ports} reloadRevision={0}>
        <Harness />
      </RemunerationProvider>,
    );
    await waitFor(() => expect(view.getByTestId("status").props.children).toBe("ready"));
    await fireEvent.press(view.getByText("Speichern"));
    await fireEvent.press(view.getByText("Speichern"));
    await fireEvent.press(view.getByText("Neu laden"));
    await act(async () => first.resolve(dated));
    expect(view.getByTestId("status").props.children).toBe("loading");
    expect(ports.repository.loadSnapshot).toHaveBeenCalledTimes(1);
    ports.repository.loadSnapshot.mockResolvedValue(
      snapshot([baseline, { ...dated, revision: 2 }]),
    );
    await act(async () => second.resolve({ ...dated, revision: 2 }));
    await waitFor(() => expect(view.getByTestId("status").props.children).toBe("ready"));
    expect(ports.repository.loadSnapshot).toHaveBeenCalledTimes(2);
    expect(view.getByTestId("profiles").props.children).toContain("2026-10-01:2");
  });

  it("distinguishes a committed write with failed refresh from a failed write", async () => {
    const ports = createPorts();
    const saved = jest.fn();
    const failed = jest.fn();
    const view = await render(
      <RemunerationProvider {...ports} reloadRevision={0}>
        <Harness onSaved={saved} onError={failed} />
      </RemunerationProvider>,
    );
    await waitFor(() => expect(view.getByTestId("status").props.children).toBe("ready"));
    ports.repository.loadSnapshot.mockRejectedValueOnce(new Error("read failure"));
    await fireEvent.press(view.getByText("Speichern"));
    await waitFor(() => expect(saved).toHaveBeenCalledWith(dated));
    expect(failed).not.toHaveBeenCalled();
    expect(view.getByTestId("status").props.children).toBe("error");
    const conflict = new Error("Revision conflict");
    ports.repository.saveProfile.mockRejectedValueOnce(conflict);
    await fireEvent.press(view.getByText("Speichern"));
    await waitFor(() => expect(failed).toHaveBeenCalledWith(conflict));
    expect(saved).toHaveBeenCalledTimes(1);
    expect(view.getByTestId("status").props.children).toBe("ready");
  });

  it("ignores old repository responses and pending writes after a source change", async () => {
    const old = createPorts();
    const next = createPorts();
    const oldRead = deferred<RemunerationSnapshot>();
    const oldWrite = deferred<DatedRemunerationProfile>();
    old.repository.loadSnapshot.mockImplementationOnce(() => oldRead.promise);
    old.repository.saveProfile.mockImplementationOnce(() => oldWrite.promise);
    next.repository.loadSnapshot.mockResolvedValue(snapshot([]));
    const view = await render(
      <RemunerationProvider {...old} reloadRevision={0}>
        <Harness />
      </RemunerationProvider>,
    );
    await fireEvent.press(view.getByText("Speichern"));
    await view.rerender(
      <RemunerationProvider {...next} reloadRevision={0}>
        <Harness />
      </RemunerationProvider>,
    );
    await waitFor(() => expect(view.getByTestId("status").props.children).toBe("ready"));
    await act(async () => {
      oldRead.resolve(snapshot([baseline]));
      oldWrite.resolve(dated);
    });
    expect(view.getByTestId("profiles").props.children).toBe("");
    expect(old.repository.loadSnapshot).toHaveBeenCalledTimes(1);
    expect(next.repository.loadSnapshot).toHaveBeenCalledTimes(1);
  });

  it("does not reload or publish diagnostics for late responses after unmount", async () => {
    const ports = createPorts();
    const pendingRead = deferred<RemunerationSnapshot>();
    const pendingWrite = deferred<DatedRemunerationProfile>();
    ports.repository.loadSnapshot.mockImplementationOnce(() => pendingRead.promise);
    ports.repository.saveProfile.mockImplementationOnce(() => pendingWrite.promise);
    const view = await render(
      <RemunerationProvider {...ports} reloadRevision={0}>
        <Harness />
      </RemunerationProvider>,
    );
    await fireEvent.press(view.getByText("Speichern"));
    await view.unmount();
    await act(async () => {
      pendingRead.reject(new Error("late"));
      pendingWrite.resolve(dated);
    });
    expect(ports.repository.loadSnapshot).toHaveBeenCalledTimes(1);
    expect(ports.diagnostics.record).not.toHaveBeenCalled();
  });

  it("keeps a reload revision calculation-incomplete until an in-flight write and fresh read finish", async () => {
    const ports = createPorts();
    const pendingWrite = deferred<DatedRemunerationProfile>();
    ports.repository.saveProfile.mockImplementationOnce(() => pendingWrite.promise);
    const view = await render(
      <RemunerationProvider {...ports} reloadRevision={0}>
        <Harness />
      </RemunerationProvider>,
    );
    await waitFor(() => expect(view.getByTestId("status").props.children).toBe("ready"));
    await fireEvent.press(view.getByText("Speichern"));
    await view.rerender(
      <RemunerationProvider {...ports} reloadRevision={1}>
        <Harness />
      </RemunerationProvider>,
    );
    expect(view.getByTestId("status").props.children).toBe("loading");
    expect(ports.repository.loadSnapshot).toHaveBeenCalledTimes(1);
    ports.repository.loadSnapshot.mockResolvedValue(snapshot([baseline, dated]));
    await act(async () => pendingWrite.resolve(dated));
    await waitFor(() => expect(view.getByTestId("status").props.children).toBe("ready"));
    expect(view.getByTestId("profiles").props.children).toContain("2026-10-01");
  });
});
