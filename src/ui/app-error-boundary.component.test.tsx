import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { clearDiagnosticEvents, listDiagnosticEvents } from "@/infrastructure/diagnostics";
import { AppErrorBoundary } from "@/ui/app-error-boundary";

let shouldThrow = true;

function RecoverableChild() {
  if (shouldThrow) throw new Error("sensitive database path");
  return null;
}

describe("AppErrorBoundary", () => {
  beforeEach(clearDiagnosticEvents);

  it("masks render errors and can retry", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    shouldThrow = true;
    const screen = await render(
      <AppErrorBoundary>
        <RecoverableChild />
      </AppErrorBoundary>,
    );

    expect(screen.queryByText(/sensitive database path/i)).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "PflegeShift konnte nicht angezeigt werden",
    );
    expect(screen.getByText("Diagnosecode: APP_RENDER_FAILED")).toBeTruthy();
    expect(listDiagnosticEvents()).toEqual([
      expect.objectContaining({ code: "APP_RENDER_FAILED", errorClass: "Error" }),
    ]);
    expect(JSON.stringify(listDiagnosticEvents())).not.toContain("sensitive database path");

    shouldThrow = false;
    await fireEvent.press(screen.getByRole("button", { name: "Erneut versuchen" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.queryByText("Diagnosecode: APP_RENDER_FAILED")).toBeNull();
  });
});
