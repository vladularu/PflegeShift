import { type SaveShiftInput, type ShiftEntry, type ShiftTemplate } from "@/domain/types";

export interface QuickEntryStampAction {
  readonly kind: "TEMPLATE";
  readonly key: string;
  readonly label: string;
  readonly color: string;
  readonly symbol: string;
  readonly template: ShiftTemplate;
}

export type QuickEntryAction =
  | QuickEntryStampAction
  | {
      readonly kind: "CUSTOM_SHIFT";
      readonly key: "editor:shift";
      readonly label: "Dienst";
    }
  | {
      readonly kind: "APPOINTMENT";
      readonly key: "editor:appointment";
      readonly label: "Termin";
    };

export function buildQuickEntryActions(
  templates: readonly ShiftTemplate[],
): readonly QuickEntryAction[] {
  const templateActions = [...templates]
    .filter((template) => template.deletedAt === null)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map<QuickEntryStampAction>((template) =>
      Object.freeze({
        kind: "TEMPLATE",
        key: `template:${template.id}`,
        label: template.name,
        color: template.color,
        symbol: template.symbol,
        template,
      }),
    );

  return Object.freeze([
    ...templateActions,
    Object.freeze({
      kind: "CUSTOM_SHIFT" as const,
      key: "editor:shift" as const,
      label: "Dienst" as const,
    }),
    Object.freeze({
      kind: "APPOINTMENT" as const,
      key: "editor:appointment" as const,
      label: "Termin" as const,
    }),
  ]);
}

export function isQuickEntryStampAction(action: QuickEntryAction): action is QuickEntryStampAction {
  return action.kind === "TEMPLATE";
}

export function quickEntryTemplateActions(
  actions: readonly QuickEntryAction[],
): readonly Extract<QuickEntryAction, { readonly kind: "TEMPLATE" }>[] {
  return Object.freeze(
    actions.filter(
      (action): action is Extract<QuickEntryAction, { readonly kind: "TEMPLATE" }> =>
        action.kind === "TEMPLATE",
    ),
  );
}

export function quickEntryServiceActions(
  actions: readonly QuickEntryAction[],
): readonly QuickEntryStampAction[] {
  return Object.freeze(actions.filter(isQuickEntryStampAction));
}

export function quickEntryEditorMode(action: QuickEntryAction): "SHIFT" | "APPOINTMENT" | null {
  if (action.kind === "CUSTOM_SHIFT") return "SHIFT";
  if (action.kind === "APPOINTMENT") return "APPOINTMENT";
  return null;
}

export function quickEntryEditorTarget(
  action: QuickEntryAction,
  date: string,
): { readonly date: string; readonly mode: "SHIFT" | "APPOINTMENT" } | null {
  const mode = quickEntryEditorMode(action);
  return mode === null ? null : Object.freeze({ date, mode });
}

export function quickEntryShiftInput(action: QuickEntryStampAction, date: string): SaveShiftInput {
  return quickEntryShiftInputFromTemplate(action.template, date);
}

export function quickEntryShiftInputFromTemplate(
  template: ShiftTemplate,
  date: string,
): SaveShiftInput {
  return Object.freeze({
    date,
    templateId: template.id,
    title: template.name,
    type: template.type,
    allDay: template.allDay,
    startTime: template.startTime,
    endTime: template.endTime,
    breakMinutes: template.breakMinutes,
    color: template.color,
    symbol: template.symbol,
    notification: template.notification,
    location: template.location,
  });
}

function isAbsenceTemplate(template: ShiftTemplate): boolean {
  return template.type === "VACATION" || template.type === "SICK" || template.type === "FREE";
}

export function matchingQuickEntries(
  action: QuickEntryStampAction,
  date: string,
  entries: readonly import("@/domain/types").CalendarEntry[],
): readonly ShiftEntry[] {
  return Object.freeze(
    entries.filter(
      (entry): entry is ShiftEntry =>
        entry.kind === "SHIFT" &&
        entry.deletedAt === null &&
        entry.date === date &&
        (entry.templateId === action.template.id ||
          (entry.templateId === null &&
            isAbsenceTemplate(action.template) &&
            entry.type === action.template.type)),
    ),
  );
}

export async function saveQuickEntryAction(
  action: QuickEntryStampAction,
  date: string,
  upsertShift: (input: SaveShiftInput) => Promise<ShiftEntry>,
): Promise<ShiftEntry> {
  return upsertShift(quickEntryShiftInput(action, date));
}
