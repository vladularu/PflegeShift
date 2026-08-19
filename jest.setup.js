jest.mock("react-native-worklets", () => require("react-native-worklets/lib/module/mock"));
jest.mock("expo-notifications", () => ({
  IosAuthorizationStatus: {
    NOT_DETERMINED: 0,
    DENIED: 1,
    AUTHORIZED: 2,
    PROVISIONAL: 3,
    EPHEMERAL: 4,
  },
  SchedulableTriggerInputTypes: { DATE: "date" },
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  scheduleNotificationAsync: jest.fn().mockResolvedValue("test-notification-id"),
  setNotificationHandler: jest.fn(),
}));

require("react-native-reanimated").setUpTests();
