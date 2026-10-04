import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { work } from "@/engine/remuneration-test-fixtures";
import { generateTestRun, restoreTestBackup, setDeveloperMode } from "./dev-tools-repository";
import { setupTvlShiftWork, type TvlShiftWorkFixture } from "./tvl-shift-work-test-fixtures";

describe("test laboratory month dependency order", () => {
  let f: TvlShiftWorkFixture;
  beforeEach(async () => {
    f = await setupTvlShiftWork();
    await setDeveloperMode(f.db, true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    f.adapter.database.close();
  });

  it("restores parents before later months without changing the requested list or original data", async () => {
    const original = f.adapter.database.prepare("SELECT * FROM shift_entries ORDER BY id").all();
    await generateTestRun(
      f.db,
      { startMonth: "2026-09", range: 3, scenario: "NORMAL_ROTATION" },
      work,
    );
    const queries = vi.spyOn(f.db, "getFirstAsync");
    const requested = Object.freeze(["2026-11", "2026-10", "2026-09"]);
    await restoreTestBackup(f.db, requested);
    expect(
      queries.mock.calls
        .filter(([sql]) => sql.includes("SELECT month,payload,run_id,created_at"))
        .map((args) => args[1]),
    ).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(requested).toEqual(["2026-11", "2026-10", "2026-09"]);
    expect(f.adapter.database.prepare("SELECT * FROM shift_entries ORDER BY id").all()).toEqual(
      original,
    );
    expect(await f.db.getFirstAsync("SELECT month FROM dev_test_backups")).toBeNull();
  });
});
