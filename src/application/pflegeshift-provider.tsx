import { useSQLiteContext } from "expo-sqlite";
import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import type {
  Appointment,
  CalendarEntry,
  MonthlyTariffDecision,
  SaveAppointmentInput,
  SaveMonthlyTariffDecisionInput,
  SaveProfileInput,
  SaveShiftInput,
  SaveShiftTemplateInput,
  SaveTvoedWorkPatternSettingsInput,
  ShiftEntry,
  ShiftTemplate,
  TvoedWorkPatternSettings,
  UserProfile,
} from "@/domain/types";
import { DATA_LOAD_FAILURE_MESSAGE } from "@/domain/errors";
import {
  deleteCalendarEntry,
  deleteTemplate,
  listCalendarEntries,
  listMonthlyTariffDecisions,
  listTemplates,
  loadProfile,
  loadTvoedWorkPatternSettings,
  saveAppointment,
  saveMonthlyTariffDecision,
  saveProfile,
  saveShift,
  saveTemplate,
  swapTemplateSortOrder,
  saveTvoedWorkPatternSettings,
} from "@/infrastructure/database/repository";
import { listTestBackupMonths } from "@/infrastructure/database/test-backup-status-repository";
import { DEV_TOOLS_AVAILABLE, shouldLoadDevToolState } from "@/infrastructure/dev-tools-policy";
import { compareCalendarEntries } from "@/engine/calendar-entry-order";
import { recordDiagnostic } from "@/infrastructure/diagnostics";

interface PflegeShiftStatusValue {
  readonly ready: boolean;
  readonly error: string | null;
  readonly reload: () => Promise<void>;
}

interface PflegeShiftProfileValue {
  readonly profile: UserProfile | null;
  readonly updateProfile: (input: SaveProfileInput) => Promise<UserProfile>;
}

interface PflegeShiftTemplatesValue {
  readonly templates: readonly ShiftTemplate[];
  readonly upsertTemplate: (input: SaveShiftTemplateInput) => Promise<ShiftTemplate>;
  readonly removeTemplate: (template: ShiftTemplate) => Promise<void>;
  readonly moveTemplate: (template: ShiftTemplate, direction: -1 | 1) => Promise<void>;
}

interface PflegeShiftEntriesValue {
  readonly entries: readonly CalendarEntry[];
  readonly upsertShift: (input: SaveShiftInput) => Promise<ShiftEntry>;
  readonly upsertAppointment: (input: SaveAppointmentInput) => Promise<Appointment>;
  readonly removeEntry: (entry: CalendarEntry) => Promise<void>;
}

interface PflegeShiftTariffValue {
  readonly tariffDecisions: readonly MonthlyTariffDecision[];
  readonly workPatternSettings: TvoedWorkPatternSettings;
  readonly upsertTariffDecision: (
    input: SaveMonthlyTariffDecisionInput,
  ) => Promise<MonthlyTariffDecision>;
  readonly updateWorkPatternSettings: (
    input: SaveTvoedWorkPatternSettingsInput,
  ) => Promise<TvoedWorkPatternSettings>;
}

interface PflegeShiftTestDataValue {
  readonly testMonths: readonly string[];
}

const PflegeShiftStatusContext = createContext<PflegeShiftStatusValue | null>(null);
const PflegeShiftProfileContext = createContext<PflegeShiftProfileValue | null>(null);
const PflegeShiftTemplatesContext = createContext<PflegeShiftTemplatesValue | null>(null);
const PflegeShiftEntriesContext = createContext<PflegeShiftEntriesValue | null>(null);
const PflegeShiftTariffContext = createContext<PflegeShiftTariffValue | null>(null);
const PflegeShiftTestDataContext = createContext<PflegeShiftTestDataValue | null>(null);

function replaceById<T extends { readonly id: string }>(
  values: readonly T[],
  saved: T,
): readonly T[] {
  const next = values.filter((value) => value.id !== saved.id);
  next.push(saved);
  return next;
}

function upsertSortedCalendarEntry(
  current: readonly CalendarEntry[],
  saved: CalendarEntry,
): readonly CalendarEntry[] {
  const next = current.filter((entry) => entry.id !== saved.id);
  let low = 0;
  let high = next.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (compareCalendarEntries(next[middle], saved) <= 0) low = middle + 1;
    else high = middle;
  }
  next.splice(low, 0, saved);
  return Object.freeze(next);
}

function useRequiredContext<T>(context: React.Context<T | null>, name: string): T {
  const value = React.use(context);
  if (value === null) {
    throw new Error(`${name} muss innerhalb des PflegeShiftProvider verwendet werden.`);
  }
  return value;
}

export function PflegeShiftProvider({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [templates, setTemplates] = useState<readonly ShiftTemplate[]>([]);
  const [entries, setEntries] = useState<readonly CalendarEntry[]>([]);
  const [tariffDecisions, setTariffDecisions] = useState<readonly MonthlyTariffDecision[]>([]);
  const [workPatternSettings, setWorkPatternSettings] = useState<TvoedWorkPatternSettings>({
    workplaceCoverage: "UNKNOWN",
    assignment: "UNKNOWN",
    updatedAt: null,
  });
  const [testMonths, setTestMonths] = useState<readonly string[]>([]);
  const [testDataLoadRevision, setTestDataLoadRevision] = useState(0);

  const reload = useCallback(async () => {
    try {
      const [nextProfile, nextTemplates, nextEntries, nextDecisions, nextWorkPatternSettings] =
        await Promise.all([
          loadProfile(db),
          listTemplates(db),
          listCalendarEntries(db),
          listMonthlyTariffDecisions(db),
          loadTvoedWorkPatternSettings(db),
        ]);
      setProfile(nextProfile);
      setTemplates(nextTemplates);
      setEntries(nextEntries);
      setTariffDecisions(nextDecisions);
      setWorkPatternSettings(nextWorkPatternSettings);
      setTestDataLoadRevision((current) => current + 1);
      setError(null);
    } catch (loadError) {
      recordDiagnostic("provider", "PROVIDER_RELOAD_FAILED", loadError);
      setError(DATA_LOAD_FAILURE_MESSAGE);
    } finally {
      setReady(true);
    }
  }, [db]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!shouldLoadDevToolState(DEV_TOOLS_AVAILABLE, ready, testDataLoadRevision)) return;
    let active = true;
    void listTestBackupMonths(db)
      .then((months) => {
        if (active) setTestMonths(months);
      })
      .catch((loadError) => {
        recordDiagnostic("dev-tools", "DEV_BACKUP_STATUS_FAILED", loadError);
        // Testdaten sind eine nachgelagerte Entwickleranzeige und blockieren
        // weder den Kalenderstart noch vorhandene Nutzerdaten.
      });
    return () => {
      active = false;
    };
  }, [db, ready, testDataLoadRevision]);

  const updateProfile = useCallback(
    async (input: SaveProfileInput) => {
      const saved = await saveProfile(db, input);
      setProfile(saved);
      return saved;
    },
    [db],
  );

  const upsertTemplate = useCallback(
    async (input: SaveShiftTemplateInput) => {
      const saved = await saveTemplate(db, input);
      setTemplates((current) =>
        replaceById(current, saved)
          .filter((template) => template.deletedAt === null)
          .sort((left, right) => left.sortOrder - right.sortOrder),
      );
      setEntries((current) =>
        Object.freeze(
          current.map((entry) =>
            entry.kind === "SHIFT" && entry.templateId === saved.id
              ? Object.freeze({
                  ...entry,
                  title: saved.name,
                  color: saved.color,
                  symbol: saved.symbol,
                })
              : entry,
          ),
        ),
      );
      return saved;
    },
    [db],
  );

  const removeTemplate = useCallback(
    async (template: ShiftTemplate) => {
      await deleteTemplate(db, template.id, template.revision);
      setTemplates((current) => current.filter((item) => item.id !== template.id));
    },
    [db],
  );

  const moveTemplate = useCallback(
    async (template: ShiftTemplate, direction: -1 | 1) => {
      const currentIndex = templates.findIndex((item) => item.id === template.id);
      const targetIndex = currentIndex + direction;
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= templates.length) return;

      const target = templates[targetIndex];
      const swapped = await swapTemplateSortOrder(db, template, target);
      setTemplates((current) =>
        current
          .map((item) => swapped.find((saved) => saved.id === item.id) ?? item)
          .sort((left, right) => left.sortOrder - right.sortOrder),
      );
    },
    [db, templates],
  );

  const upsertShift = useCallback(
    async (input: SaveShiftInput) => {
      const saved = await saveShift(db, input);
      setEntries((current) => upsertSortedCalendarEntry(current, saved));
      return saved;
    },
    [db],
  );

  const upsertAppointment = useCallback(
    async (input: SaveAppointmentInput) => {
      const saved = await saveAppointment(db, input);
      setEntries((current) => upsertSortedCalendarEntry(current, saved));
      return saved;
    },
    [db],
  );

  const removeEntry = useCallback(
    async (entry: CalendarEntry) => {
      await deleteCalendarEntry(db, entry);
      setEntries((current) => current.filter((item) => item.id !== entry.id));
    },
    [db],
  );

  const upsertTariffDecision = useCallback(
    async (input: SaveMonthlyTariffDecisionInput) => {
      const saved = await saveMonthlyTariffDecision(db, input);
      setTariffDecisions((current) =>
        [...current.filter((item) => item.month !== saved.month), saved].sort((left, right) =>
          left.month.localeCompare(right.month),
        ),
      );
      return saved;
    },
    [db],
  );

  const updateWorkPatternSettings = useCallback(
    async (input: SaveTvoedWorkPatternSettingsInput) => {
      const saved = await saveTvoedWorkPatternSettings(db, input);
      setWorkPatternSettings(saved);
      return saved;
    },
    [db],
  );

  const statusValue = useMemo<PflegeShiftStatusValue>(
    () => ({ ready, error, reload }),
    [error, ready, reload],
  );
  const profileValue = useMemo<PflegeShiftProfileValue>(
    () => ({ profile, updateProfile }),
    [profile, updateProfile],
  );
  const templatesValue = useMemo<PflegeShiftTemplatesValue>(
    () => ({ templates, upsertTemplate, removeTemplate, moveTemplate }),
    [moveTemplate, removeTemplate, templates, upsertTemplate],
  );
  const entriesValue = useMemo<PflegeShiftEntriesValue>(
    () => ({ entries, upsertShift, upsertAppointment, removeEntry }),
    [entries, removeEntry, upsertAppointment, upsertShift],
  );
  const tariffValue = useMemo<PflegeShiftTariffValue>(
    () => ({
      tariffDecisions,
      workPatternSettings,
      upsertTariffDecision,
      updateWorkPatternSettings,
    }),
    [tariffDecisions, updateWorkPatternSettings, upsertTariffDecision, workPatternSettings],
  );
  const testDataValue = useMemo<PflegeShiftTestDataValue>(() => ({ testMonths }), [testMonths]);

  return (
    <PflegeShiftStatusContext value={statusValue}>
      <PflegeShiftProfileContext value={profileValue}>
        <PflegeShiftTemplatesContext value={templatesValue}>
          <PflegeShiftEntriesContext value={entriesValue}>
            <PflegeShiftTariffContext value={tariffValue}>
              <PflegeShiftTestDataContext value={testDataValue}>
                {children}
              </PflegeShiftTestDataContext>
            </PflegeShiftTariffContext>
          </PflegeShiftEntriesContext>
        </PflegeShiftTemplatesContext>
      </PflegeShiftProfileContext>
    </PflegeShiftStatusContext>
  );
}

export function usePflegeShiftStatus(): PflegeShiftStatusValue {
  return useRequiredContext(PflegeShiftStatusContext, "usePflegeShiftStatus");
}

export function usePflegeShiftProfile(): PflegeShiftProfileValue {
  return useRequiredContext(PflegeShiftProfileContext, "usePflegeShiftProfile");
}

export function usePflegeShiftTemplates(): PflegeShiftTemplatesValue {
  return useRequiredContext(PflegeShiftTemplatesContext, "usePflegeShiftTemplates");
}

export function usePflegeShiftEntries(): PflegeShiftEntriesValue {
  return useRequiredContext(PflegeShiftEntriesContext, "usePflegeShiftEntries");
}

export function usePflegeShiftTariff(): PflegeShiftTariffValue {
  return useRequiredContext(PflegeShiftTariffContext, "usePflegeShiftTariff");
}

export function usePflegeShiftTestData(): PflegeShiftTestDataValue {
  return useRequiredContext(PflegeShiftTestDataContext, "usePflegeShiftTestData");
}
