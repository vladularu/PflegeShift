import type {
  CalendarEntry,
  SaveShiftInput,
  SaveShiftTemplateInput,
  ShiftEntry,
  ShiftTemplate,
} from "@/domain/types";
import {
  matchingQuickEntries,
  quickEntryShiftInputFromTemplate,
} from "@/features/calendar/quick-entry-actions";

export async function saveTemplateWithOptionalCalendarEntry({
  entries,
  input,
  quickEntryDate,
  upsertShift,
  upsertTemplate,
}: {
  readonly entries: readonly CalendarEntry[];
  readonly input: SaveShiftTemplateInput;
  readonly quickEntryDate?: string;
  readonly upsertShift: (input: SaveShiftInput) => Promise<ShiftEntry>;
  readonly upsertTemplate: (input: SaveShiftTemplateInput) => Promise<ShiftTemplate>;
}): Promise<ShiftTemplate> {
  const savedTemplate = await upsertTemplate(input);
  if (!quickEntryDate) return savedTemplate;

  const savedAction = {
    kind: "TEMPLATE" as const,
    key: `template:${savedTemplate.id}`,
    label: savedTemplate.name,
    color: savedTemplate.color,
    symbol: savedTemplate.symbol,
    template: savedTemplate,
  };
  if (matchingQuickEntries(savedAction, quickEntryDate, entries).length === 0) {
    await upsertShift(quickEntryShiftInputFromTemplate(savedTemplate, quickEntryDate));
  }
  return savedTemplate;
}
