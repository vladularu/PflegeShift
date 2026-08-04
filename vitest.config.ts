import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: [
        "src/domain/{errors,validation}.ts",
        "src/engine/**/*.ts",
        "src/features/**/*.ts",
        "src/infrastructure/database/*.ts",
        "src/infrastructure/{dev-tools-policy,diagnostics}.ts",
        "src/navigation/{route-params,routes}.ts",
        "src/theme/color-contrast.ts",
      ],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.native.ts",
        "src/**/*.web.ts",
        "src/features/**/use-*.ts",
      ],
      thresholds: {
        branches: 70,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
