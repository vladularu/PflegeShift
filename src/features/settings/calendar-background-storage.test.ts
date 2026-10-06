import Database from "better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQLiteDatabase } from "expo-sqlite";
import {
  loadCalendarBackground,
  loadRemovedCalendarBackground,
  saveCalendarBackgroundChange,
  loadCalendarBackgroundStrength,
  saveCalendarBackgroundStrength,
  saveCalendarBackground,
  importCalendarBackground,
  deleteCalendarBackground,
} from "./calendar-background-storage";

const state = vi.hoisted(() => ({
  files: new Map<string, number>(),
  document: "file:///sandbox/Documents",
  resize: vi.fn(),
  release: vi.fn(),
  render: vi.fn(),
  save: vi.fn(),
  copy: vi.fn(),
}));
vi.mock("expo-file-system", () => {
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((part) => (typeof part === "string" ? part : part.uri)).join("/");
    }
    create() {}
  }
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((part) => (typeof part === "string" ? part : part.uri)).join("/");
    }
    get name() {
      return this.uri.slice(this.uri.lastIndexOf("/") + 1);
    }
    get parentDirectory() {
      return new Directory(this.uri.slice(0, this.uri.lastIndexOf("/")));
    }
    get exists() {
      return state.files.has(this.uri);
    }
    get size() {
      return state.files.get(this.uri) ?? 0;
    }
    async copy(file: File) {
      await state.copy();
      state.files.set(file.uri, this.size);
    }
    delete() {
      state.files.delete(this.uri);
    }
  }
  return {
    File,
    Directory,
    Paths: {
      get document() {
        return state.document;
      },
    },
  };
});
vi.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg" },
  ImageManipulator: {
    manipulate: () => ({ resize: state.resize, renderAsync: state.render, release: state.release }),
  },
}));
const get = vi.fn();
const run = vi.fn();
const db = { getFirstAsync: get, runAsync: run } as unknown as SQLiteDatabase;
const old = "file:///sandbox/Documents/calendar-backgrounds/calendar-old.jpg";

describe("calendar background storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.files.clear();
    state.document = "file:///sandbox/Documents";
    state.files.set(old, 100);
    state.files.set("file:///picked.jpg", 100);
    state.files.set("file:///cache.jpg", 50);
    state.copy.mockResolvedValue(undefined);
    state.save.mockResolvedValue({ uri: "file:///cache.jpg" });
    state.render.mockResolvedValue({ saveAsync: state.save, release: state.release });
    get.mockResolvedValue({ value: "calendar-old.jpg" });
    run.mockResolvedValue(undefined);
  });
  it.each(["subtle", "medium", "strong"] as const)(
    "persists and loads image strength %s independently of the image pointer",
    async (strength) => {
      await saveCalendarBackgroundStrength(db, strength);
      expect(run.mock.calls[0].slice(1, 3)).toEqual(["calendar_background_strength", strength]);
      get.mockResolvedValue({ value: strength });
      expect(await loadCalendarBackgroundStrength(db)).toBe(strength);
      expect(get).toHaveBeenCalledWith(
        "SELECT value FROM app_preferences WHERE key=?",
        "calendar_background_strength",
      );
    },
  );
  it.each([null, { value: "unknown" }, { value: "" }, { value: "calendar-old.jpg" }])(
    "uses medium for missing or invalid strength %j",
    async (row) => {
      get.mockResolvedValue(row);
      expect(await loadCalendarBackgroundStrength(db)).toBe("medium");
    },
  );
  it("rejects invalid image strength before writing", async () => {
    // @ts-expect-error Exercise validation of malformed runtime input.
    await expect(saveCalendarBackgroundStrength(db, "invalid")).rejects.toThrow(
      "Ungültige Bildstärke",
    );
    expect(run).not.toHaveBeenCalled();
  });
  it("stores a relative name and resolves it against the current sandbox after relocation", async () => {
    await saveCalendarBackground(db, old);
    expect(run.mock.calls[0].slice(1, 3)).toEqual([
      "calendar_background_image",
      "calendar-old.jpg",
    ]);
    state.document = "file:///new-sandbox/Documents";
    const relocated = `${state.document}/calendar-backgrounds/calendar-old.jpg`;
    state.files.set(relocated, 100);
    expect(await loadCalendarBackground(db)).toBe(relocated);
  });
  it.each([
    null,
    { value: "../secret.jpg" },
    { value: "file:///secret.jpg" },
    { value: "calendar-missing.jpg" },
  ])("falls back to the standard for missing or unsafe references: %j", async (row) => {
    get.mockResolvedValue(row);
    expect(await loadCalendarBackground(db)).toBeNull();
  });
  it("rejects pointers outside the managed directory and does not delete unrelated images", async () => {
    await expect(saveCalendarBackground(db, "file:///picked.jpg")).rejects.toThrow();
    deleteCalendarBackground("file:///picked.jpg");
    expect(state.files.has("file:///picked.jpg")).toBe(true);
    expect(run).not.toHaveBeenCalled();
  });
  it("resizes a large landscape image, persists a JPEG copy and removes only the generated temporary file", async () => {
    const uri = await importCalendarBackground({
      uri: "file:///picked.jpg",
      width: 4000,
      height: 3000,
    });
    expect(state.resize).toHaveBeenCalledWith({ width: 1600 });
    expect(state.save).toHaveBeenCalledWith({ format: "jpeg", compress: 0.8 });
    expect(state.files.has(uri)).toBe(true);
    expect(state.files.has("file:///cache.jpg")).toBe(false);
    expect(state.files.has("file:///picked.jpg")).toBe(true);
  });
  it("waits for the native copy before cleanup and saving the selected background", async () => {
    let finishCopy!: () => void;
    state.copy.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishCopy = resolve;
      }),
    );
    let finished = false;
    const importing = importCalendarBackground({
      uri: "file:///picked.jpg",
      width: 4000,
      height: 3000,
    }).then((uri) => {
      finished = true;
      return uri;
    });
    try {
      await vi.waitFor(() => expect(state.copy).toHaveBeenCalled());
      expect(finished).toBe(false);
      expect(state.files.has("file:///cache.jpg")).toBe(true);
      expect(state.release).not.toHaveBeenCalled();
    } finally {
      finishCopy();
      await importing;
    }
    const uri = await importing;
    expect(state.files.get(uri)).toBe(50);
    expect(state.files.has("file:///cache.jpg")).toBe(false);
    await saveCalendarBackground(db, uri);
    expect(run.mock.calls[0][2]).toBe(uri.slice(uri.lastIndexOf("/") + 1));
    expect(state.files.has(old)).toBe(true);
  });
  it("propagates asynchronous copy failures and keeps the existing background", async () => {
    state.copy.mockRejectedValueOnce(new Error("Synthetic native copy failure"));
    await expect(
      importCalendarBackground({
        uri: "file:///picked.jpg",
        width: 300,
        height: 400,
      }),
    ).rejects.toThrow("Synthetic native copy failure");
    expect(state.files.has(old)).toBe(true);
    expect(state.files.has("file:///cache.jpg")).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });
  it("bounds portrait dimensions and avoids upscaling small images", async () => {
    await importCalendarBackground({ uri: "file:///picked.jpg", width: 3000, height: 4000 });
    expect(state.resize).toHaveBeenCalledWith({ height: 1600 });
    state.resize.mockClear();
    state.files.set("file:///cache.jpg", 50);
    await importCalendarBackground({ uri: "file:///picked.jpg", width: 300, height: 400 });
    expect(state.resize).not.toHaveBeenCalled();
  });
  it("rejects oversized inputs and invalid dimensions before decoding", async () => {
    state.files.set("file:///picked.jpg", 21 * 1024 * 1024);
    await expect(
      importCalendarBackground({ uri: "file:///picked.jpg", width: 100, height: 100 }),
    ).rejects.toThrow(/20 MB/);
    state.files.set("file:///picked.jpg", 100);
    await expect(
      importCalendarBackground({ uri: "file:///picked.jpg", width: NaN, height: 0 }),
    ).rejects.toThrow();
    expect(state.render).not.toHaveBeenCalled();
  });
});

describe("calendar photo transactions on SQLite", () => {
  function openDatabase() {
    const raw = new Database(":memory:");
    raw.exec(
      "CREATE TABLE app_preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)",
    );
    const insert = raw.prepare("INSERT INTO app_preferences VALUES (?, ?, '2026-10-06')");
    for (const [key, value] of [
      ["calendar_background_image", "calendar-old.jpg"],
      ["calendar_background_strength", "strong"],
      ["appearance_mode", "dark"],
      ["appearance_theme", "standard"],
      ["salary-sentinel", "preserve-me"],
    ])
      insert.run(key, value);
    let failUndo = false;
    const db = {
      execAsync: async (sql: string) => {
        raw.exec(sql);
      },
      runAsync: async (sql: string, ...params: unknown[]) => {
        if (failUndo && params[0] === "calendar_background_removed_image")
          throw new Error("Synthetic undo write failure");
        return raw.prepare(sql).run(...params);
      },
      getFirstAsync: async (sql: string, ...params: unknown[]) =>
        raw.prepare(sql).get(...params) ?? null,
    } as unknown as SQLiteDatabase;
    const value = (key: string) =>
      (
        raw.prepare("SELECT value FROM app_preferences WHERE key=?").get(key) as
          { value: string } | undefined
      )?.value;
    state.document = "file:///sandbox/Documents";
    state.files.set(old, 100);
    return {
      raw,
      db,
      value,
      fail: () => {
        failUndo = true;
      },
    };
  }
  it("removes and restores the same relative photo without changing mode, strength or unrelated data", async () => {
    const { raw, db, value } = openDatabase();
    try {
      await saveCalendarBackgroundChange(db, null, old);
      expect(value("calendar_background_image")).toBeUndefined();
      expect(value("calendar_background_removed_image")).toBe("calendar-old.jpg");
      expect(await loadRemovedCalendarBackground(db)).toBe(old);
      expect(value("calendar_background_strength")).toBe("strong");
      expect(value("appearance_mode")).toBe("dark");
      expect(value("salary-sentinel")).toBe("preserve-me");
      await saveCalendarBackgroundChange(db, old, null);
      expect(await loadCalendarBackground(db)).toBe(old);
      expect(value("calendar_background_removed_image")).toBeUndefined();
      expect(state.files.has(old)).toBe(true);
    } finally {
      raw.close();
    }
  });
  it("rolls both pointers back if the second write fails", async () => {
    const { raw, db, value, fail } = openDatabase();
    try {
      fail();
      await expect(saveCalendarBackgroundChange(db, null, old)).rejects.toThrow(
        "Synthetic undo write failure",
      );
      expect(value("calendar_background_image")).toBe("calendar-old.jpg");
      expect(value("calendar_background_removed_image")).toBeUndefined();
      expect(value("calendar_background_strength")).toBe("strong");
      expect(state.files.has(old)).toBe(true);
    } finally {
      raw.close();
    }
  });
  it("loads existing installations without an undo key without migrating or deleting anything", async () => {
    const { raw, db, value } = openDatabase();
    try {
      expect(await loadRemovedCalendarBackground(db)).toBeNull();
      expect(await loadCalendarBackground(db)).toBe(old);
      expect(await loadCalendarBackgroundStrength(db)).toBe("strong");
      expect(value("appearance_mode")).toBe("dark");
      expect(raw.prepare("SELECT count(*) AS count FROM app_preferences").get()).toEqual({
        count: 5,
      });
    } finally {
      raw.close();
    }
  });
  it("resets only the background keys and strength while preserving other preferences", async () => {
    const { raw, db, value } = openDatabase();
    try {
      await saveCalendarBackgroundChange(db, null, null, true);
      expect(value("calendar_background_image")).toBeUndefined();
      expect(value("calendar_background_removed_image")).toBeUndefined();
      expect(value("calendar_background_strength")).toBe("medium");
      expect(value("salary-sentinel")).toBe("preserve-me");
      expect(value("appearance_mode")).toBe("dark");
      expect(value("appearance_theme")).toBe("standard");
    } finally {
      raw.close();
    }
  });
});
