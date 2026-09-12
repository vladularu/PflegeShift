import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import * as Haptics from "expo-haptics";
import { deletionFeedback, planningModeFeedback } from "./haptics";

jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Soft: "soft" },
  impactAsync: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  notificationAsync: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

describe("calendar planning feedback", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("acknowledges deletion with one soft impact, not a notification pattern", () => {
    deletionFeedback();
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Soft);
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  it("uses a soft iOS impact, never a medium impact", () => {
    planningModeFeedback();
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Soft);
  });
});
