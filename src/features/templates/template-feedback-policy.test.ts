import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("template action feedback", () => {
  it.each(["template-editor-screen.tsx", "templates-manager-screen.tsx"])(
    "keeps %s free of action snackbars",
    (file) => {
      const source = readFileSync(
        join(process.cwd(), "src", "features", "templates", file),
        "utf8",
      );

      expect(source).not.toContain("useFeedback");
      expect(source).not.toContain("showFeedback");
      expect(source).not.toContain("Vorlage gelöscht.");
    },
  );
});
