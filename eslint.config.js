// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
    rules: {
      // Providers hydrate local SQLite state and route-driven screens intentionally
      // reconcile state in effects. Keep these migration-safe patterns as warnings-free.
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);
