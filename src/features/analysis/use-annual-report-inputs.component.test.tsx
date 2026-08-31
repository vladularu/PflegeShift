import { renderHook } from "@testing-library/react-native";
import { describe, expect, it } from "@jest/globals";
import { StrictMode, type PropsWithChildren } from "react";

import type { CalendarEntry, MonthlyTariffDecision } from "@/domain/types";
import { useAnnualReportInputs } from "@/features/analysis/use-annual-report-inputs";

function appointment(id: string, date: string): CalendarEntry {
  return {
    id,
    kind: "APPOINTMENT",
    date,
    title: id,
    allDay: true,
    startTime: null,
    endTime: null,
    color: "#2F80ED",
    note: null,
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
  };
}

const DECISION: MonthlyTariffDecision = {
  month: "2026-08",
  allowanceStatus: "NONE",
  revision: 1,
  confirmedAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function StrictWrapper({ children }: PropsWithChildren) {
  return <StrictMode>{children}</StrictMode>;
}

describe("useAnnualReportInputs", () => {
  it("keeps committed identities stable in Strict Mode without render mutation", async () => {
    const relevant = appointment("relevant", "2026-08-04");
    const screen = await renderHook(
      ({ entries }: { readonly entries: readonly CalendarEntry[] }) =>
        useAnnualReportInputs(2026, entries, [DECISION]),
      {
        initialProps: { entries: [relevant] },
        wrapper: StrictWrapper,
      },
    );
    const first = screen.result.current;
    expect(first?.ok).toBe(true);
    if (first === null || !first.ok) throw new Error("Expected annual report inputs.");

    await screen.rerender({
      entries: [relevant, appointment("outside", "2030-01-01")],
    });
    expect(screen.result.current?.ok).toBe(true);
    if (screen.result.current === null || !screen.result.current.ok) {
      throw new Error("Expected annual report inputs.");
    }
    expect(screen.result.current.value).toBe(first.value);

    await screen.rerender({
      entries: [relevant, appointment("inside", "2026-09-01")],
    });
    expect(screen.result.current?.ok).toBe(true);
    if (screen.result.current === null || !screen.result.current.ok) {
      throw new Error("Expected annual report inputs.");
    }
    expect(screen.result.current.value).not.toBe(first.value);
    expect(screen.result.current.value.entries).toHaveLength(2);
  });
});
