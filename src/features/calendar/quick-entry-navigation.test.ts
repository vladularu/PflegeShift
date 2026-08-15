import { beforeEach, describe, expect, it } from "vitest";

import {
  beginShiftSelectionNavigation,
  completeShiftSelectionNavigation,
  consumeShiftSelectionPopupRestore,
} from "@/features/calendar/quick-entry-navigation";

describe("quick-entry navigation state", () => {
  beforeEach(() => {
    beginShiftSelectionNavigation();
  });

  it("keeps the popup when the shift selection returns normally", () => {
    expect(consumeShiftSelectionPopupRestore()).toBe(true);
  });

  it("closes the popup after a template was saved for the selected day", () => {
    completeShiftSelectionNavigation();

    expect(consumeShiftSelectionPopupRestore()).toBe(false);
    expect(consumeShiftSelectionPopupRestore()).toBe(true);
  });
});
