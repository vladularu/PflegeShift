import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { Pressable, Text } from "react-native";
import { TrainingProvider, useTrainingData, TRAINING_LOAD_ERROR } from "./training-provider";
import type { TrainingRepositoryPort } from "./training-ports";
import type { SavedTrainingProfile, TrainingSnapshot } from "@/domain/training-data";

const saved: SavedTrainingProfile = {
  data: {
    version: 1,
    effectiveFrom: "2026-09-01",
    birthDate: null,
    fullTimeCompulsorySchooling: null,
    status: "unknown",
    training: null,
  },
  revision: 1,
  updatedAt: "2026-09-01T00:00:00Z",
};
const empty: TrainingSnapshot = { profiles: [], shifts: [] };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function ports() {
  return {
    repository: {
      loadSnapshot: jest.fn<TrainingRepositoryPort["loadSnapshot"]>().mockResolvedValue(empty),
      saveProfile: jest.fn<TrainingRepositoryPort["saveProfile"]>().mockResolvedValue(saved),
      saveShift: jest.fn<TrainingRepositoryPort["saveShift"]>(),
    },
    diagnostics: { record: jest.fn() },
  };
}
function Harness({
  done = () => {},
  failed = () => {},
}: {
  done?: (value: SavedTrainingProfile) => void;
  failed?: (error: unknown) => void;
}) {
  const value = useTrainingData();
  return (
    <>
      <Text testID="state">
        {JSON.stringify({ status: value.status, profiles: value.profiles, error: value.error })}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Reload"
        onPress={() => void value.reload()}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Save"
        onPress={() =>
          void value.saveProfile({ data: saved.data, expectedRevision: 0 }).then(done, failed)
        }
      />
    </>
  );
}
describe("training snapshot lifecycle", () => {
  it("loads and reloads on root data changes", async () => {
    const p = ports();
    const ui = await render(
      <TrainingProvider {...p} reloadRevision={0}>
        <Harness />
      </TrainingProvider>,
    );
    await waitFor(() => expect(ui.getByTestId("state").props.children).toContain('"ready"'));
    p.repository.loadSnapshot.mockResolvedValue({ profiles: [saved], shifts: [] });
    await ui.rerender(
      <TrainingProvider {...p} reloadRevision={1}>
        <Harness />
      </TrainingProvider>,
    );
    await waitFor(() => expect(ui.getByTestId("state").props.children).toContain("2026-09-01"));
  });
  it("never publishes an older outstanding read", async () => {
    const old = deferred<TrainingSnapshot>(),
      latest = deferred<TrainingSnapshot>();
    const p = ports();
    p.repository.loadSnapshot.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    const ui = await render(
      <TrainingProvider {...p} reloadRevision={0}>
        <Harness />
      </TrainingProvider>,
    );
    await fireEvent.press(ui.getByRole("button", { name: "Reload" }));
    await act(async () => latest.resolve({ profiles: [saved], shifts: [] }));
    await act(async () => old.resolve(empty));
    expect(ui.getByTestId("state").props.children).toContain("2026-09-01");
  });
  it("does not leak old database responses after repository replacement", async () => {
    const old = deferred<TrainingSnapshot>(),
      p = ports(),
      next = ports();
    p.repository.loadSnapshot.mockReturnValue(old.promise);
    const ui = await render(
      <TrainingProvider {...p} reloadRevision={0}>
        <Harness />
      </TrainingProvider>,
    );
    await ui.rerender(
      <TrainingProvider {...next} reloadRevision={0}>
        <Harness />
      </TrainingProvider>,
    );
    await act(async () => old.resolve({ profiles: [saved], shifts: [] }));
    await waitFor(() => expect(ui.getByTestId("state").props.children).toContain('"ready"'));
    expect(ui.getByTestId("state").props.children).not.toContain("2026-09-01");
  });
  it("redacts database failures and supports retry", async () => {
    const p = ports();
    p.repository.loadSnapshot.mockRejectedValueOnce(new Error("birthDate=2009-03-14"));
    const ui = await render(
      <TrainingProvider {...p} reloadRevision={0}>
        <Harness />
      </TrainingProvider>,
    );
    await waitFor(() =>
      expect(ui.getByTestId("state").props.children).toContain(TRAINING_LOAD_ERROR),
    );
    expect(p.diagnostics.record).toHaveBeenCalledWith(
      "provider",
      "TRAINING_LOAD_FAILED",
      new Error(TRAINING_LOAD_ERROR),
    );
    await fireEvent.press(ui.getByRole("button", { name: "Reload" }));
    await waitFor(() => expect(ui.getByTestId("state").props.children).toContain('"ready"'));
  });
  it("reports a committed write as successful even when the read afterwards fails", async () => {
    const p = ports(),
      done = jest.fn(),
      failed = jest.fn();
    const ui = await render(
      <TrainingProvider {...p} reloadRevision={0}>
        <Harness done={done} failed={failed} />
      </TrainingProvider>,
    );
    await waitFor(() => expect(ui.getByTestId("state").props.children).toContain('"ready"'));
    p.repository.loadSnapshot.mockRejectedValueOnce(new Error("read failed"));
    await fireEvent.press(ui.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(done).toHaveBeenCalledWith(saved));
    expect(failed).not.toHaveBeenCalled();
    expect(ui.getByTestId("state").props.children).toContain('"error"');
  });
  it("defers reads while writing and propagates genuine write errors", async () => {
    const p = ports(),
      write = deferred<SavedTrainingProfile>(),
      failed = jest.fn();
    const ui = await render(
      <TrainingProvider {...p} reloadRevision={0}>
        <Harness failed={failed} />
      </TrainingProvider>,
    );
    await waitFor(() => expect(ui.getByTestId("state").props.children).toContain('"ready"'));
    p.repository.saveProfile.mockReturnValue(write.promise);
    await fireEvent.press(ui.getByRole("button", { name: "Save" }));
    await fireEvent.press(ui.getByRole("button", { name: "Reload" }));
    expect(p.repository.loadSnapshot).toHaveBeenCalledTimes(1);
    await act(async () => write.reject(new Error("conflict")));
    await waitFor(() => expect(failed).toHaveBeenCalledWith(new Error("conflict")));
    expect(p.repository.loadSnapshot).toHaveBeenCalledTimes(2);
  });
});
