import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import type { RemunerationRepositoryPort, RemunerationSnapshot } from "./pflegeshift-ports";
import { RemunerationProvider, useRemunerationData } from "./remuneration-provider";
import { tvlFact, tvlProfile, tvlSaturday } from "@/engine/tvl-shift-work-test-fixtures";
import type { SavedTvlShiftWork, SaveTvlShiftWorkInput } from "@/domain/saved-tvl-shift-work";

const unexpected = async (): Promise<never> => {
  throw new Error("Unexpected write");
};
const snapshot = (tvlShiftWork: readonly SavedTvlShiftWork[]): RemunerationSnapshot => ({
  drkEmployeeMonthConfirmations: [],
  drkTrainingMonthConfirmations: [],
  caritasMonthFacts: [],
  tvoedAnnexAMonthConfirmations: [],
  tvoedAnnexAPremiumFacts: [],
  tvoedSueMonthConfirmations: [],
  tvoedSueAllowanceConfirmations: [],
  profiles: [tvlProfile()],
  tvlShiftWork,
  allowanceDecisions: [],
  overtimeAllocations: [],
  paidAbsences: [],
  actualAnnualPayments: [],
  tariffAnnualClaims: [],
});
const input = (shiftWork: boolean | null): SaveTvlShiftWorkInput => ({
  shiftId: tvlSaturday.id,
  expectedShiftRevision: tvlSaturday.revision,
  expectedShiftUpdatedAt: tvlSaturday.updatedAt,
  timeZone: "Europe/Berlin",
  profileEffectiveFrom: tvlProfile().effectiveFrom!,
  expectedProfileRevision: 1,
  expectedRevision: 1,
  shiftWork,
});
function setup() {
  const loadSnapshot = jest
    .fn<RemunerationRepositoryPort["loadSnapshot"]>()
    .mockResolvedValue(snapshot([tvlFact(true)]));
  const saveTvlShiftWork = jest.fn<RemunerationRepositoryPort["saveTvlShiftWork"]>();
  const repository: RemunerationRepositoryPort = {
    saveDrkEmployeeMonthConfirmation: unexpected,
    saveDrkTrainingMonthConfirmation: unexpected,
    saveCaritasMonthFacts: unexpected,
    saveTvoedAnnexAMonthConfirmation: unexpected,
    saveTvoedAnnexAPremiumFacts: unexpected,
    saveTvoedSueMonthConfirmation: unexpected,
    saveTvoedSueAllowanceConfirmation: unexpected,
    loadSnapshot,
    saveTvlShiftWork,
    saveProfile: unexpected,
    saveAllowanceDecisions: unexpected,
    saveOvertimeAllocation: unexpected,
    savePaidAbsence: unexpected,
    saveActualAnnualPayment: unexpected,
    revokeActualAnnualPayment: unexpected,
    saveTariffAnnualClaim: unexpected,
    revokeTariffAnnualClaim: unexpected,
  };
  const diagnostics = { record: jest.fn() };
  return { repository, diagnostics, loadSnapshot, saveTvlShiftWork };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
describe("TV-L shared provider lifecycle", () => {
  it.each([true, false, null])("reloads the complete snapshot after saving %s", async (value) => {
    const f = setup();
    const pending = deferred<SavedTvlShiftWork>();
    f.saveTvlShiftWork.mockReturnValue(pending.promise);
    const screen = await renderHook(() => useRemunerationData(), {
      wrapper: ({ children }) => (
        <RemunerationProvider {...f} reloadRevision={0}>
          {children}
        </RemunerationProvider>
      ),
    });
    await waitFor(() => expect(screen.result.current.status).toBe("ready"));
    let saving!: Promise<SavedTvlShiftWork>;
    await act(async () => {
      saving = screen.result.current.saveTvlShiftWork(input(value));
    });
    expect(screen.result.current.status).toBe("loading");
    const saved = { ...tvlFact(value), revision: 2 };
    f.loadSnapshot.mockResolvedValue(snapshot([saved]));
    await act(async () => {
      pending.resolve(saved);
      await saving;
    });
    expect(screen.result.current.status).toBe("ready");
    expect(screen.result.current.tvlShiftWork).toEqual([saved]);
    expect(f.saveTvlShiftWork).toHaveBeenCalledWith(input(value));
    expect(f.loadSnapshot).toHaveBeenCalledTimes(2);
  });
  it("exposes a read error after a committed write without falsely reporting a failed save", async () => {
    const f = setup();
    const saved = tvlFact(false);
    f.saveTvlShiftWork.mockResolvedValue(saved);
    const screen = await renderHook(() => useRemunerationData(), {
      wrapper: ({ children }) => (
        <RemunerationProvider {...f} reloadRevision={0}>
          {children}
        </RemunerationProvider>
      ),
    });
    await waitFor(() => expect(screen.result.current.status).toBe("ready"));
    f.loadSnapshot.mockRejectedValue(new Error("personal data must not be logged"));
    await act(async () => {
      await expect(screen.result.current.saveTvlShiftWork(input(false))).resolves.toEqual(saved);
    });
    expect(screen.result.current.status).toBe("error");
    expect(JSON.stringify(f.diagnostics.record.mock.calls)).not.toContain("personal data");
    f.loadSnapshot.mockResolvedValue(snapshot([saved]));
    await act(async () => {
      await screen.result.current.reload();
    });
    expect(screen.result.current.tvlShiftWork).toEqual([saved]);
  });
  it("keeps loading until concurrent confirmations have both finished", async () => {
    const f = setup();
    const first = deferred<SavedTvlShiftWork>(),
      second = deferred<SavedTvlShiftWork>();
    f.saveTvlShiftWork.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const screen = await renderHook(() => useRemunerationData(), {
      wrapper: ({ children }) => (
        <RemunerationProvider {...f} reloadRevision={0}>
          {children}
        </RemunerationProvider>
      ),
    });
    await waitFor(() => expect(screen.result.current.status).toBe("ready"));
    let a!: Promise<SavedTvlShiftWork>, b!: Promise<SavedTvlShiftWork>;
    await act(async () => {
      a = screen.result.current.saveTvlShiftWork(input(false));
      b = screen.result.current.saveTvlShiftWork({ ...input(true), shiftId: "another" });
    });
    await act(async () => {
      first.resolve(tvlFact(false));
      await a;
    });
    expect(screen.result.current.status).toBe("loading");
    expect(f.loadSnapshot).toHaveBeenCalledTimes(1);
    const other = { ...tvlFact(true), shiftId: "another" };
    f.loadSnapshot.mockResolvedValue(snapshot([tvlFact(false), other]));
    await act(async () => {
      second.resolve(other);
      await b;
    });
    expect(screen.result.current.tvlShiftWork).toEqual([tvlFact(false), other]);
  });
});
