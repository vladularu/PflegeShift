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
  SaveAppointmentInput,
  SaveShiftInput,
  SaveShiftTemplateInput,
  ShiftEntry,
  ShiftTemplate,
  UserProfile,
} from "@/domain/types";
import {
  deleteCalendarEntry,
  deleteTemplate,
  listCalendarEntries,
  listTemplates,
  loadProfile,
  saveAppointment,
  saveProfile,
  saveShift,
  saveTemplate,
} from "@/infrastructure/database/repository";

interface MediShiftContextValue {
  readonly ready: boolean;
  readonly error: string | null;
  readonly profile: UserProfile | null;
  readonly templates: readonly ShiftTemplate[];
  readonly entries: readonly CalendarEntry[];
  readonly reload: () => Promise<void>;
  readonly updateProfile: (
    input: Pick<UserProfile, "federalState" | "weeklyMinutes" | "timeZone">,
  ) => Promise<UserProfile>;
  readonly upsertTemplate: (input: SaveShiftTemplateInput) => Promise<ShiftTemplate>;
  readonly removeTemplate: (template: ShiftTemplate) => Promise<void>;
  readonly moveTemplate: (template: ShiftTemplate, direction: -1 | 1) => Promise<void>;
  readonly upsertShift: (input: SaveShiftInput) => Promise<ShiftEntry>;
  readonly upsertAppointment: (input: SaveAppointmentInput) => Promise<Appointment>;
  readonly removeEntry: (entry: CalendarEntry) => Promise<void>;
}

const MediShiftContext = createContext<MediShiftContextValue | null>(null);

export function MediShiftProvider({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [templates, setTemplates] = useState<readonly ShiftTemplate[]>([]);
  const [entries, setEntries] = useState<readonly CalendarEntry[]>([]);

  const reload = useCallback(async () => {
    try {
      const [nextProfile, nextTemplates, nextEntries] = await Promise.all([
        loadProfile(db),
        listTemplates(db),
        listCalendarEntries(db),
      ]);
      setProfile(nextProfile);
      setTemplates(nextTemplates);
      setEntries(nextEntries);
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

  const value = useMemo<MediShiftContextValue>(
    () => ({
      ready,
      error,
      profile,
      templates,
      entries,
      reload,
      async updateProfile(input) {
        const saved = await saveProfile(db, input);
        setProfile(saved);
        return saved;
      },
      async upsertTemplate(input) {
        const saved = await saveTemplate(db, input);
        setTemplates(await listTemplates(db));
        return saved;
      },
      async removeTemplate(template) {
        await deleteTemplate(db, template.id, template.revision);
        setTemplates(await listTemplates(db));
      },
      async moveTemplate(template, direction) {
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
      },
      async upsertShift(input) {
        const saved = await saveShift(db, input);
        setEntries(await listCalendarEntries(db));
        return saved;
      },
      async upsertAppointment(input) {
        const saved = await saveAppointment(db, input);
        setEntries(await listCalendarEntries(db));
        return saved;
      },
      async removeEntry(entry) {
        await deleteCalendarEntry(db, entry);
        setEntries(await listCalendarEntries(db));
      },
    }),
    [db, entries, error, profile, ready, reload, templates],
  );

  return <MediShiftContext value={value}>{children}</MediShiftContext>;
}

export function useMediShift(): MediShiftContextValue {
  const value = React.use(MediShiftContext);
  if (value === null) {
    throw new Error("useMediShift muss innerhalb des MediShiftProvider verwendet werden.");
  }
  return value;
}
