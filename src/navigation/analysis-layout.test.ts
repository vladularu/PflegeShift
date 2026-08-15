import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("analysis native header", () => {
  it("keeps the fixed Stunden/Gehalt selector below the iOS header", () => {
    const source = readFileSync(
      join(process.cwd(), "app", "(tabs)", "(analysis)", "_layout.tsx"),
      "utf8",
    );

    expect(source).toContain("headerLargeTitle: false");
    expect(source).not.toContain("headerLargeTitle: true");
  });
});
