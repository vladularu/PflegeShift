import type { EntryLocation } from "@/domain/types";

let pendingSelection: EntryLocation | null | undefined;
let pendingInitialQuery: string | undefined;

export function prepareLocationPicker(current: EntryLocation | null): void {
  pendingInitialQuery = current?.name ?? "";
  pendingSelection = undefined;
}

export function consumeLocationPickerQuery(): string {
  const value = pendingInitialQuery ?? "";
  pendingInitialQuery = undefined;
  return value;
}

export function publishLocationSelection(location: EntryLocation | null): void {
  pendingSelection = location;
}

export function consumeLocationSelection(): EntryLocation | null | undefined {
  const value = pendingSelection;
  pendingSelection = undefined;
  return value;
}
