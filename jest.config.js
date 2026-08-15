/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  clearMocks: true,
  restoreMocks: true,
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^@expo/vector-icons/Ionicons$": "<rootDir>/src/testing/ionicons-mock.tsx",
    "^@expo/vector-icons/MaterialCommunityIcons$": "<rootDir>/src/testing/ionicons-mock.tsx",
    "^react-native-maps$": "<rootDir>/src/testing/react-native-maps-mock.tsx",
  },
  testMatch: ["<rootDir>/src/**/*.component.test.tsx"],
};
