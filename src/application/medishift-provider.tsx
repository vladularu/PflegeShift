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
  saveTvoedWorkPatternSettings,
} from "@/infrastructure/database/repository";
import { listTestBackupMonths } from "@/infrastructure/database/dev-tools-repository";

interface MediShiftStatusValue {
  readonly ready: boolean;
  readonly error: string | null;
  readonly reload: () => Promise<void>;
}

interface MediShiftProfileValue {
  readonly profile: UserProfile | null;
  readonly updateProfile: (input: SaveProfileInput) => Promise<UserProfile>;
}

interface MediShiftTemplatesValue {
  readonly templates: readonly ShiftTemplate[];
  readonly upsertTemplate: (input: SaveShiftTemplateInput) => Promise<ShiftTemplate>;
  readonly removeTemplate: (template: ShiftTemplate) => Promise<void>;
  readonly moveTemplate: (template: ShiftTemplate, direction: -1 | 1) => Promise<void>;
}

interface MediShiftEntriesValue {
  readonly entries: readonly CalendarEntry[];
  readonly upsertShift: (input: SaveShiftInput) => Promise<ShiftEntry>;
  readonly upsertAppointment: (input: SaveAppointmentInput) => Promise<Appointment>;
  readonly removeEntry: (entry: CalendarEntry) => Promise<void>;
}

interface MediShiftTariffValue {
  readonly tariffDecisions: readonly MonthlyTariffDecision[];
  readonly workPatternSettings: TvoedWorkPatternSettings;
  readonly upsertTariffDecision: (
    input: SaveMonthlyTariffDecisionInput,
  ) => Promise<MonthlyTariffDecision>;
  readonly updateWorkPatternSettings: (
    input: SaveTvoedWorkPatternSettingsInput,
  ) => Promise<TvoedWorkPatternSettings>;
}

interface MediShiftTestDataValue {
  readonly testMonths: readonly string[];
}

const MediShiftStatusContext = createContext<MediShiftStatusValue | null>(null);
const MediShiftProfileContext = createContext<MediShiftProfileValue | null>(null);
const MediShiftTemplatesContext = createContext<MediShiftTemplatesValue | null>(null);
const MediShiftEntriesContext = createContext<MediShiftEntriesValue | null>(null);
const MediShiftTariffContext = createContext<MediShiftTariffValue | null>(null);
const MediShiftTestDataContext = createContext<MediShiftTestDataValue | null>(null);

function replaceById<T extends { readonly id: string }>(
  values: readonly T[],
  saved: T,
): readonly T[] {
  const next = values.filter((value) => value.id !== saved.id);
  next.push(saved);
  return next;
}

function useRequiredContext<T>(
  context: React.Context<T | null>,
  name: string,
): T {
  const value = React.use(context);
  if (value === null) {
    throw new Error(`${name} muss innerhalb des MediShiftProvider verwendet werden.`);
  }
  return value;
}

export function MediShiftProvider({ children }: PropsWithChildren) {
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
      const [nextProfile, nextTemplates, nextEntries, nextDecisions, nextWorkPatternSettings] = await Promise.all([
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
      setError(loadError instanceof Error ? loadError.message : "Lokale Daten konnten nicht geladen werden.");
    } finally {
      setReady(true);
    }
  }, [db]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!ready || testDataLoadRevision === 0) return;
    let active = true;
    void listTestBackupMonths(db)
      .then((months) => {
        if (active) setTestMonths(months);
      })
      .catch(() => {
        // Testdaten sind eine nachgelagerte Entwickleranzeige und blockieren
        // weder den Kalenderstart noch vorhandene Nutzerdaten.
      });
    return () => {
      active = false;
    };
  }, [db, ready, testDataLoadRevision]);

  const updateProfile = useCallback(async (input: SaveProfileInput) => {
    const saved = await saveProfile(db, input);
    setProfile(saved);
    return saved;
  }, [db]);

  const upsertTemplate = useCallback(async (input: SaveShiftTemplateInput) => {
    const saved = await saveTemplate(db, input);
    setTemplates((current) =>
      replaceById(current, saved)
        .filter((template) => template.deletedAt === null)
        .sort((left, right) => left.sortOrder - right.sortOrder),
    );
    return saved;
  }, [db]);

  const removeTemplate = useCallback(async (template: ShiftTemplate) => {
    await deleteTemplate(db, template.id, template.revision);
    setTemplates((current) => current.filter((item) => item.id !== template.id));
  }, [db]);

  const moveTemplate = useCallback(async (template: ShiftTemplate, direction: -1 | 1) => {
    const currentIndex = templates.findIndex((item) => item.id === template.id);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= templates.length) return;

    const target = templates[targetIndex];
    await saveTemplate(db, {
      ...template,
      expectedRevision: template.revision,
      sortOrder: target.sortOrder,
    });
    await saveTemplate(db, {
      ...target,
      expectedRevision: target.revision,
      sortOrder: template.sortOrder,
    });
    setTemplates(await listTemplates(db));
  }, [db, templates]);

  const upsertShift = useCallback(async (input: SaveShiftInput) => {
    const saved = await saveShift(db, input);
    setEntries((current) =>
      [...replaceById(current, saved)].sort(
        (left, right) =>
          left.date.localeCompare(right.date) ||
          (left.startTime ?? "").localeCompare(right.startTime ?? ""),
      ),
    );
    return saved;
  }, [db]);

  const upsertAppointment = useCallback(async (input: SaveAppointmentInput) => {
    const saved = await saveAppointment(db, input);
    setEntries((current) =>
      [...replaceById(current, saved)].sort(
        (left, right) =>
          left.date.localeCompare(right.date) ||
          (left.startTime ?? "").localeCompare(right.startTime ?? ""),
      ),
    );
    return saved;
  }, [db]);

  const removeEntry = useCallback(async (entry: CalendarEntry) => {
    await deleteCalendarEntry(db, entry);
    setEntries((current) => current.filter((item) => item.id !== entry.id));
  }, [db]);

  const upsertTariffDecision = useCallback(async (input: SaveMonthlyTariffDecisionInput) => {
    const saved = await saveMonthlyTariffDecision(db, input);
    setTariffDecisions((current) =>
      [...current.filter((item) => item.month !== saved.month), saved].sort(
        (left, right) => left.month.localeCompare(right.month),
      ),
    );
    return saved;
  }, [db]);

  const updateWorkPatternSettings = useCallback(async (
    input: SaveTvoedWorkPatternSettingsInput,
  ) => {
    const saved = await saveTvoedWorkPatternSettings(db, input);
    setWorkPatternSettings(saved);
    return saved;
  }, [db]);

  const statusValue = useMemo<MediShiftStatusValue>(
    () => ({ ready, error, reload }),
    [error, ready, reload],
  );
  const profileValue = useMemo<MediShiftProfileValue>(
    () => ({ profile, updateProfile }),
    [profile, updateProfile],
  );
  const templatesValue = useMemo<MediShiftTemplatesValue>(
    () => ({ templates, upsertTemplate, removeTemplate, moveTemplate }),
    [moveTemplate, removeTemplate, templates, upsertTemplate],
  );
  const entriesValue = useMemo<MediShiftEntriesValue>(
    () => ({ entries, upsertShift, upsertAppointment, removeEntry }),
    [entries, removeEntry, upsertAppointment, upsertShift],
  );
  const tariffValue = useMemo<MediShiftTariffValue>(
    () => ({
      tariffDecisions,
      workPatternSettings,
      upsertTariffDecision,
      updateWorkPatternSettings,
    }),
    [tariffDecisions, updateWorkPatternSettings, upsertTariffDecision, workPatternSettings],
  );
  const testDataValue = useMemo<MediShiftTestDataValue>(
    () => ({ testMonths }),
    [testMonths],
  );

  return (
    <MediShiftStatusContext value={statusValue}>
      <MediShiftProfileContext value={profileValue}>
        <MediShiftTemplatesContext value={templatesValue}>
          <MediShiftEntriesContext value={entriesValue}>
            <MediShiftTariffContext value={tariffValue}>
              <MediShiftTestDataContext value={testDataValue}>
                {children}
              </MediShiftTestDataContext>
            </MediShiftTariffContext>
          </MediShiftEntriesContext>
        </MediShiftTemplatesContext>
      </MediShiftProfileContext>
    </MediShiftStatusContext>
  );
}

export function useMediShiftStatus(): MediShiftStatusValue {
  return useRequiredContext(MediShiftStatusContext, "useMediShiftStatus");
}

export function useMediShiftProfile(): MediShiftProfileValue {
  return useRequiredContext(MediShiftProfileContext, "useMediShiftProfile");
}

export function useMediShiftTemplates(): MediShiftTemplatesValue {
  return useRequiredContext(MediShiftTemplatesContext, "useMediShiftTemplates");
}

export function useMediShiftEntries(): MediShiftEntriesValue {
  return useRequiredContext(MediShiftEntriesContext, "useMediShiftEntries");
}

export function useMediShiftTariff(): MediShiftTariffValue {
  return useRequiredContext(MediShiftTariffContext, "useMediShiftTariff");
}

export function useMediShiftTestData(): MediShiftTestDataValue {
  return useRequiredContext(MediShiftTestDataContext, "useMediShiftTestData");
}
