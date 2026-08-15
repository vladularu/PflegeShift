import type { EntryLocation } from "@/domain/types";

let pendingSelection: EntryLocation | null | undefined;

export function publishLocationSelection(location: EntryLocation | null): void {
  pendingSelection = location;
}

export function consumeLocationSelection(): EntryLocation | null | undefined {
  const value = pendingSelection;
  pendingSelection = undefined;
  return value;
}
