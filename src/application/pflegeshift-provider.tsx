import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import type { PflegeShiftPorts } from "@/application/pflegeshift-ports";
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
import { compareCalendarEntries } from "@/engine/calendar-entry-order";

interface PflegeShiftProviderProps extends PropsWithChildren {
  readonly ports: PflegeShiftPorts;
}

interface PflegeShiftStatusValue {
  readonly ready: boolean;
  readonly error: string | null;
  readonly notificationWarning: NotificationWarning | null;
  readonly clearNotificationWarning: (id: number) => void;
  readonly reload: () => Promise<void>;
}

export interface NotificationWarning {
  readonly id: number;
  readonly message: string;
}

interface PflegeShiftProfileValue {
  readonly profile: UserProfile | null;
  readonly updateProfile: (input: SaveProfileInput) => Promise<UserProfile>;
}

interface PflegeShiftTemplatesValue {
  readonly templates: readonly ShiftTemplate[];
  readonly upsertTemplate: (input: SaveShiftTemplateInput) => Promise<ShiftTemplate>;
  readonly removeTemplate: (template: ShiftTemplate) => Promise<void>;
  readonly restoreTemplate: (template: ShiftTemplate) => Promise<ShiftTemplate>;
  readonly moveTemplate: (template: ShiftTemplate, direction: -1 | 1) => Promise<void>;
}

interface PflegeShiftEntriesValue {
  readonly entries: readonly CalendarEntry[];
  readonly upsertShift: (input: SaveShiftInput) => Promise<ShiftEntry>;
  readonly upsertAppointment: (input: SaveAppointmentInput) => Promise<Appointment>;
  readonly removeEntry: (entry: CalendarEntry) => Promise<void>;
  readonly restoreEntry: (entry: CalendarEntry) => Promise<CalendarEntry>;
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

export function PflegeShiftProvider({ children, ports }: PflegeShiftProviderProps) {
  const { repository, notifications, diagnostics, devTools } = ports;
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
  const [notificationWarning, setNotificationWarning] = useState<NotificationWarning | null>(null);
  const notificationWarningSequence = useRef(0);

  const publishNotificationWarning = useCallback((message: string) => {
    setNotificationWarning({ id: ++notificationWarningSequence.current, message });
  }, []);

  const clearNotificationWarning = useCallback((id: number) => {
    setNotificationWarning((current) => (current?.id === id ? null : current));
  }, []);

  const reload = useCallback(async () => {
    try {
      const [nextProfile, nextTemplates, nextEntries, nextDecisions, nextWorkPatternSettings] =
        await Promise.all([
          repository.loadProfile(),
          repository.listTemplates(),
          repository.listCalendarEntries(),
          repository.listMonthlyTariffDecisions(),
          repository.loadTvoedWorkPatternSettings(),
        ]);
      setProfile(nextProfile);
      setTemplates(nextTemplates);
      setEntries(nextEntries);
      setTariffDecisions(nextDecisions);
      setWorkPatternSettings(nextWorkPatternSettings);
      setTestDataLoadRevision((current) => current + 1);
      setError(null);
      const notificationTimeZone = nextProfile?.timeZone ?? "Europe/Berlin";
      void Promise.allSettled(
        nextEntries
          .filter(
            (entry) =>
              entry.notification != null || (entry.kind === "SHIFT" && entry.alarmEnabled === true),
          )
          .map((entry) => notifications.syncEntry(entry, notificationTimeZone)),
      ).then((results) => {
        let failed = false;
        for (const result of results) {
          if (result.status === "rejected") {
            failed = true;
            diagnostics.record(
              "notifications",
              "ENTRY_NOTIFICATION_RECONCILE_FAILED",
              result.reason,
            );
          }
        }
        if (failed) {
          publishNotificationWarning("Erinnerungen konnten nicht vollständig aktualisiert werden.");
        }
      });
    } catch (loadError) {
      diagnostics.record("provider", "PROVIDER_RELOAD_FAILED", loadError);
      setError(DATA_LOAD_FAILURE_MESSAGE);
    } finally {
      setReady(true);
    }
  }, [diagnostics, notifications, publishNotificationWarning, repository]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!devTools.shouldLoadState(ready, testDataLoadRevision)) return;
    let active = true;
    void devTools
      .listBackupMonths()
      .then((months) => {
        if (active) setTestMonths(months);
      })
      .catch((loadError) => {
        diagnostics.record("dev-tools", "DEV_BACKUP_STATUS_FAILED", loadError);
        // Testdaten sind eine nachgelagerte Entwickleranzeige und blockieren
        // weder den Kalenderstart noch vorhandene Nutzerdaten.
      });
    return () => {
      active = false;
    };
  }, [devTools, diagnostics, ready, testDataLoadRevision]);

  const updateProfile = useCallback(
    async (input: SaveProfileInput) => {
      const saved = await repository.saveProfile(input);
      setProfile(saved);
      return saved;
    },
    [repository],
  );

  const upsertTemplate = useCallback(
    async (input: SaveShiftTemplateInput) => {
      const saved = await repository.saveTemplate(input);
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
    [repository],
  );

  const removeTemplate = useCallback(
    async (template: ShiftTemplate) => {
      await repository.deleteTemplate(template.id, template.revision);
      setTemplates((current) => current.filter((item) => item.id !== template.id));
    },
    [repository],
  );

  const restoreRemovedTemplate = useCallback(
    async (template: ShiftTemplate) => {
      const restored = await repository.restoreTemplate(template);
      setTemplates((current) =>
        [...replaceById(current, restored)].sort((left, right) => left.sortOrder - right.sortOrder),
      );
      return restored;
    },
    [repository],
  );

  const moveTemplate = useCallback(
    async (template: ShiftTemplate, direction: -1 | 1) => {
      const currentIndex = templates.findIndex((item) => item.id === template.id);
      const targetIndex = currentIndex + direction;
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= templates.length) return;

      const target = templates[targetIndex];
      const swapped = await repository.swapTemplateSortOrder(template, target);
      setTemplates((current) =>
        current
          .map((item) => swapped.find((saved) => saved.id === item.id) ?? item)
          .sort((left, right) => left.sortOrder - right.sortOrder),
      );
    },
    [repository, templates],
  );

  const upsertShift = useCallback(
    async (input: SaveShiftInput) => {
      const saved = await repository.saveShift(input);
      setEntries((current) => upsertSortedCalendarEntry(current, saved));
      try {
        await notifications.syncEntry(saved, profile?.timeZone ?? "Europe/Berlin");
      } catch (notificationError) {
        diagnostics.record("notifications", "SHIFT_NOTIFICATION_SYNC_FAILED", notificationError);
        publishNotificationWarning("Gespeichert. Erinnerung konnte nicht eingerichtet werden.");
      }
      return saved;
    },
    [diagnostics, notifications, profile, publishNotificationWarning, repository],
  );

  const upsertAppointment = useCallback(
    async (input: SaveAppointmentInput) => {
      const saved = await repository.saveAppointment(input);
      setEntries((current) => upsertSortedCalendarEntry(current, saved));
      try {
        await notifications.syncEntry(saved, profile?.timeZone ?? "Europe/Berlin");
      } catch (notificationError) {
        diagnostics.record(
          "notifications",
          "APPOINTMENT_NOTIFICATION_SYNC_FAILED",
          notificationError,
        );
        publishNotificationWarning("Gespeichert. Erinnerung konnte nicht eingerichtet werden.");
      }
      return saved;
    },
    [diagnostics, notifications, profile, publishNotificationWarning, repository],
  );

  const removeEntry = useCallback(
    async (entry: CalendarEntry) => {
      await repository.deleteCalendarEntry(entry);
      setEntries((current) => current.filter((item) => item.id !== entry.id));
      try {
        await notifications.cancelEntry(entry);
      } catch (notificationError) {
        diagnostics.record("notifications", "ENTRY_NOTIFICATION_CANCEL_FAILED", notificationError);
        publishNotificationWarning(
          "Gelöscht. Eine geplante Erinnerung konnte nicht entfernt werden.",
        );
      }
    },
    [diagnostics, notifications, publishNotificationWarning, repository],
  );

  const restoreEntry = useCallback(
    async (entry: CalendarEntry) => {
      const restored = await repository.restoreCalendarEntry(entry);
      setEntries((current) => upsertSortedCalendarEntry(current, restored));
      return restored;
    },
    [repository],
  );

  const upsertTariffDecision = useCallback(
    async (input: SaveMonthlyTariffDecisionInput) => {
      const saved = await repository.saveMonthlyTariffDecision(input);
      setTariffDecisions((current) =>
        [...current.filter((item) => item.month !== saved.month), saved].sort((left, right) =>
          left.month.localeCompare(right.month),
        ),
      );
      return saved;
    },
    [repository],
  );

  const updateWorkPatternSettings = useCallback(
    async (input: SaveTvoedWorkPatternSettingsInput) => {
      const saved = await repository.saveTvoedWorkPatternSettings(input);
      setWorkPatternSettings(saved);
      return saved;
    },
    [repository],
  );

  const statusValue = useMemo<PflegeShiftStatusValue>(
    () => ({ ready, error, notificationWarning, clearNotificationWarning, reload }),
    [clearNotificationWarning, error, notificationWarning, ready, reload],
  );
  const profileValue = useMemo<PflegeShiftProfileValue>(
    () => ({ profile, updateProfile }),
    [profile, updateProfile],
  );
  const templatesValue = useMemo<PflegeShiftTemplatesValue>(
    () => ({
      templates,
      upsertTemplate,
      removeTemplate,
      restoreTemplate: restoreRemovedTemplate,
      moveTemplate,
    }),
    [moveTemplate, removeTemplate, restoreRemovedTemplate, templates, upsertTemplate],
  );
  const entriesValue = useMemo<PflegeShiftEntriesValue>(
    () => ({ entries, upsertShift, upsertAppointment, removeEntry, restoreEntry }),
    [entries, removeEntry, restoreEntry, upsertAppointment, upsertShift],
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
