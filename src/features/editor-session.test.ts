import { describe, expect, it, vi } from "vitest";

import {
  reconcileEditorSession,
  resolveEditorSession,
  resolveEditorTarget,
} from "@/features/editor-session";

describe("editor session initialization", () => {
  it("does not create form state before provider data is ready", () => {
    const initializer = vi.fn(() => ({ title: "Geladener Dienst" }));

    expect(resolveEditorSession(false, "entry-1", initializer)).toBeNull();
    expect(initializer).not.toHaveBeenCalled();
  });

  it("captures the loaded value once for the route-specific form mount", () => {
    const loaded = { title: "Geladener Dienst" };
    const session = resolveEditorSession(true, "entry-1", () => loaded);

    expect(session).toEqual({ initialValue: loaded, key: "entry-1" });
    expect(Object.isFrozen(session)).toBe(true);
  });

  it("retains the original baseline and revision while the route key is unchanged", () => {
    const first = reconcileEditorSession(null, "entry-1", () => ({ revision: 1 }));
    const refreshedInitializer = vi.fn(() => ({ revision: 2 }));

    const refreshed = reconcileEditorSession(first, "entry-1", refreshedInitializer);

    expect(refreshed).toBe(first);
    expect(refreshed.initialValue.revision).toBe(1);
    expect(refreshedInitializer).not.toHaveBeenCalled();
  });

  it("initializes a new baseline only for a new route key", () => {
    const first = reconcileEditorSession(null, "entry-1", () => ({ revision: 1 }));
    const next = reconcileEditorSession(first, "entry-2", () => ({ revision: 3 }));

    expect(next).not.toBe(first);
    expect(next).toEqual({ key: "entry-2", initialValue: { revision: 3 } });
  });

  it("distinguishes a missing edit target from a new form", () => {
    expect(resolveEditorTarget(undefined, null)).toEqual({ kind: "CREATE", value: null });
    expect(resolveEditorTarget("entry-1", null)).toEqual({ kind: "MISSING" });
    expect(resolveEditorTarget("entry-1", { revision: 1 })).toEqual({
      kind: "EDIT",
      value: { revision: 1 },
    });
  });
});
