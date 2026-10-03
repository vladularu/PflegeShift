import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import type {
  PflegeShiftDiagnosticsPort,
  RemunerationRepositoryPort,
} from "@/application/pflegeshift-ports";
import type {
  DatedRemunerationProfile,
  SaveDatedRemunerationProfileInput,
} from "@/domain/remuneration-profile";
import type {
  MonthlyAllowanceDecisions,
  SaveMonthlyAllowanceDecisionsInput,
} from "@/domain/allowance-decisions";
import type {
  SavedOvertimeAllocation,
  SaveOvertimeAllocationInput,
} from "@/domain/overtime-allocation";
import type { SavedPaidAbsence, SavePaidAbsenceInput } from "@/domain/paid-absence";
import type {
  SavedActualOwnAnnualPayment,
  SaveActualOwnAnnualPaymentInput,
} from "@/domain/saved-annual-payment";
import type {
  SavedTariffAnnualClaim,
  SaveTariffAnnualClaimInput,
} from "@/domain/saved-tariff-annual-claim";

import type { SavedTvlShiftWork, SaveTvlShiftWorkInput } from "@/domain/saved-tvl-shift-work";
import type {
  SavedCaritasMonthFacts,
  SaveCaritasMonthFactsInput,
} from "@/domain/saved-caritas-month-facts";
import type {
  SavedTvoedAnnexAMonthConfirmation,
  SaveTvoedAnnexAMonthConfirmationInput,
} from "@/domain/saved-tvoed-annex-a-month-confirmation";
import type {
  SavedDrkEmployeeMonthConfirmation,
  SaveDrkEmployeeMonthConfirmationInput,
} from "@/domain/saved-drk-employee-month-confirmation";
import type {
  SavedDrkTrainingMonthConfirmation,
  SaveDrkTrainingMonthConfirmationInput,
} from "@/domain/saved-drk-training-month-confirmation";
import type {
  SavedTvoedAnnexAPremiumFacts,
  SaveTvoedAnnexAPremiumFactsInput,
} from "@/domain/saved-tvoed-annex-a-premium-facts";
import type {
  SavedTvoedSueMonthConfirmation,
  SaveTvoedSueMonthConfirmationInput,
} from "@/domain/saved-tvoed-sue-month-confirmation";
import type {
  SavedTvoedSueAllowanceConfirmation,
  SaveTvoedSueAllowanceConfirmationInput,
} from "@/domain/saved-tvoed-sue-allowance-confirmation";

export const REMUNERATION_LOAD_FAILURE_MESSAGE =
  "Die Vergütungsdaten konnten nicht geladen werden. Bitte erneut versuchen.";

interface RemunerationState {
  readonly drkEmployeeMonthConfirmations: readonly SavedDrkEmployeeMonthConfirmation[];
  readonly drkTrainingMonthConfirmations: readonly SavedDrkTrainingMonthConfirmation[];
  readonly caritasMonthFacts: readonly SavedCaritasMonthFacts[];
  readonly tvoedAnnexAMonthConfirmations: readonly SavedTvoedAnnexAMonthConfirmation[];
  readonly tvoedAnnexAPremiumFacts: readonly SavedTvoedAnnexAPremiumFacts[];
  readonly tvoedSueMonthConfirmations: readonly SavedTvoedSueMonthConfirmation[];
  readonly tvoedSueAllowanceConfirmations: readonly SavedTvoedSueAllowanceConfirmation[];
  readonly tvlShiftWork: readonly SavedTvlShiftWork[];
  readonly tariffAnnualClaims: readonly SavedTariffAnnualClaim[];
  readonly actualAnnualPayments: readonly SavedActualOwnAnnualPayment[];
  readonly paidAbsences: readonly SavedPaidAbsence[];
  readonly status: "loading" | "ready" | "error";
  /** Last known values are not calculation-ready unless status is ready. */
  readonly profiles: readonly DatedRemunerationProfile[];
  readonly allowanceDecisions: readonly MonthlyAllowanceDecisions[];
  readonly overtimeAllocations: readonly SavedOvertimeAllocation[];
  readonly error: string | null;
}

interface RemunerationContextValue extends RemunerationState {
  readonly saveDrkEmployeeMonthConfirmation: (
    input: SaveDrkEmployeeMonthConfirmationInput,
  ) => Promise<SavedDrkEmployeeMonthConfirmation>;
  readonly saveDrkTrainingMonthConfirmation: (
    input: SaveDrkTrainingMonthConfirmationInput,
  ) => Promise<SavedDrkTrainingMonthConfirmation>;
  readonly saveCaritasMonthFacts: (
    input: SaveCaritasMonthFactsInput,
  ) => Promise<SavedCaritasMonthFacts>;
  readonly saveTvoedAnnexAMonthConfirmation: (
    input: SaveTvoedAnnexAMonthConfirmationInput,
  ) => Promise<SavedTvoedAnnexAMonthConfirmation>;
  readonly saveTvoedAnnexAPremiumFacts: (
    input: SaveTvoedAnnexAPremiumFactsInput,
  ) => Promise<SavedTvoedAnnexAPremiumFacts>;
  readonly saveTvoedSueMonthConfirmation: (
    input: SaveTvoedSueMonthConfirmationInput,
  ) => Promise<SavedTvoedSueMonthConfirmation>;
  readonly saveTvoedSueAllowanceConfirmation: (
    input: SaveTvoedSueAllowanceConfirmationInput,
  ) => Promise<SavedTvoedSueAllowanceConfirmation>;
  readonly saveTvlShiftWork: (input: SaveTvlShiftWorkInput) => Promise<SavedTvlShiftWork>;
  readonly saveTariffAnnualClaim: (
    input: SaveTariffAnnualClaimInput,
  ) => Promise<SavedTariffAnnualClaim>;
  readonly revokeTariffAnnualClaim: (
    expected: SavedTariffAnnualClaim,
  ) => Promise<SavedTariffAnnualClaim>;
  readonly saveActualAnnualPayment: (
    input: SaveActualOwnAnnualPaymentInput,
  ) => Promise<SavedActualOwnAnnualPayment>;
  readonly revokeActualAnnualPayment: (
    expected: SavedActualOwnAnnualPayment,
  ) => Promise<SavedActualOwnAnnualPayment>;
  readonly savePaidAbsence: (input: SavePaidAbsenceInput) => Promise<SavedPaidAbsence>;
  readonly reload: () => Promise<void>;
  readonly saveProfile: (
    input: SaveDatedRemunerationProfileInput,
  ) => Promise<DatedRemunerationProfile>;
  readonly saveAllowanceDecisions: (
    input: SaveMonthlyAllowanceDecisionsInput,
  ) => Promise<MonthlyAllowanceDecisions>;
  readonly saveOvertimeAllocation: (
    input: SaveOvertimeAllocationInput,
  ) => Promise<SavedOvertimeAllocation>;
}

const RemunerationContext = createContext<RemunerationContextValue | null>(null);
const INITIAL_STATE: RemunerationState = Object.freeze({
  drkEmployeeMonthConfirmations: Object.freeze([]),
  drkTrainingMonthConfirmations: Object.freeze([]),
  caritasMonthFacts: Object.freeze([]),
  tvoedAnnexAMonthConfirmations: Object.freeze([]),
  tvoedAnnexAPremiumFacts: Object.freeze([]),
  tvoedSueMonthConfirmations: Object.freeze([]),
  tvoedSueAllowanceConfirmations: Object.freeze([]),
  tvlShiftWork: Object.freeze([]),
  tariffAnnualClaims: Object.freeze([]),
  actualAnnualPayments: Object.freeze([]),
  paidAbsences: Object.freeze([]),
  status: "loading",
  profiles: Object.freeze([]),
  allowanceDecisions: Object.freeze([]),
  overtimeAllocations: Object.freeze([]),
  error: null,
});

export function RemunerationProvider({
  repository,
  diagnostics,
  reloadRevision,
  children,
}: PropsWithChildren<{
  readonly repository: RemunerationRepositoryPort;
  readonly diagnostics: PflegeShiftDiagnosticsPort;
  readonly reloadRevision: number;
}>) {
  const [state, setState] = useState<
    RemunerationState & {
      readonly source: RemunerationRepositoryPort | null;
      readonly loadRevision: number;
    }
  >({ ...INITIAL_STATE, source: null, loadRevision: -1 });
  // Lifecycle is tied to the actual repository. Old DB responses cannot enter a new one.
  const lifecycleRef = useRef<{
    repository: RemunerationRepositoryPort;
    active: boolean;
    sequence: number;
    pendingWrites: number;
    loadRevision: number;
  } | null>(null);
  const reload = useCallback(async () => {
    const lifecycle = lifecycleRef.current;
    if (lifecycle === null || lifecycle.repository !== repository || !lifecycle.active) return;
    const sequence = ++lifecycle.sequence;
    const loadRevision = lifecycle.loadRevision;
    setState((previous) => ({
      ...(previous.source === repository ? previous : INITIAL_STATE),
      source: repository,
      loadRevision,
      status: "loading",
      error: null,
    }));
    // The final pending writer will reload the complete committed history.
    if (lifecycle.pendingWrites > 0) return;
    try {
      const snapshot = await repository.loadSnapshot();
      if (!lifecycle.active || sequence !== lifecycle.sequence) return;
      setState({ source: repository, loadRevision, status: "ready", ...snapshot, error: null });
    } catch {
      if (!lifecycle.active || sequence !== lifecycle.sequence) return;
      // Do not log a parser error containing personal JSON or a salary value.
      diagnostics.record(
        "provider",
        "REMUNERATION_LOAD_FAILED",
        new Error(REMUNERATION_LOAD_FAILURE_MESSAGE),
      );
      setState((previous) => ({
        ...previous,
        status: "error",
        error: REMUNERATION_LOAD_FAILURE_MESSAGE,
      }));
    }
  }, [diagnostics, repository]);

  useEffect(() => {
    let lifecycle = lifecycleRef.current;
    if (lifecycle === null || lifecycle.repository !== repository) {
      lifecycle = {
        repository,
        active: true,
        sequence: 0,
        pendingWrites: 0,
        loadRevision: reloadRevision,
      };
      lifecycleRef.current = lifecycle;
    }
    lifecycle.active = true;
    lifecycle.loadRevision = reloadRevision;
    void reload();
    return () => {
      lifecycle.active = false;
      lifecycle.sequence += 1;
    };
  }, [repository, reload, reloadRevision]);

  const persist = useCallback(
    async <T,>(write: () => Promise<T>): Promise<T> => {
      const lifecycle = lifecycleRef.current;
      if (lifecycle === null || lifecycle.repository !== repository || !lifecycle.active)
        throw new Error("Die Vergütungshistorie ist noch nicht bereit.");
      lifecycle.pendingWrites += 1;
      lifecycle.sequence += 1;
      setState((previous) => ({
        ...(previous.source === repository ? previous : INITIAL_STATE),
        source: repository,
        loadRevision: lifecycle.loadRevision,
        status: "loading",
        error: null,
      }));
      try {
        return await write();
      } finally {
        lifecycle.pendingWrites -= 1;
        // reload catches read errors: an already committed write must not be reported as failed.
        if (lifecycle.active && lifecycle.pendingWrites === 0) await reload();
      }
    },
    [reload, repository],
  );

  const saveTvlShiftWork = useCallback(
    (input: SaveTvlShiftWorkInput) => persist(() => repository.saveTvlShiftWork(input)),
    [persist, repository],
  );
  const saveCaritasMonthFacts = useCallback(
    (input: SaveCaritasMonthFactsInput) => persist(() => repository.saveCaritasMonthFacts(input)),
    [persist, repository],
  );
  const saveTvoedAnnexAMonthConfirmation = useCallback(
    (input: SaveTvoedAnnexAMonthConfirmationInput) =>
      persist(() => repository.saveTvoedAnnexAMonthConfirmation(input)),
    [persist, repository],
  );
  const saveDrkEmployeeMonthConfirmation = useCallback(
    (input: SaveDrkEmployeeMonthConfirmationInput) =>
      persist(() => repository.saveDrkEmployeeMonthConfirmation(input)),
    [persist, repository],
  );
  const saveDrkTrainingMonthConfirmation = useCallback(
    (input: SaveDrkTrainingMonthConfirmationInput) =>
      persist(() => repository.saveDrkTrainingMonthConfirmation(input)),
    [persist, repository],
  );
  const saveTvoedAnnexAPremiumFacts = useCallback(
    (input: SaveTvoedAnnexAPremiumFactsInput) =>
      persist(() => repository.saveTvoedAnnexAPremiumFacts(input)),
    [persist, repository],
  );
  const saveTvoedSueMonthConfirmation = useCallback(
    (input: SaveTvoedSueMonthConfirmationInput) =>
      persist(() => repository.saveTvoedSueMonthConfirmation(input)),
    [persist, repository],
  );
  const saveTvoedSueAllowanceConfirmation = useCallback(
    (input: SaveTvoedSueAllowanceConfirmationInput) =>
      persist(() => repository.saveTvoedSueAllowanceConfirmation(input)),
    [persist, repository],
  );
  const saveProfile = useCallback(
    (input: SaveDatedRemunerationProfileInput) => persist(() => repository.saveProfile(input)),
    [persist, repository],
  );
  const saveAllowanceDecisions = useCallback(
    (input: SaveMonthlyAllowanceDecisionsInput) =>
      persist(() => repository.saveAllowanceDecisions(input)),
    [persist, repository],
  );

  const saveOvertimeAllocation = useCallback(
    (input: SaveOvertimeAllocationInput) => persist(() => repository.saveOvertimeAllocation(input)),
    [persist, repository],
  );

  const savePaidAbsence = useCallback(
    (input: SavePaidAbsenceInput) => persist(() => repository.savePaidAbsence(input)),
    [persist, repository],
  );

  const saveActualAnnualPayment = useCallback(
    (input: SaveActualOwnAnnualPaymentInput) =>
      persist(() => repository.saveActualAnnualPayment(input)),
    [persist, repository],
  );
  const revokeActualAnnualPayment = useCallback(
    (expected: SavedActualOwnAnnualPayment) =>
      persist(() => repository.revokeActualAnnualPayment(expected)),
    [persist, repository],
  );

  const saveTariffAnnualClaim = useCallback(
    (input: SaveTariffAnnualClaimInput) => persist(() => repository.saveTariffAnnualClaim(input)),
    [persist, repository],
  );
  const revokeTariffAnnualClaim = useCallback(
    (expected: SavedTariffAnnualClaim) =>
      persist(() => repository.revokeTariffAnnualClaim(expected)),
    [persist, repository],
  );

  const value = useMemo(() => {
    const current =
      state.source === repository && state.loadRevision === reloadRevision ? state : INITIAL_STATE;
    return {
      drkEmployeeMonthConfirmations: current.drkEmployeeMonthConfirmations,
      saveDrkEmployeeMonthConfirmation,
      drkTrainingMonthConfirmations: current.drkTrainingMonthConfirmations,
      saveDrkTrainingMonthConfirmation,
      caritasMonthFacts: current.caritasMonthFacts,
      saveCaritasMonthFacts,
      tvoedAnnexAMonthConfirmations: current.tvoedAnnexAMonthConfirmations,
      saveTvoedAnnexAMonthConfirmation,
      tvoedAnnexAPremiumFacts: current.tvoedAnnexAPremiumFacts,
      saveTvoedAnnexAPremiumFacts,
      tvoedSueMonthConfirmations: current.tvoedSueMonthConfirmations,
      tvoedSueAllowanceConfirmations: current.tvoedSueAllowanceConfirmations,
      saveTvoedSueMonthConfirmation,
      saveTvoedSueAllowanceConfirmation,
      tvlShiftWork: current.tvlShiftWork,
      saveTvlShiftWork,
      tariffAnnualClaims: current.tariffAnnualClaims,
      saveTariffAnnualClaim,
      revokeTariffAnnualClaim,
      actualAnnualPayments: current.actualAnnualPayments,
      saveActualAnnualPayment,
      revokeActualAnnualPayment,
      status: current.status,
      profiles: current.profiles,
      allowanceDecisions: current.allowanceDecisions,
      overtimeAllocations: current.overtimeAllocations,
      paidAbsences: current.paidAbsences,
      error: current.error,
      reload,
      saveProfile,
      saveAllowanceDecisions,
      saveOvertimeAllocation,
      savePaidAbsence,
    };
  }, [
    reload,
    reloadRevision,
    repository,
    saveTvlShiftWork,
    saveCaritasMonthFacts,
    saveTvoedAnnexAMonthConfirmation,
    saveDrkEmployeeMonthConfirmation,
    saveDrkTrainingMonthConfirmation,
    saveTvoedAnnexAPremiumFacts,
    saveTvoedSueMonthConfirmation,
    saveTvoedSueAllowanceConfirmation,
    saveProfile,
    saveAllowanceDecisions,
    saveOvertimeAllocation,
    savePaidAbsence,
    saveActualAnnualPayment,
    revokeActualAnnualPayment,
    saveTariffAnnualClaim,
    revokeTariffAnnualClaim,
    state,
  ]);
  return <RemunerationContext value={value}>{children}</RemunerationContext>;
}

export function useRemunerationData(): RemunerationContextValue {
  const context = React.use(RemunerationContext);
  if (context === null) throw new Error("useRemunerationData benötigt den RemunerationProvider.");
  return context;
}

/** Profile/allowance editors share the full snapshot lifecycle, not a separate store. */
export function useRemunerationHistory(): Omit<
  RemunerationContextValue,
  | "tvlShiftWork"
  | "saveTvlShiftWork"
  | "caritasMonthFacts"
  | "saveCaritasMonthFacts"
  | "tvoedAnnexAMonthConfirmations"
  | "saveTvoedAnnexAMonthConfirmation"
  | "drkEmployeeMonthConfirmations"
  | "saveDrkEmployeeMonthConfirmation"
  | "drkTrainingMonthConfirmations"
  | "saveDrkTrainingMonthConfirmation"
  | "tvoedAnnexAPremiumFacts"
  | "saveTvoedAnnexAPremiumFacts"
  | "tvoedSueMonthConfirmations"
  | "tvoedSueAllowanceConfirmations"
  | "saveTvoedSueMonthConfirmation"
  | "saveTvoedSueAllowanceConfirmation"
  | "overtimeAllocations"
  | "saveOvertimeAllocation"
  | "paidAbsences"
  | "savePaidAbsence"
  | "actualAnnualPayments"
  | "saveActualAnnualPayment"
  | "revokeActualAnnualPayment"
  | "tariffAnnualClaims"
  | "saveTariffAnnualClaim"
  | "revokeTariffAnnualClaim"
> {
  return useRemunerationData();
}
