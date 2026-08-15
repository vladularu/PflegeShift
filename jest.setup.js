jest.mock("react-native-worklets", () => require("react-native-worklets/lib/module/mock"));
jest.mock("expo-notifications", () => ({
  SchedulableTriggerInputTypes: { DATE: "date" },
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  scheduleNotificationAsync: jest.fn().mockResolvedValue("test-notification-id"),
  setNotificationHandler: jest.fn(),
}));

require("react-native-reanimated").setUpTests();
