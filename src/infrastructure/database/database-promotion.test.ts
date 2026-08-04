import { describe, expect, it, vi } from "vitest";

import { promoteDatabaseCopy } from "@/infrastructure/database/database-promotion";

function lifecycle() {
  const calls: string[] = [];
  const step = (name: string) =>
    vi.fn(async () => {
      calls.push(name);
    });
  return {
    calls,
    cleanupLegacy: step("cleanup-legacy"),
    cleanupTemporary: step("cleanup-temporary"),
    moveTemporary: step("move-temporary"),
    prepareTemporary: step("prepare-temporary"),
    removeCurrent: step("remove-current"),
    verifyCurrent: step("verify-current"),
  };
}

describe("database promotion lifecycle", () => {
  it("keeps the current target and plaintext source when preparation fails", async () => {
    const actions = lifecycle();
    actions.prepareTemporary.mockRejectedValueOnce(new Error("copy failed"));

    await expect(promoteDatabaseCopy(actions)).rejects.toThrow("copy failed");

    expect(actions.removeCurrent).not.toHaveBeenCalled();
    expect(actions.cleanupLegacy).not.toHaveBeenCalled();
    expect(actions.cleanupTemporary).toHaveBeenCalledOnce();
  });

  it("removes plaintext only after the promoted target verifies", async () => {
    const actions = lifecycle();

    await promoteDatabaseCopy(actions);

    expect(actions.calls).toEqual([
      "prepare-temporary",
      "remove-current",
      "move-temporary",
      "verify-current",
      "cleanup-temporary",
      "cleanup-legacy",
    ]);
  });

  it("retains plaintext when promoted-target verification fails", async () => {
    const actions = lifecycle();
    actions.verifyCurrent.mockRejectedValueOnce(new Error("verify failed"));

    await expect(promoteDatabaseCopy(actions)).rejects.toThrow("verify failed");

    expect(actions.cleanupLegacy).not.toHaveBeenCalled();
    expect(actions.cleanupTemporary).toHaveBeenCalledOnce();
    expect(actions.removeCurrent).toHaveBeenCalledOnce();
  });

  it("does not touch the verified target when plaintext cleanup fails", async () => {
    const actions = lifecycle();
    actions.cleanupLegacy.mockRejectedValueOnce(new Error("cleanup failed"));

    await expect(promoteDatabaseCopy(actions)).rejects.toThrow("cleanup failed");

    expect(actions.removeCurrent).toHaveBeenCalledOnce();
    expect(actions.verifyCurrent).toHaveBeenCalledOnce();
    expect(actions.cleanupLegacy).toHaveBeenCalledOnce();
  });
});
