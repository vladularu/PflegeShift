/** @type {Record<string, { branches: number, functions: number, lines: number, statements: number }>} */
const componentCoverageThresholds = {
  "src/application/pflegeshift-provider.tsx": {
    branches: 20,
    functions: 29,
    lines: 51,
    statements: 48,
  },
  "src/features/analysis/analysis-overview-cards.tsx": {
    branches: 68,
    functions: 95,
    lines: 98,
    statements: 96,
  },
  "src/features/calendar/month-card.tsx": {
    branches: 69,
    functions: 78,
    lines: 80,
    statements: 80,
  },
  "src/features/day-editor/day-editor-form.tsx": {
    branches: 53,
    functions: 25,
    lines: 54,
    statements: 50,
  },
  "src/features/day-editor/shift-edit-overlay.tsx": {
    branches: 77,
    functions: 95,
    lines: 83,
    statements: 83,
  },
  "src/features/day-editor/shift-notification-overlay.tsx": {
    branches: 78,
    functions: 92,
    lines: 93,
    statements: 89,
  },
  "src/features/templates/template-editor-screen.tsx": {
    branches: 55,
    functions: 52,
    lines: 63,
    statements: 60,
  },
  "src/ui/pause-wheel.tsx": {
    branches: 91,
    functions: 100,
    lines: 100,
    statements: 100,
  },
};

/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  clearMocks: true,
  restoreMocks: true,
  collectCoverageFrom: Object.keys(componentCoverageThresholds),
  coverageDirectory: "<rootDir>/coverage/components",
  coverageReporters: ["text", "json-summary"],
  coverageThreshold: componentCoverageThresholds,
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^@expo/vector-icons/Ionicons$": "<rootDir>/src/testing/ionicons-mock.tsx",
    "^@expo/vector-icons/MaterialCommunityIcons$": "<rootDir>/src/testing/ionicons-mock.tsx",
    "^react-native-maps$": "<rootDir>/src/testing/react-native-maps-mock.tsx",
  },
  testMatch: ["<rootDir>/src/**/*.component.test.tsx"],
};
